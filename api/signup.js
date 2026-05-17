// ── /api/signup ──────────────────────────────────────────────────────────────
// Sprint 4 — Étape 1. Public onboarding endpoint.
//
// Flow (all server-side, no Stripe):
//   1. Validate input + per-IP rate limit.
//   2. Short-circuit on duplicate email (allow-list lookup) — return generic
//      success and re-send the magic link, never leak user-existence.
//   3. Create organization (service role bypasses RLS).
//   4. Create the auth user — handle_new_user trigger seeds a pending profile.
//   5. Upsert the profile with organization_id + role='admin' + status='approved'
//      (trigger has an auth.uid() IS NULL escape so service-role updates pass).
//   6. Insert allow-list row + Starter trialing subscription (14 days).
//   7. Send a Supabase magic link via the public anon client.
//
// SUPABASE_SERVICE_ROLE_KEY is required server-side and must never be exposed
// to the browser. Errors surface generically to the UI; reasons are logged.

import { createClient } from "@supabase/supabase-js";
import { sendTransactionalEmail } from "./lib/email.js";
import { welcomeTrialEmail } from "./lib/emailTemplates.js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const ALLOWED_ORIGIN = (process.env.HRBPOS_ORIGIN || "https://hrbp-os.vercel.app").trim();

const admin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

const anon =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

// ── Rate limiting (in-memory, per-instance) ──────────────────────────────────
// Mirrors the api/chat.js pattern: best-effort, survives warm invocations,
// not shared across instances or cold starts. Keyed on client IP since the
// caller is unauthenticated. 5 attempts per 10-minute window.
const RL_MAX = 5;
const RL_WINDOW_MS = 10 * 60 * 1000;
const RL_SWEEP_MS = 5 * 60 * 1000;
const rateBuckets = new Map();
let lastSweep = 0;

function checkRateLimit(key, now = Date.now()) {
  if (!key) return { allowed: true, retryAfter: 0 };
  if (now - lastSweep > RL_SWEEP_MS) {
    lastSweep = now;
    for (const [k, b] of rateBuckets) {
      if (now - b.start > RL_WINDOW_MS) rateBuckets.delete(k);
    }
  }
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start >= RL_WINDOW_MS) {
    rateBuckets.set(key, { start: now, count: 1 });
    return { allowed: true, retryAfter: 0 };
  }
  if (bucket.count >= RL_MAX) {
    const retryAfter = Math.max(1, Math.ceil((RL_WINDOW_MS - (now - bucket.start)) / 1000));
    return { allowed: false, retryAfter };
  }
  bucket.count += 1;
  return { allowed: true, retryAfter: 0 };
}

function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  return req.socket?.remoteAddress || req.connection?.remoteAddress || "unknown";
}

function logEvent({ event, status, reason, ...extra }) {
  try {
    console.log(JSON.stringify({
      tag: "api/signup",
      event,
      timestamp: new Date().toISOString(),
      ...(typeof status !== "undefined" ? { status } : {}),
      ...(reason ? { reason } : {}),
      ...extra,
    }));
  } catch {}
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_ERR = "Impossible de créer le workspace pour l'instant.";

function trimStr(v, max) {
  if (typeof v !== "string") return "";
  const t = v.trim();
  return t.length > max ? t.slice(0, max) : t;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }

  if (!admin || !anon) {
    logEvent({ event: "misconfigured", status: 500, reason: "supabase-not-configured" });
    return res.status(500).json({ error: { message: GENERIC_ERR } });
  }

  const rl = checkRateLimit(clientIp(req));
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    logEvent({ event: "rate-limited", status: 429, retry_after: rl.retryAfter });
    return res.status(429).json({ error: { message: "Trop de tentatives." } });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const orgName   = trimStr(body.organization_name || body.organizationName, 200);
  const firstName = trimStr(body.first_name        || body.firstName,        100);
  const lastName  = trimStr(body.last_name         || body.lastName,         100);
  const email     = trimStr(body.email, 320).toLowerCase();

  if (!orgName || !firstName || !lastName || !email || !EMAIL_RE.test(email)) {
    logEvent({ event: "bad-request", status: 400, reason: "missing-or-invalid-fields" });
    return res.status(400).json({ error: { message: "Champs manquants ou invalides." } });
  }

  // ── Idempotency: re-send magic link if already onboarded ──────────────────
  try {
    const { data: existing, error: lookupErr } = await admin
      .from("allowed_users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (lookupErr) throw lookupErr;
    if (existing) {
      try {
        await anon.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: req.headers["origin"] || ALLOWED_ORIGIN },
        });
      } catch {
        logEvent({ event: "resend-otp-failed", reason: "otp-error" });
      }
      logEvent({ event: "already-onboarded", status: 200 });
      return res.status(200).json({ ok: true });
    }
  } catch (e) {
    logEvent({ event: "allow-list-check-failed", status: 500, reason: e?.code || "query-error" });
    return res.status(500).json({ error: { message: GENERIC_ERR } });
  }

  // ── 1. Create organization ────────────────────────────────────────────────
  let orgId;
  try {
    const { data: org, error } = await admin
      .from("organizations")
      .insert({ name: orgName })
      .select("id")
      .single();
    if (error || !org?.id) throw error || new Error("org-insert-empty");
    orgId = org.id;
  } catch (e) {
    logEvent({ event: "org-create-failed", status: 500, reason: e?.code || "insert-error" });
    return res.status(500).json({ error: { message: GENERIC_ERR } });
  }

  // ── 2. Create auth user (handle_new_user trigger seeds profile) ───────────
  let userId;
  try {
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: { full_name: fullName, first_name: firstName, last_name: lastName },
    });
    if (error || !data?.user?.id) throw error || new Error("user-create-empty");
    userId = data.user.id;
  } catch (e) {
    logEvent({ event: "user-create-failed", status: 500, reason: e?.message || "create-error" });
    try { await admin.from("organizations").delete().eq("id", orgId); } catch {}
    return res.status(500).json({ error: { message: GENERIC_ERR } });
  }

  // ── 3. Upsert profile with org + admin role + approved status ─────────────
  try {
    const { error } = await admin
      .from("profiles")
      .upsert({
        id: userId,
        email,
        organization_id: orgId,
        role: "admin",
        status: "approved",
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
    if (error) throw error;
  } catch (e) {
    logEvent({ event: "profile-update-failed", status: 500, reason: e?.code || "update-error" });
    return res.status(500).json({ error: { message: GENERIC_ERR } });
  }

  // ── 4. Add to allow-list (tolerate race-condition duplicates) ─────────────
  try {
    const { error } = await admin.from("allowed_users").insert({ email });
    if (error && error.code !== "23505") throw error;
  } catch (e) {
    logEvent({ event: "allow-list-insert-failed", status: 500, reason: e?.code || "insert-error" });
    return res.status(500).json({ error: { message: GENERIC_ERR } });
  }

  // ── 5. Provision Starter trialing subscription (14 days), no Stripe ───────
  let trialSubscriptionId = null;
  let trialEndsAtIso = null;
  try {
    const { data: plan, error: pErr } = await admin
      .from("plans")
      .select("id")
      .eq("code", "starter")
      .eq("is_active", true)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!plan?.id) throw new Error("starter-plan-missing");

    const now = new Date();
    const trialEnds = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    trialEndsAtIso = trialEnds.toISOString();
    const { data: sub, error: sErr } = await admin
      .from("subscriptions")
      .insert({
        organization_id: orgId,
        plan_id: plan.id,
        status: "trialing",
        current_period_start: now.toISOString(),
        trial_ends_at: trialEndsAtIso,
      })
      .select("id")
      .maybeSingle();
    if (sErr && sErr.code !== "23505") throw sErr;
    trialSubscriptionId = sub?.id || null;
  } catch (e) {
    // Non-fatal: onboarding finishes, billing can be repaired later by an admin.
    logEvent({ event: "subscription-create-failed", reason: e?.code || e?.message || "insert-error" });
  }

  // ── 5b. Welcome-trial email (best-effort; gated on new trial row) ─────────
  // Only fires when the subscription INSERT actually produced a new row, so a
  // re-run after an already-onboarded account (caught upstream by the allow-list
  // short-circuit) or a duplicate-key race (23505) skips sending — no doubles.
  if (trialSubscriptionId) {
    try {
      const tpl = welcomeTrialEmail({ firstName, trialEndsAt: trialEndsAtIso });
      const result = await sendTransactionalEmail({
        to: email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        type: "welcome_trial",
        metadata: {
          organization_id: orgId,
          subscription_id: trialSubscriptionId,
          trial_end_date: trialEndsAtIso,
        },
      });
      if (result?.ok) {
        logEvent({ event: "welcome-trial-email-sent", subscription_id: trialSubscriptionId });
      } else if (result?.skipped) {
        logEvent({ event: "welcome-trial-email-skipped", reason: result.reason });
      } else {
        logEvent({ event: "welcome-trial-email-failed", reason: result?.error || "unknown" });
      }
    } catch (e) {
      logEvent({ event: "welcome-trial-email-failed", reason: e?.message || "unexpected-error" });
    }
  }

  // ── 6. Send magic link (best-effort; UI message stays generic either way) ─
  let magicLinkSent = true;
  try {
    const { error } = await anon.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: req.headers["origin"] || ALLOWED_ORIGIN },
    });
    if (error) throw error;
  } catch (e) {
    magicLinkSent = false;
    logEvent({ event: "magic-link-failed", reason: e?.message || "otp-error" });
  }

  logEvent({ event: "success", status: 200, org_id: orgId, magic_link_sent: magicLinkSent });
  return res.status(200).json({ ok: true });
}
