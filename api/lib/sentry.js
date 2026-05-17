// ── Sentry wrapper (serverless) ──────────────────────────────────────────────
// Thin facade around @sentry/node for Vercel functions. No-op when SENTRY_DSN
// is unset. Single init via lazy boot — safe to call from every handler.
//
// Usage:
//   import { captureException, withSentry } from "./lib/sentry.js";
//   export default withSentry(async function handler(req, res) { ... });
//
// `withSentry` wraps the handler so any uncaught exception is reported and the
// caller receives a generic 500 — secrets never reach the response body.

import * as Sentry from "@sentry/node";

const DSN = process.env.SENTRY_DSN || "";
const ENVIRONMENT = process.env.SENTRY_ENV || process.env.VERCEL_ENV || "production";

let booted = false;

function boot() {
  if (booted || !DSN) return;
  try {
    Sentry.init({
      dsn: DSN,
      environment: ENVIRONMENT,
      release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA || undefined,
      tracesSampleRate: 0,
      sendDefaultPii: false,
      beforeSend(event) {
        try {
          if (event.request?.cookies) delete event.request.cookies;
          if (event.request?.headers) {
            const h = event.request.headers;
            for (const k of Object.keys(h)) {
              const lk = k.toLowerCase();
              if (lk === "authorization" || lk === "cookie"
                  || lk === "x-api-key" || lk === "stripe-signature") {
                delete h[k];
              }
            }
          }
        } catch {}
        return event;
      },
    });
    booted = true;
  } catch (err) {
    try { console.warn("[sentry/node] init failed:", err?.message || err); } catch {}
  }
}

export function captureException(error, context) {
  boot();
  if (!booted) {
    try { console.error("[capture]", error?.message || error, context || ""); } catch {}
    return;
  }
  try {
    Sentry.withScope((scope) => {
      if (context && typeof context === "object") {
        for (const [k, v] of Object.entries(context)) {
          if (v === undefined || v === null) continue;
          if (k === "tag" || k === "scope") {
            try { scope.setTag("component", String(v)); } catch {}
            continue;
          }
          try { scope.setExtra(k, v); } catch {}
        }
      }
      Sentry.captureException(error);
    });
  } catch {}
}

export function withSentry(handler) {
  return async function wrapped(req, res) {
    boot();
    try {
      return await handler(req, res);
    } catch (err) {
      captureException(err, {
        scope: "handler",
        method: req?.method,
        path: req?.url,
      });
      try { console.error("[handler-uncaught]", err?.message || err); } catch {}
      if (!res.headersSent) {
        res.status(500).json({ error: { message: "Erreur serveur" } });
      }
    }
  };
}

export const hasSentry = Boolean(DSN);
