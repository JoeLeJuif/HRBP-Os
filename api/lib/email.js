// ── api/lib/email.js ─────────────────────────────────────────────────────────
// Sprint 3 — Étape 5A. Foundation for transactional email.
//
// Provider: Resend (https://resend.com). Selected for HTTP-only delivery — no
// SDK dependency needed, the fetch call below is enough. Swap by replacing the
// `dispatch*` function and the env-var read at the top.
//
// Required environment variables (set in Vercel → Project Settings → Env Vars):
//   RESEND_API_KEY   — server-only. Never expose to the browser.
//   EMAIL_FROM       — verified sender address, e.g. "HRBP OS <noreply@hrbp-os.app>"
//
// If either env var is absent the service operates in NO-OP mode: every call
// returns { ok: false, skipped: true, reason: "missing_email_provider_config" }
// and logs a single warning. This lets webhooks and other callers wire the
// email layer in safely before the provider is configured.
//
// Public API:
//   await sendTransactionalEmail({ to, subject, html, text, type, metadata })
//     → { ok: true,  id }
//     → { ok: false, error }
//     → { ok: false, skipped: true, reason: "missing_email_provider_config" }
//
// The function NEVER throws. Callers (webhooks, RPC handlers, signup flows)
// can `await` it without try/catch and treat a falsy `ok` as a soft failure.

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM     = process.env.EMAIL_FROM     || "";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

function isConfigured() {
  return Boolean(RESEND_API_KEY && EMAIL_FROM);
}

function normalizeRecipients(to) {
  if (!to) return [];
  if (Array.isArray(to)) return to.filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim());
  if (typeof to === "string" && to.trim()) return [to.trim()];
  return [];
}

async function dispatchViaResend({ to, subject, html, text, metadata }) {
  const body = {
    from: EMAIL_FROM,
    to,
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
    ...(metadata && typeof metadata === "object" ? { headers: { "X-Entity-Ref": String(metadata.entity_ref || "").slice(0, 120) } } : {}),
  };

  let res;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: `network_error: ${err && err.message ? err.message : String(err)}` };
  }

  let payload = null;
  try { payload = await res.json(); } catch { /* non-JSON response */ }

  if (!res.ok) {
    const message = payload && payload.message ? payload.message : `http_${res.status}`;
    return { ok: false, error: message };
  }

  const id = payload && payload.id ? String(payload.id) : null;
  return { ok: true, id };
}

export async function sendTransactionalEmail(input) {
  const {
    to,
    subject,
    html,
    text,
    type,
    metadata,
  } = input || {};

  const recipients = normalizeRecipients(to);
  if (recipients.length === 0) {
    console.warn("[email] skipped — missing or invalid `to`");
    return { ok: false, error: "missing_recipient" };
  }
  if (!subject || typeof subject !== "string") {
    console.warn("[email] skipped — missing subject");
    return { ok: false, error: "missing_subject" };
  }
  if (!html && !text) {
    console.warn("[email] skipped — missing html/text body");
    return { ok: false, error: "missing_body" };
  }

  if (!isConfigured()) {
    console.warn(`[email] no-op (type=${type || "unspecified"}) — missing RESEND_API_KEY or EMAIL_FROM`);
    return { ok: false, skipped: true, reason: "missing_email_provider_config" };
  }

  try {
    const result = await dispatchViaResend({ to: recipients, subject, html, text, metadata });
    if (result.ok) {
      console.log(`[email] sent (type=${type || "unspecified"}, id=${result.id || "n/a"})`);
    } else {
      console.error(`[email] failed (type=${type || "unspecified"}): ${result.error}`);
    }
    return result;
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.error(`[email] unexpected error (type=${type || "unspecified"}): ${message}`);
    return { ok: false, error: message };
  }
}

export default sendTransactionalEmail;
