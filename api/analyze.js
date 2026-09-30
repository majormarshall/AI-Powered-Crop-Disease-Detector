// api/analyze.js - Vercel Serverless Function using OpenRouter API
// OpenRouter gives access to Gemini, Claude, GPT-4o, Llama and more from one key

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Vision-capable models on OpenRouter in priority order (best → fallback)
const MODELS = [
  "google/gemini-2.0-flash-exp:free",
  "google/gemini-flash-1.5",
  "qwen/qwen-2.5-vl-72b-instruct",
  "meta-llama/llama-3.2-90b-vision-instruct",
  "anthropic/claude-3-haiku",
  "openai/gpt-4o-mini"
];

const ANALYSIS_PROMPT = [
  "You are an expert agricultural plant pathologist and crop disease specialist.",
  "Carefully analyze this farm/crop image for disease, spoilage, and health indicators.",
  "",
  "Return ONLY valid JSON with no markdown fences, no extra text. Use this exact structure:",
  "{",
  "  \"overall_health\": \"healthy or stressed or diseased or severely_diseased\",",
  "  \"disease_name\": \"Specific disease name or None detected\",",
  "  \"confidence\": 0.95,",
  "  \"severity\": 0,",
  "  \"affected_region\": \"none or top-left or top-center or top-right or center-left or center or center-right or bottom-left or bottom-center or bottom-right or widespread\",",
  "  \"affected_percentage\": 0,",
  "  \"crop_type\": \"Detected crop type or Unknown\",",
  "  \"symptoms\": [\"Describe symptoms you actually observe in the image\"],",
  "  \"treatment\": [\"Specific treatment step 1\", \"Specific treatment step 2\", \"Step 3\"],",
  "  \"prevention\": [\"Prevention tip 1\", \"Prevention tip 2\"],",
  "  \"spoilage_level\": \"none or minimal or moderate or severe\",",
  "  \"urgency\": \"none or low or medium or high or critical\",",
  "  \"additional_issues\": [\"Other observations like pests, nutrient deficiency, etc\"],",
  "  \"heatmap_zones\": {",
  "    \"top_left\": 5, \"top_center\": 5, \"top_right\": 5,",
  "    \"mid_left\": 5, \"mid_center\": 5, \"mid_right\": 5,",
  "    \"bot_left\": 5, \"bot_center\": 5, \"bot_right\": 5",
  "  }",
  "}",
  "",
  "heatmap_zones: Each value is 0-100. 0=perfectly healthy green zone, 100=critical disease red zone.",
  "Set each zone based on where you actually see disease or damage in the image."
].join("\n");

function isModelUnavailable(status, text) {
  return (
    status === 404 ||
    text.indexOf("not found") !== -1 ||
    text.indexOf("model_not_found") !== -1 ||
    text.indexOf("does not exist") !== -1 ||
    text.indexOf("decommissioned") !== -1 ||
    text.indexOf("no longer supported") !== -1 ||
    text.indexOf("deprecated") !== -1 ||
    text.indexOf("unavailable") !== -1
  );
}

function buildPayload(model, imageBase64, mimeType) {
  return {
    model: model,
    messages: [{
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: "data:" + mimeType + ";base64," + imageBase64
          }
        },
        {
          type: "text",
          text: ANALYSIS_PROMPT
        }
      ]
    }],
    max_tokens: 1500,
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
      provider: "OpenRouter",
      apiUrl: OPENROUTER_API_URL,
      models: MODELS,
      hasEnvKey: !!process.env.OPENROUTER_API_KEY
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    var body = req.body || {};
    var imageBase64 = body.imageBase64;
    var mimeType = body.mimeType || "image/jpeg";
    var apiKey = body.apiKey;
    var key = apiKey || process.env.OPENROUTER_API_KEY;

    if (!key) {
      return res.status(400).json({
        error: "No API key provided. Add your OpenRouter API key (starts with sk-or-v1-) from openrouter.ai/keys in the Settings page."
      });
    }
    if (!imageBase64) {
      return res.status(400).json({
        error: "No image captured. Select a camera and make sure the feed is active."
      });
    }

    var lastError = "";
    var responseData = null;

    for (var i = 0; i < MODELS.length; i++) {
      var model = MODELS[i];
      try {
        var resp = await fetch(OPENROUTER_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + key,
            "HTTP-Referer": "https://ai-powered-crop-disease-detector.vercel.app",
            "X-Title": "CropGuard AI"
          },
          body: JSON.stringify(buildPayload(model, imageBase64, mimeType))
        });

        var text = await resp.text();

        if (!resp.ok) {
          if (isModelUnavailable(resp.status, text)) {
            lastError = "Model " + model + " unavailable";
            continue;
          }
          return res.status(resp.status).json({
            error: "OpenRouter API error (" + resp.status + "): " + text.substring(0, 500)
          });
        }

        responseData = JSON.parse(text);
        console.log("Success with model:", model);
        break;

      } catch (e) {
        lastError = e.message;
        continue;
      }
    }

    if (!responseData) {
      return res.status(503).json({
        error: "No working vision model found. " + lastError + ". Check your API key at openrouter.ai/keys"
      });
    }

    var rawContent = "{}";
    if (responseData.choices && responseData.choices[0] && responseData.choices[0].message) {
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
