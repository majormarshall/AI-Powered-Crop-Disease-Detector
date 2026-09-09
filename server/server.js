require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const { spawnRTSPStream, stopStream } = require("./cameraProxy");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 });

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "../public")));

const GROK_API_KEY = process.env.GROK_API_KEY || "";
const GROK_API_URL = "https://api.x.ai/v1/chat/completions";

// Active RTSP streams: { socketId -> { cameraId -> ffmpegProcess } }
const activeStreams = {};

// -- Grok Vision analysis endpoint ------------------------------------------
app.post("/api/analyze", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg", apiKey } = req.body;
    const key = apiKey || GROK_API_KEY;
    if (!key) return res.status(400).json({ error: "No Grok API key provided." });
    if (!imageBase64) return res.status(400).json({ error: "No image data." });

    const payload = {
      model: "grok-2-vision-1212",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageBase64}` }
            },
            {
              type: "text",
              text: `You are an expert agricultural plant pathologist and crop disease specialist. Analyze this farm/crop image carefully.

Return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{
  "overall_health": "healthy|stressed|diseased|severely_diseased",
  "disease_name": "Name or 'None detected'",
  "confidence": 0.0-1.0,
  "severity": 0-5,
  "affected_region": "none|top-left|top-center|top-right|center-left|center|center-right|bottom-left|bottom-center|bottom-right|widespread",
  "affected_percentage": 0-100,
  "crop_type": "Detected crop type or 'Unknown'",
  "symptoms": ["symptom1", "symptom2"],
  "treatment": ["step1", "step2", "step3"],
  "prevention": ["tip1", "tip2"],
  "spoilage_level": "none|minimal|moderate|severe",
  "urgency": "none|low|medium|high|critical",
  "additional_issues": ["any other observations"],
  "heatmap_zones": {
    "top_left": 0-100,
    "top_center": 0-100,
    "top_right": 0-100,
    "mid_left": 0-100,
    "mid_center": 0-100,
    "mid_right": 0-100,
    "bot_left": 0-100,
    "bot_center": 0-100,
    "bot_right": 0-100
  }
}

heatmap_zones: each zone = risk score 0 (healthy) to 100 (critical disease). Be precise based on what you see.`
            }
          ]
        }
      ],
      max_tokens: 1024,
      temperature: 0.1
    };

    const fetch = require("node-fetch");
    const response = await fetch(GROK_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawContent);
    } catch {
      parsed = { error: "Parse error", raw: rawContent };
    }

    res.json({ result: parsed, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("Analyze error:", err);
    res.status(500).json({ error: err.message });
  }
});

// -- Socket.io: RTSP stream relay --------------------------------------------
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  activeStreams[socket.id] = {};

  socket.on("start-rtsp", ({ cameraId, rtspUrl }) => {
    console.log(`Starting RTSP for cam ${cameraId}: ${rtspUrl}`);
    const proc = spawnRTSPStream(rtspUrl, (frameBuffer) => {
      socket.emit("rtsp-frame", { cameraId, frame: frameBuffer.toString("base64") });
    }, (err) => {
      socket.emit("rtsp-error", { cameraId, error: err });
    });
    if (proc) activeStreams[socket.id][cameraId] = proc;
  });

  socket.on("stop-rtsp", ({ cameraId }) => {
    const proc = activeStreams[socket.id]?.[cameraId];
    if (proc) { stopStream(proc); delete activeStreams[socket.id][cameraId]; }
  });

  socket.on("disconnect", () => {
    const streams = activeStreams[socket.id] || {};
    Object.values(streams).forEach(proc => stopStream(proc));
    delete activeStreams[socket.id];
    console.log("Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n?? Crop Disease Detector running at http://localhost:${PORT}`);
  console.log(`?? Grok API: ${GROK_API_KEY ? "Key loaded from .env" : "No key in .env - use UI to enter key"}`);
  console.log(`?? RTSP support: FFmpeg required for RTSP streams\n`);
});
