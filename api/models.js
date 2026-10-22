const ALLOWED_MODELS = new Set([
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b"
]);

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }
  if (!process.env.GROQ_API_KEY) {
    return res.status(503).json({
      error: "GROQ_API_KEY belum disetel di environment server.",
      models: [...ALLOWED_MODELS]
    });
  }
  try {
    const upstream = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      signal: AbortSignal.timeout(12000)
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data.error?.message || "Gagal mengambil daftar model dari Groq.",
        models: [...ALLOWED_MODELS]
      });
    }
    const active = new Set((data.data || []).map((m) => m.id));
    const models = [...ALLOWED_MODELS].filter((id) => active.has(id));
    return res.status(200).json({ models: models.length ? models : [...ALLOWED_MODELS] });
  } catch (error) {
    return res.status(502).json({
      error: "Tidak bisa menghubungi Groq untuk mengambil model.",
      models: [...ALLOWED_MODELS]
    });
  }
};
