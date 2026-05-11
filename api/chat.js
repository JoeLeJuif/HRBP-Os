import { createClient } from "@supabase/supabase-js";

// Server-side Supabase env (falls back to VITE_ vars used at build time so we
// don't require new env vars on Vercel). Only the anon/publishable key is
// needed — auth.getUser(jwt) validates the access token signature.
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "";

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    : null;

const DEFAULT_MAX_TOKENS = 2000;
const MAX_TOKENS_LIMIT = 4000;

function clampMaxTokens(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_TOKENS;
  return Math.min(Math.floor(n), MAX_TOKENS_LIMIT);
}

function logEvent(payload) {
  // Non-sensitive logging only: user_id, timestamp, ok/fail, generic error.
  // Never log message content, system prompts, or token contents.
  try { console.log(JSON.stringify({ tag: "api/chat", ...payload })); } catch {}
}

export default async function handler(req, res) {
  // CORS headers
  const ALLOWED = (process.env.HRBPOS_ORIGIN || "https://hrbp-os.vercel.app").trim();
  res.setHeader("Access-Control-Allow-Origin", ALLOWED);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: { message: "Method not allowed" } });

  const ts = new Date().toISOString();

  // ── Auth gate ──────────────────────────────────────────────────────────────
  if (!supabase) {
    logEvent({ ts, ok: false, reason: "supabase-not-configured" });
    return res.status(500).json({ error: { message: "Server auth not configured" } });
  }

  const authHeader = req.headers["authorization"] || req.headers["Authorization"] || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(authHeader).trim());
  if (!match) {
    logEvent({ ts, ok: false, reason: "missing-token" });
    return res.status(401).json({ error: { message: "Unauthorized" } });
  }
  const token = match[1].trim();

  let userId = null;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      logEvent({ ts, ok: false, reason: "invalid-token" });
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }
    userId = data.user.id;
  } catch {
    logEvent({ ts, ok: false, reason: "auth-check-failed" });
    return res.status(401).json({ error: { message: "Unauthorized" } });
  }

  // ── Payload validation ─────────────────────────────────────────────────────
  const { system, messages, max_tokens } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    logEvent({ ts, ok: false, user_id: userId, reason: "bad-request" });
    return res.status(400).json({ error: { message: "messages requis" } });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    logEvent({ ts, ok: false, user_id: userId, reason: "no-anthropic-key" });
    return res.status(500).json({ error: { message: "ANTHROPIC_API_KEY manquante — configure-la dans Vercel Dashboard > Settings > Environment Variables" } });
  }

  const safeMaxTokens = clampMaxTokens(max_tokens);

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
        max_tokens: safeMaxTokens,
        system,
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      logEvent({ ts, ok: false, user_id: userId, reason: "anthropic-error", status: response.status });
      return res.status(response.status).json({ error: data.error || { message: "Erreur API Anthropic" } });
    }

    logEvent({ ts, ok: true, user_id: userId, max_tokens: safeMaxTokens });
    return res.status(200).json(data);

  } catch {
    logEvent({ ts, ok: false, user_id: userId, reason: "server-error" });
    return res.status(500).json({ error: { message: "Erreur serveur" } });
  }
}
