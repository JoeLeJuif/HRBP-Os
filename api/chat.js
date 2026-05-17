import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "./lib/env.js";
import { withSentry } from "./lib/sentry.js";

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

// ── Rate limiting (in-memory, per-instance) ────────────────────────────────
// Simple fixed-window rate limiter keyed on user_id. Limit: RATE_LIMIT_MAX
// requests per RATE_LIMIT_WINDOW_MS. State lives in module scope so it
// survives between invocations on a warm Vercel function instance; it does
// NOT survive cold starts and is not shared across instances. Acceptable
// per Sprint 1 scope ("Implémentation mémoire acceptable pour l'instant").
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_SWEEP_MS = 5 * 60 * 1000;
const rateBuckets = new Map();
let lastSweep = 0;

function sweepRateBuckets(now) {
  if (now - lastSweep < RATE_LIMIT_SWEEP_MS) return;
  lastSweep = now;
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.start > RATE_LIMIT_WINDOW_MS) rateBuckets.delete(key);
  }
}

// Returns { allowed: boolean, retryAfter: number (seconds) }.
function checkRateLimit(userId, now = Date.now()) {
  if (!userId) return { allowed: true, retryAfter: 0 };
  sweepRateBuckets(now);
  const bucket = rateBuckets.get(userId);
  if (!bucket || now - bucket.start >= RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(userId, { start: now, count: 1 });
    return { allowed: true, retryAfter: 0 };
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - bucket.start)) / 1000));
    return { allowed: false, retryAfter };
  }
  bucket.count += 1;
  return { allowed: true, retryAfter: 0 };
}

// Structured event logger. Strict invariants:
//   - Never log message content, system prompts, or token contents.
//   - Never log raw Authorization headers or Anthropic API keys.
//   - reason stays generic (no upstream error bodies).
// Shape: { tag, event, timestamp, status, reason?, user_id?, request_id?, ...extra }
function logEvent({ event, status, reason, user_id, request_id, ...extra }) {
  try {
    console.log(JSON.stringify({
      tag: "api/chat",
      event,
      timestamp: new Date().toISOString(),
      ...(typeof status !== "undefined" ? { status } : {}),
      ...(reason ? { reason } : {}),
      ...(user_id ? { user_id } : {}),
      ...(request_id ? { request_id } : {}),
      ...extra,
    }));
  } catch {}
}

function getRequestId(req) {
  // Prefer Vercel's per-invocation id when present, fall back to a UUID so
  // every log line in a request shares a correlatable id.
  const vercelId = req?.headers?.["x-vercel-id"];
  if (typeof vercelId === "string" && vercelId.length) return vercelId;
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return undefined;
}

async function handler(req, res) {
  // CORS headers
  const ALLOWED = (process.env.HRBPOS_ORIGIN || "https://hrbp-os.vercel.app").trim();
  res.setHeader("Access-Control-Allow-Origin", ALLOWED);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: { message: "Method not allowed" } });

  const request_id = getRequestId(req);

  // ── Auth gate ──────────────────────────────────────────────────────────────
  if (requireEnv("supabase-read", res, "api/chat")) return;
  if (!supabase) {
    logEvent({ event: "misconfigured", status: 500, reason: "supabase-not-configured", request_id });
    return res.status(500).json({ error: { message: "Server auth not configured" } });
  }

  const authHeader = req.headers["authorization"] || req.headers["Authorization"] || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(authHeader).trim());
  if (!match) {
    logEvent({ event: "unauthorized", status: 401, reason: "missing-token", request_id });
    return res.status(401).json({ error: { message: "Unauthorized" } });
  }
  const token = match[1].trim();

  let userId = null;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      logEvent({ event: "invalid-token", status: 401, reason: "supabase-rejected", request_id });
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }
    userId = data.user.id;
  } catch {
    logEvent({ event: "unauthorized", status: 401, reason: "auth-check-failed", request_id });
    return res.status(401).json({ error: { message: "Unauthorized" } });
  }

  // ── Rate limiting (per user_id, 10 req / 60s) ──────────────────────────────
  const rl = checkRateLimit(userId);
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    logEvent({ event: "rate-limited", status: 429, reason: "per-user-quota", user_id: userId, request_id, retry_after: rl.retryAfter });
    return res.status(429).json({ error: { message: "Trop de requêtes. Réessaie dans un moment." } });
  }

  // ── Payload validation ─────────────────────────────────────────────────────
  const { system, messages, max_tokens } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    logEvent({ event: "bad-request", status: 400, reason: "messages-missing-or-invalid", user_id: userId, request_id });
    return res.status(400).json({ error: { message: "messages requis" } });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    logEvent({ event: "misconfigured", status: 500, reason: "no-anthropic-key", user_id: userId, request_id });
    return res.status(500).json({ error: { message: "Service IA non disponible — configuration manquante." } });
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
      logEvent({ event: "anthropic-error", status: response.status, reason: "upstream-non-2xx", user_id: userId, request_id });
      return res.status(response.status).json({ error: data.error || { message: "Erreur API Anthropic" } });
    }

    logEvent({ event: "success", status: 200, user_id: userId, request_id, max_tokens: safeMaxTokens });
    return res.status(200).json(data);

  } catch {
    logEvent({ event: "anthropic-error", status: 500, reason: "upstream-fetch-failed", user_id: userId, request_id });
    return res.status(500).json({ error: { message: "Erreur serveur" } });
  }
}

export default withSentry(handler);
