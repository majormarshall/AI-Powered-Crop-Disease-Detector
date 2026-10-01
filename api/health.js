module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    status: 'ok',
    platform: 'vercel',
    provider: 'OpenRouter',
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    models: [
      'google/gemini-2.0-flash-exp:free',
      'google/gemini-flash-1.5',
      'qwen/qwen-2.5-vl-72b-instruct',
      'meta-llama/llama-3.2-90b-vision-instruct',
      'anthropic/claude-3-haiku',
      'openai/gpt-4o-mini'
    ],
    hasEnvKey: !!process.env.OPENROUTER_API_KEY,
    timestamp: new Date().toISOString()
  });
};