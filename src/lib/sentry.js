// ── Sentry wrapper (frontend) ────────────────────────────────────────────────
// Thin facade around @sentry/browser. If VITE_SENTRY_DSN is empty at build
// time, every function becomes a no-op — the SDK code is still bundled (small
// cost) but never initialized. Safe to call before init.
//
// Usage:
//   initSentry({ user, org, route })   // call once after auth resolves
//   captureException(err, context?)     // capture from anywhere
//   setUserContext({ id, org, role })   // update context post-init
//   setRouteContext(route)              // update current module/route tag
//
// All functions are exception-safe — they never throw and never block.

import * as Sentry from "@sentry/browser";

const DSN = process.env.VITE_SENTRY_DSN || "";
const ENVIRONMENT = process.env.VITE_SENTRY_ENV || "production";

let initialized = false;

export function initSentry(opts = {}) {
  if (initialized || !DSN) return;
  try {
    Sentry.init({
      dsn: DSN,
      environment: ENVIRONMENT,
      release: process.env.VITE_SENTRY_RELEASE || undefined,
      tracesSampleRate: 0,
      sendDefaultPii: false,
      beforeSend(event) {
        try {
          if (event.request?.cookies) delete event.request.cookies;
          if (event.request?.headers) {
            const h = event.request.headers;
            if (h.Authorization) delete h.Authorization;
            if (h.authorization) delete h.authorization;
            if (h.Cookie)        delete h.Cookie;
            if (h.cookie)        delete h.cookie;
          }
        } catch {}
        return event;
      },
    });
    initialized = true;
    if (opts && typeof opts === "object") {
      if (opts.user)  setUserContext(opts.user);
      if (opts.route) setRouteContext(opts.route);
    }
  } catch (err) {
    try { console.warn("[sentry] init failed:", err?.message || err); } catch {}
  }
}

export function captureException(error, context) {
  if (!initialized || !DSN) {
    try { console.error("[capture]", error, context || ""); } catch {}
    return;
  }
  try {
    Sentry.withScope((scope) => {
      if (context && typeof context === "object") {
        for (const [k, v] of Object.entries(context)) {
          if (v === undefined || v === null) continue;
          try { scope.setExtra(k, v); } catch {}
        }
        if (context.scope) scope.setTag("component", String(context.scope));
      }
      Sentry.captureException(error);
    });
  } catch {}
}

export function setUserContext({ id, email, org, role } = {}) {
  if (!initialized) return;
  try {
    Sentry.setUser(id || email ? { id: id || undefined, email: email || undefined } : null);
    if (org)  Sentry.setTag("organization_id", String(org));
    if (role) Sentry.setTag("role", String(role));
  } catch {}
}

export function setRouteContext(route) {
  if (!initialized) return;
  try { Sentry.setTag("route", String(route || "unknown")); } catch {}
}

export function clearUserContext() {
  if (!initialized) return;
  try { Sentry.setUser(null); } catch {}
}

export const hasSentry = Boolean(DSN);
