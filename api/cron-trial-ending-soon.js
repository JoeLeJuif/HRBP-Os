// ── /api/cron-trial-ending-soon ──────────────────────────────────────────────
// Sprint 3 — Étape 5E. Daily Vercel Cron that emails organizations whose
// Starter trial ends in ~3 days. Anti-doublon via
// subscriptions.trial_ending_email_sent_at: only NULL rows are scanned, and
// the column is stamped on a successful send (or a configured no-op) so
// subsequent runs skip the row. Real provider failures leave the column
// NULL so the next daily run can retry.
//
// Auth: when CRON_SECRET is set, the request must carry
//   Authorization: Bearer <CRON_SECRET>
// Vercel Cron sends this header automatically when the env var is defined.
// When CRON_SECRET is absent we log a warning but still execute, so local
// dev hits aren't rejected before the secret lands.
//
// Email-send failure NEVER fails the job: each row is wrapped in try/catch
// and the handler always returns 200 with a JSON summary
// { ok, scanned, sent, skipped, failed }.

import { createClient } from "@supabase/supabase-js";

import { sendTransactionalEmail } from "./lib/email.js";
import { trialEndingSoonEmail } from "./lib/emailTemplates.js";
import { requireEnv } from "./lib/env.js";
import { withSentry } from "./lib/sentry.js";

const CRON_SECRET = process.env.CRON_SECRET || "";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const APP_URL = (process.env.HRBPOS_ORIGIN || "https://hrbp-os.vercel.app").trim();

const admin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null;

function isAuthorized(req) {
  if (!CRON_SECRET) return { ok: true, dev: true };
  const header = req.headers["authorization"] || req.headers["Authorization"];
  if (typeof header === "string" && header === `Bearer ${CRON_SECRET}`) return { ok: true };
  return { ok: false };
}

function jsonLog(payload) {
  try {
    console.log(JSON.stringify({
      tag: "cron-trial-ending-soon",
      timestamp: new Date().toISOString(),
      ...payload,
    }));
  } catch {}
}

async function fetchOrganizationName(organizationId) {
  if (!admin || !organizationId) return null;
  try {
    const { data, error } = await admin
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .maybeSingle();
    if (error || !data?.name) return null;
    return data.name;
  } catch {
    return null;
  }
}

// Recipient resolution mirrors the webhook pattern:
//   a) approved admin/super_admin in the org (oldest first)
//   b) fallback: any approved profile in the org (oldest first)
async function resolveRecipientProfile(organizationId) {
  if (!admin || !organizationId) return null;

  const { data: privileged, error: pErr } = await admin
    .from("profiles")
    .select("id, email")
    .eq("organization_id", organizationId)
    .eq("status", "approved")
    .in("role", ["super_admin", "admin"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!pErr && privileged?.email) return privileged;

  const { data: fallback, error: fErr } = await admin
    .from("profiles")
    .select("id, email")
    .eq("organization_id", organizationId)
    .eq("status", "approved")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!fErr && fallback?.email) return fallback;

  return null;
}

async function resolveFirstName(userId) {
  if (!admin || !userId) return null;
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return null;
    const md = data.user.user_metadata || {};
    if (md.first_name) return String(md.first_name);
    if (md.firstName)  return String(md.firstName);
    if (md.full_name)  return String(md.full_name).split(" ")[0] || null;
    return null;
  } catch {
    return null;
  }
}

function daysUntilIso(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const days = Math.round((t - Date.now()) / (24 * 60 * 60 * 1000));
  return days > 0 ? days : 1;
}

async function handler(req, res) {
  // Vercel Cron sends GET. POST allowed for manual curl/testing.
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }

  const auth = isAuthorized(req);
  if (!auth.ok) {
    jsonLog({ event: "unauthorized" });
    return res.status(401).json({ error: { message: "Unauthorized" } });
  }
  if (auth.dev) {
    console.warn("[cron-trial-ending-soon] CRON_SECRET not set — allowing request (dev mode)");
  }

  if (requireEnv("supabase-admin", res, "cron-trial-ending-soon")) return;
  if (!admin) {
    jsonLog({ event: "misconfigured", reason: "supabase-service-role-missing" });
    return res.status(500).json({ error: { message: "Supabase service role not configured" } });
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const windowEnd   = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString();

  let rows = [];
  try {
    const { data, error } = await admin
      .from("subscriptions")
      .select("id, organization_id, trial_ends_at")
      .eq("status", "trialing")
      .is("trial_ending_email_sent_at", null)
      .gte("trial_ends_at", windowStart)
      .lte("trial_ends_at", windowEnd);
    if (error) throw error;
    rows = Array.isArray(data) ? data : [];
  } catch (err) {
    jsonLog({ event: "query-failed", reason: err?.message || String(err) });
    return res.status(500).json({ error: { message: "Subscription query failed" } });
  }

  const summary = { scanned: rows.length, sent: 0, skipped: 0, failed: 0 };
  jsonLog({ event: "scan", scanned: summary.scanned, window_start: windowStart, window_end: windowEnd });

  for (const row of rows) {
    try {
      if (!row?.organization_id) {
        summary.skipped += 1;
        jsonLog({ event: "skip-no-org", subscription_id: row?.id || null });
        continue;
      }

      const recipient = await resolveRecipientProfile(row.organization_id);
      if (!recipient?.email) {
        summary.skipped += 1;
        jsonLog({ event: "skip-no-recipient", subscription_id: row.id, organization_id: row.organization_id });
        continue;
      }

      const [firstName, organizationName] = await Promise.all([
        resolveFirstName(recipient.id),
        fetchOrganizationName(row.organization_id),
      ]);

      const tpl = trialEndingSoonEmail({
        firstName,
        organizationName,
        trialEndsAt: row.trial_ends_at,
        appUrl: APP_URL,
        daysRemaining: daysUntilIso(row.trial_ends_at),
      });

      const result = await sendTransactionalEmail({
        to: recipient.email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        type: "trial_ending_soon",
        metadata: {
          organization_id: row.organization_id,
          subscription_id: row.id,
          trial_ends_at: row.trial_ends_at,
        },
      });

      // Stamp on success OR provider no-op (skipped=true) so we don't keep
      // re-trying when the provider is intentionally unconfigured. Real
      // provider failures leave the column NULL for tomorrow's retry.
      const shouldStamp = result?.ok === true || result?.skipped === true;
      if (shouldStamp) {
        try {
          const { error: stampErr } = await admin
            .from("subscriptions")
            .update({ trial_ending_email_sent_at: new Date().toISOString() })
            .eq("id", row.id);
          if (stampErr) {
            jsonLog({ event: "stamp-failed", subscription_id: row.id, reason: stampErr.message });
          }
        } catch (err) {
          jsonLog({ event: "stamp-error", subscription_id: row.id, reason: err?.message || String(err) });
        }
      }

      if (result?.ok) {
        summary.sent += 1;
        jsonLog({ event: "sent", subscription_id: row.id, to: recipient.email, message_id: result.id || null });
      } else if (result?.skipped) {
        summary.skipped += 1;
        jsonLog({ event: "no-op", subscription_id: row.id, reason: result.reason });
      } else {
        summary.failed += 1;
        jsonLog({ event: "failed", subscription_id: row.id, reason: result?.error || "unknown" });
      }
    } catch (err) {
      summary.failed += 1;
      jsonLog({ event: "row-error", subscription_id: row?.id || null, reason: err?.message || String(err) });
    }
  }

  jsonLog({ event: "done", ...summary });
  return res.status(200).json({ ok: true, ...summary });
}

export default withSentry(handler);
