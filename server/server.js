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

// Model priority list — newer multimodal models first, fallback to older vision ones
const GROK_MODELS = ["grok-4", "grok-4.5", "grok-2-vision", "grok-vision-beta"];

// Active RTSP streams: { socketId -> { cameraId -> ffmpegProcess } }
const activeStreams = {};

function buildPayload(model, imageBase64, mimeType) {
  return {
    model,
    messages: [{
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${imageBase64}` }
        },
        {
          type: "text",
          text: `You are an expert agricultural plant pathologist. Analyze this farm/crop image.

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
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
    "top_left": 0-100, "top_center": 0-100, "top_right": 0-100,
    "mid_left": 0-100, "mid_center": 0-100, "mid_right": 0-100,
    "bot_left": 0-100, "bot_center": 0-100, "bot_right": 0-100
  }
}
heatmap_zones values: 0=healthy, 100=critical disease. Be precise.`
        }
      ]
    }],
    max_tokens: 1200,
    temperature: 0.1
  };
}

// ── /api/analyze — Grok Vision ──────────────────────────────────────────────
app.post("/api/analyze", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg", apiKey } = req.body;
    const key = apiKey || GROK_API_KEY;

    if (!key) return res.status(400).json({
      error: "No Grok API key provided. Go to Settings and add your key from console.x.ai"
    });
    if (!imageBase64) return res.status(400).json({
      error: "No image captured. Make sure your camera is running and selected."
    });

    // Use native fetch (Node 18+), fall back to node-fetch for older Node
    const fetchFn = typeof fetch !== "undefined" ? fetch : require("node-fetch");

    let lastError = "";
    let responseData = null;

    for (const model of GROK_MODELS) {
      try {
        console.log(`[Grok] Trying model: ${model}`);
        const resp = await fetchFn(GROK_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`
          },
          body: JSON.stringify(buildPayload(model, imageBase64, mimeType))
        });

        const text = await resp.text();

        if (!resp.ok) {
          // Model not found — try next
          if (text.includes("not found") || text.includes("invalid-argument") ||
              text.includes("Model not found") || resp.status === 404) {
            console.warn(`[Grok] Model "${model}" not available, trying next...`);
            lastError = `Model "${model}" not available`;
            continue;
          }
          // Likely auth error — stop immediately
          return res.status(resp.status).json({
            error: `Grok API error (${resp.status}): ${text.substring(0, 400)}`
          });
        }

        responseData = JSON.parse(text);
        console.log(`[Grok] Success with: ${model}`);
        break;

      } catch (e) {
        lastError = e.message;
        console.warn(`[Grok] "${model}" threw: ${e.message}`);
        continue;
      }
    }

    if (!responseData) {
      return res.status(503).json({
        error: `No working Grok model found. Last error: ${lastError}. Verify your API key has vision access at console.x.ai`
      });
    }

    const rawContent = responseData.choices?.[0]?.message?.content || "{}";
    let parsed;
    try {
      const match = rawContent.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : rawContent);
    } catch {
      parsed = { error: "AI response parse error", raw: rawContent.substring(0, 400) };
    }

    res.json({ result: parsed, timestamp: new Date().toISOString() });

  } catch (err) {
    console.error("Analyze error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Health check endpoint ────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", models: GROK_MODELS, hasKey: !!GROK_API_KEY });
});

// ── Socket.io: RTSP relay ────────────────────────────────────────────────────
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

// ── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🌿 CropGuard AI running at http://localhost:${PORT}`);
  console.log(`🤖 Grok models: ${GROK_MODELS.join(", ")}`);
  console.log(`🔑 API Key: ${GROK_API_KEY ? "Loaded from .env" : "Not set — use Settings UI"}`);
  console.log(`📡 RTSP: FFmpeg required for CCTV streams\n`);
});
