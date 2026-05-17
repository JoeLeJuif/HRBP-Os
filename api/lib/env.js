// ── Centralized server-side env validation ──────────────────────────────────
// Single source of truth for required env vars per surface. Each api/* handler
// calls `assertEnv("surface")` at the top — missing vars produce a structured
// 500 with a clear reason instead of letting a downstream client throw.
//
// Surfaces:
//   "supabase-read"   — Supabase URL + anon/publishable key (chat, RPC reads)
//   "supabase-admin"  — adds SUPABASE_SERVICE_ROLE_KEY (signup, webhook, cron)
//   "stripe"          — STRIPE_SECRET_KEY
//   "stripe-webhook"  — STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET
//   "anthropic"       — ANTHROPIC_API_KEY
//   "resend"          — RESEND_API_KEY + EMAIL_FROM (soft — handler ok in no-op)
//   "cron"            — CRON_SECRET (soft — dev mode warns and continues)
//
// `assertEnv(surface)` returns `{ ok: true }` or `{ ok: false, missing: [...] }`.
// `requireEnv(surface, res)` short-circuits with 500 if missing — handler stops.
// Never logs or returns secret values; only the var names are surfaced.

const SUPABASE_URL = () =>
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "";

const SUPABASE_ANON_KEY = () =>
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "";

const CHECKS = {
  "supabase-read": () => {
    const missing = [];
    if (!SUPABASE_URL())      missing.push("SUPABASE_URL");
    if (!SUPABASE_ANON_KEY()) missing.push("SUPABASE_ANON_KEY");
    return missing;
  },
  "supabase-admin": () => {
    const missing = [];
    if (!SUPABASE_URL())                       missing.push("SUPABASE_URL");
    if (!SUPABASE_ANON_KEY())                  missing.push("SUPABASE_ANON_KEY");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    return missing;
  },
  "stripe": () => {
    const missing = [];
    if (!process.env.STRIPE_SECRET_KEY) missing.push("STRIPE_SECRET_KEY");
    return missing;
  },
  "stripe-webhook": () => {
    const missing = [];
    if (!process.env.STRIPE_SECRET_KEY)     missing.push("STRIPE_SECRET_KEY");
    if (!process.env.STRIPE_WEBHOOK_SECRET) missing.push("STRIPE_WEBHOOK_SECRET");
    return missing;
  },
  "anthropic": () => {
    const missing = [];
    if (!process.env.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY");
    return missing;
  },
  "resend": () => {
    const missing = [];
    if (!process.env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
    if (!process.env.EMAIL_FROM)     missing.push("EMAIL_FROM");
    return missing;
  },
  "cron": () => {
    const missing = [];
    if (!process.env.CRON_SECRET) missing.push("CRON_SECRET");
    return missing;
  },
};

export function assertEnv(surface) {
  const check = CHECKS[surface];
  if (!check) return { ok: false, missing: ["__unknown_surface__"] };
  const missing = check();
  return missing.length === 0
    ? { ok: true, missing: [] }
    : { ok: false, missing };
}

// Single-surface guard: short-circuits the request with a 500 + structured log
// if any required var is missing. Returns `true` when the caller should `return`.
// Usage: `if (requireEnv("supabase-admin", res, "api/signup")) return;`
export function requireEnv(surface, res, tag) {
  const check = assertEnv(surface);
  if (check.ok) return false;
  try {
    console.error(JSON.stringify({
      tag: tag || "env",
      event: "misconfigured",
      surface,
      missing: check.missing,
      timestamp: new Date().toISOString(),
    }));
  } catch {}
  if (res && !res.headersSent) {
    res.status(500).json({
      error: { message: "Service non disponible — configuration manquante." },
    });
  }
  return true;
}

// Snapshot for diagnostic endpoints / boot-time logging. Returns `{ ok, missing }`
// per surface. Never returns values.
export function envSnapshot() {
  const out = {};
  for (const surface of Object.keys(CHECKS)) {
    out[surface] = assertEnv(surface);
  }
  return out;
}
