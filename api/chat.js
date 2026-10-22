const ALLOWED_MODELS = new Set([
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b"
]);

const BASE_SYSTEM = `Kamu adalah Nexvora AI, asisten AI yang ramah, akurat, dan kuat dalam coding. Jawab dalam bahasa yang dipakai pengguna, biasanya Bahasa Indonesia. Berikan kode yang bisa dipakai, jelaskan asumsi penting, jangan mengaku telah menjalankan atau memverifikasi sesuatu jika belum. Utamakan keamanan, privasi, dan solusi yang realistis. Jika membuat kode, gunakan blok kode Markdown dengan label bahasa yang sesuai.`;
const CYBER_SYSTEM = `
MODE HACKER AKTIF — mode ini adalah pembelajaran keamanan siber yang etis dan defensif. Bantu audit aplikasi milik sendiri, lab/CTF yang diizinkan, threat modeling, secure coding, log analysis, hardening, dan penjelasan konsep. Sebelum pengujian yang berdampak pada sistem nyata, tekankan izin dan ruang lingkup. Jangan memberikan panduan untuk mencuri kredensial, mengambil alih akun, menyebarkan malware, menghindari deteksi, menyerang target tanpa izin, atau mengeksploitasi pihak lain. Untuk permintaan berisiko, arahkan ke lab lokal dan alternatif defensif.`;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  if (!process.env.GROQ_API_KEY) {
    return res.status(503).json({ error: "GROQ_API_KEY belum disetel pada environment server." });
  }

  try {
    let body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 1_000_000) return res.status(413).json({ error: "Request terlalu besar." });
      }
      body = JSON.parse(raw || "{}");
    }
    const model = typeof body.model === "string" ? body.model : "openai/gpt-oss-20b";
    const hackerMode = body.hackerMode === true;
    const incoming = body.messages;
    if (!ALLOWED_MODELS.has(model)) return res.status(400).json({ error: "Model tidak tersedia di konfigurasi Nexvora AI." });
    if (!Array.isArray(incoming) || incoming.length < 1 || incoming.length > 60) {
      return res.status(400).json({ error: "Format pesan tidak valid atau jumlah pesan terlalu banyak." });
    }
    let totalChars = 0;
    const messages = incoming.map((item) => {
      if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string") {
        throw new Error("Format pesan tidak valid.");
      }
      totalChars += item.content.length;
      return { role: item.role, content: item.content.slice(0, 50000) };
    });
    if (totalChars > 150000) return res.status(413).json({ error: "Percakapan terlalu panjang. Mulai chat baru atau ringkas konteks." });

    const system = BASE_SYSTEM + (hackerMode ? CYBER_SYSTEM : "");
    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, ...messages],
        temperature: 0.65,
        max_tokens: 4096,
        stream: true
      }),
      signal: AbortSignal.timeout(60000)
    });

    if (!upstream.ok) {
      const errorData = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json({ error: errorData.error?.message || "Permintaan ke Groq gagal." });
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) await new Promise((resolve) => res.once("drain", resolve));
      }
      res.end();
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: "Koneksi streaming terputus." })}\n\n`);
      return res.end();
    }
    const isJson = error instanceof SyntaxError;
    return res.status(isJson ? 400 : 500).json({
      error: isJson ? "JSON request tidak valid." : (error.message || "Terjadi kesalahan pada server.")
    });
  }
};
