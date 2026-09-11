// api/analyze.js — Vercel Serverless Function for Grok Vision AI
// This replaces the Express server for Vercel deployment

const GROK_API_URL = "https://api.x.ai/v1/chat/completions";

// Grok model priority list (newest first, with fallbacks)
const GROK_MODELS = ["grok-4", "grok-4.5", "grok-2-vision", "grok-vision-beta"];

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
heatmap_zones values: 0=healthy, 100=critical disease. Be precise based on what you see.`
        }
      ]
    }],
    max_tokens: 1200,
    temperature: 0.1
  };
}

export default async function handler(req, res) {
  // Handle CORS preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageBase64, mimeType = "image/jpeg", apiKey } = req.body;

    // API key: from request body (client-side) or Vercel env variable
    const key = apiKey || process.env.GROK_API_KEY;

    if (!key) {
      return res.status(400).json({
        error: "No Grok API key provided. Go to Settings and paste your key from console.x.ai"
      });
    }
    if (!imageBase64) {
      return res.status(400).json({
        error: "No image captured. Make sure your camera feed is active."
      });
    }

    let lastError = "";
    let responseData = null;

    // Try each Grok model in order until one works
    for (const model of GROK_MODELS) {
      try {
        const resp = await fetch(GROK_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`
          },
          body: JSON.stringify(buildPayload(model, imageBase64, mimeType))
        });

        const text = await resp.text();

        if (!resp.ok) {
          if (
            text.includes("not found") ||
            text.includes("invalid-argument") ||
            text.includes("Model not found") ||
            resp.status === 404
          ) {
            lastError = `Model "${model}" not available`;
            continue;
          }
          // Auth or other fatal error — stop immediately
          return res.status(resp.status).json({
            error: `Grok API error (${resp.status}): ${text.substring(0, 400)}`
          });
        }

        responseData = JSON.parse(text);
        break;

      } catch (e) {
        lastError = e.message;
        continue;
      }
    }

    if (!responseData) {
      return res.status(503).json({
        error: `No working Grok model found. ${lastError}. Check your API key at console.x.ai`
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

    return res.status(200).json({
      result: parsed,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
