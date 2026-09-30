// api/analyze.js - Vercel Serverless Function using Groq API (groq.com)

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const GROQ_MODELS = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "llama-3.2-90b-vision-preview",
  "llama-3.2-11b-vision-preview"
];

const ANALYSIS_PROMPT = [
  "You are an expert agricultural plant pathologist. Analyze this farm/crop image carefully.",
  "Return ONLY valid JSON with no markdown, no extra text. Use this exact structure:",
  '{',
  '  "overall_health": "healthy or stressed or diseased or severely_diseased",',
  '  "disease_name": "Specific disease name or None detected",',
  '  "confidence": 0.95,',
  '  "severity": 0,',
  '  "affected_region": "none or top-left or top-center or top-right or center-left or center or center-right or bottom-left or bottom-center or bottom-right or widespread",',
  '  "affected_percentage": 0,',
  '  "crop_type": "Detected crop type or Unknown",',
  '  "symptoms": ["List symptoms you actually see"],',
  '  "treatment": ["Treatment step 1", "Treatment step 2"],',
  '  "prevention": ["Prevention tip 1"],',
  '  "spoilage_level": "none or minimal or moderate or severe",',
  '  "urgency": "none or low or medium or high or critical",',
  '  "additional_issues": ["Other observations"],',
  '  "heatmap_zones": {',
  '    "top_left": 5, "top_center": 5, "top_right": 5,',
  '    "mid_left": 5, "mid_center": 5, "mid_right": 5,',
  '    "bot_left": 5, "bot_center": 5, "bot_right": 5',
  '  }',
  '}',
  "heatmap_zones: 0=healthy, 100=critical disease. Set values based on what you actually see in the image."
].join("\n");

function buildPayload(model, imageBase64, mimeType) {
  return {
    model: model,
    messages: [{
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: "data:" + mimeType + ";base64," + imageBase64 }
        },
        {
          type: "text",
          text: ANALYSIS_PROMPT
        }
      ]
    }],
    max_tokens: 1200,
    temperature: 0.1
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    return res.status(200).json({
      status: "ok",
      provider: "Groq",
      models: GROQ_MODELS,
      hasEnvKey: !!process.env.GROQ_API_KEY
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const imageBase64 = body.imageBase64;
    const mimeType = body.mimeType || "image/jpeg";
    const apiKey = body.apiKey;
    const key = apiKey || process.env.GROQ_API_KEY;

    if (!key) {
      return res.status(400).json({
        error: "No API key provided. Add your Groq API key (starts with gsk_) from console.groq.com in the Settings page."
      });
    }
    if (!imageBase64) {
      return res.status(400).json({
        error: "No image captured. Select a camera and make sure the feed is active."
      });
    }

    let lastError = "";
    let responseData = null;

    for (var i = 0; i < GROQ_MODELS.length; i++) {
      var model = GROQ_MODELS[i];
      try {
        var resp = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + key
          },
          body: JSON.stringify(buildPayload(model, imageBase64, mimeType))
        });

        var text = await resp.text();

        if (!resp.ok) {
          if (
            text.indexOf("not found") !== -1 ||
            text.indexOf("model_not_found") !== -1 ||
            text.indexOf("does not exist") !== -1 ||
            resp.status === 404
          ) {
            lastError = "Model " + model + " unavailable";
            continue;
          }
          return res.status(resp.status).json({
            error: "Groq API error (" + resp.status + "): " + text.substring(0, 400)
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
        error: "No working Groq vision model found. " + lastError + ". Check your API key at console.groq.com"
      });
    }

    var rawContent = "{}";
    if (
      responseData.choices &&
      responseData.choices[0] &&
      responseData.choices[0].message
    ) {
      rawContent = responseData.choices[0].message.content || "{}";
    }

    var parsed;
    try {
      var jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawContent);
    } catch (e) {
      parsed = { error: "AI response parse error", raw: rawContent.substring(0, 300) };
    }

    return res.status(200).json({
      result: parsed,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: err.message });
  }
};
