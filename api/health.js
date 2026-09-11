module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({
    status: "ok",
    platform: "vercel",
    models: ["grok-4", "grok-4.5", "grok-2-vision", "grok-vision-beta"],
    hasEnvKey: !!process.env.GROK_API_KEY,
    timestamp: new Date().toISOString()
  });
};
