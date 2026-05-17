// ── /api/notify-approved ─────────────────────────────────────────────────────
// Sends the "Access approved" email to a newly approved user. Called by Admin
// UI immediately after a successful `updateProfile({status:"approved"})`.
//
// Flow:
//   1. Validate caller JWT (Supabase) and resolve caller profile.
//   2. Authorize: caller must be approved AND (super_admin OR admin in the same
//      org as the target — verified against profiles + a server-side lookup).
//   3. Look up target profile + organization name (service role bypasses RLS so
//      we can read both reliably).
//   4. Send bilingual notification via Resend (no-op if Resend not configured).
//
// Idempotency: the endpoint can be called multiple times; the email provider is
// the source of truth for delivery. Best-effort — never blocks the approval.

import { createClient } from "@supabase/supabase-js";

import { sendTransactionalEmail } from "./lib/email.js";
import { accessApprovedEmail } from "./lib/emailTemplates.js";
import { requireEnv } from "./lib/env.js";
import { captureException, withSentry } from "./lib/sentry.js";

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

function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function logEvent(payload) {
  try {
    console.log(JSON.stringify({
      tag: "api/notify-approved",
      timestamp: new Date().toISOString(),
      ...payload,
    }));
  } catch {}
}

async function handler(req, res) {
  applyCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }
  if (requireEnv("supabase-admin", res, "api/notify-approved")) return;

  const authHeader = req.headers["authorization"] || req.headers["Authorization"] || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(authHeader).trim());
  if (!match) return res.status(401).json({ error: { message: "Unauthorized" } });
  const token = match[1].trim();

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  let caller;
  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: { message: "Unauthorized" } });
    caller = data.user;
  } catch {
    return res.status(401).json({ error: { message: "Unauthorized" } });
  }

  const body = (req.body && typeof req.body === "object") ? req.body : {};
  const targetUserId = typeof body.target_user_id === "string" ? body.target_user_id.trim() : "";
  if (!targetUserId) {
    return res.status(400).json({ error: { message: "target_user_id requis" } });
  }

  // Caller profile (own row, RLS-readable).
  const { data: callerProfile, error: cErr } = await sb
    .from("profiles")
    .select("id, status, role, organization_id")
    .eq("id", caller.id)
    .maybeSingle();
  if (cErr || !callerProfile || callerProfile.status !== "approved"
      || (callerProfile.role !== "admin" && callerProfile.role !== "super_admin")) {
    logEvent({ event: "forbidden", reason: "not-admin" });
    return res.status(403).json({ error: { message: "Forbidden" } });
  }

  // Target lookup via service role (we need to read across orgs for super_admin,
  // and we don't want to leak whether the target exists via RLS errors).
  const { data: target, error: tErr } = await admin
    .from("profiles")
    .select("id, email, status, organization_id")
    .eq("id", targetUserId)
    .maybeSingle();
  if (tErr || !target) {
    logEvent({ event: "target-not-found" });
    return res.status(404).json({ error: { message: "Profil introuvable" } });
  }

  if (callerProfile.role !== "super_admin") {
    if (!callerProfile.organization_id
        || target.organization_id !== callerProfile.organization_id) {
      logEvent({ event: "forbidden", reason: "cross-org" });
      return res.status(403).json({ error: { message: "Forbidden" } });
    }
  }

  if (target.status !== "approved") {
    logEvent({ event: "skipped", reason: "target-not-approved", status: target.status });
    return res.status(200).json({ ok: true, skipped: true, reason: "not-approved" });
  }
  if (!target.email) {
    logEvent({ event: "skipped", reason: "no-email" });
    return res.status(200).json({ ok: true, skipped: true, reason: "no-email" });
  }

  let organizationName = null;
  if (target.organization_id) {
    try {
      const { data: org } = await admin
        .from("organizations")
        .select("name")
        .eq("id", target.organization_id)
        .maybeSingle();
      organizationName = org?.name || null;
    } catch {}
  }

  let firstName = null;
  try {
    const { data: userData } = await admin.auth.admin.getUserById(targetUserId);
    const md = userData?.user?.user_metadata || {};
    firstName = md.first_name || md.firstName
      || (md.full_name ? String(md.full_name).split(" ")[0] : null)
      || null;
  } catch {}

  const tpl = accessApprovedEmail({
    firstName,
    organizationName,
    appUrl: ALLOWED_ORIGIN,
  });
  try {
    const result = await sendTransactionalEmail({
      to: target.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      type: "access_approved",
      metadata: {
        organization_id: target.organization_id,
        target_user_id: targetUserId,
      },
    });
    if (result?.ok) {
      logEvent({ event: "sent", to: target.email, id: result.id || null });
      return res.status(200).json({ ok: true, sent: true });
    }
    if (result?.skipped) {
      logEvent({ event: "no-op", reason: result.reason });
      return res.status(200).json({ ok: true, sent: false, skipped: true, reason: result.reason });
    }
    logEvent({ event: "failed", reason: result?.error || "unknown" });
    return res.status(200).json({ ok: true, sent: false, error: "send_failed" });
  } catch (err) {
    captureException(err, { scope: "notify-approved" });
    logEvent({ event: "failed", reason: err?.message || String(err) });
    return res.status(200).json({ ok: true, sent: false, error: "send_failed" });
  }
}

export default withSentry(handler);
