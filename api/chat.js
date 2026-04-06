export default async function handler(req, res) {
  // CORS headers
  const ALLOWED = (process.env.HRBPOS_ORIGIN || "https://hrbp-os.vercel.app").trim();
  res.setHeader("Access-Control-Allow-Origin", ALLOWED);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: { message: "Method not allowed" } });

  const { system, messages, max_tokens = 2000 } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: { message: "messages requis" } });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: { message: "ANTHROPIC_API_KEY manquante — configure-la dans Vercel Dashboard > Settings > Environment Variables" } });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens,
        system,
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error || { message: "Erreur API Anthropic" } });
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ error: { message: "Erreur serveur: " + err.message } });
  }
}
