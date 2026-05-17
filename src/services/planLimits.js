// ── Plan limits / usage quotas (Sprint 3 — Étape 4) ──────────────────────────
// Single source of truth for "how much of resource X is the org allowed to
// create on plan Y?". Pure helpers, no Supabase calls, no side effects — safe
// to import from any module.
//
// Plan detection:
//   - `subscription.status === 'trialing'` → "trial" limits (regardless of
//     which plan row the subscription points at).
//   - Otherwise resolved from `subscription.plan.code` (PostgREST embed) or
//     `subscription.plan_code` fallback. Unknown / missing code → "trial".
//   - `null` / `undefined` subscription → "trial".
//
// Limits convention:
//   - integer  → hard cap; current count must be strictly less than this to
//                allow one more creation.
//   - `null`   → unlimited; never blocks.

const UNLIMITED = null;

export const PLAN_LIMITS = {
  trial: {
    cases:          10,
    meetings:       10,
    users:          3,
    investigations: 2,
  },
  starter: {
    cases:          50,
    meetings:       50,
    users:          10,
    investigations: 5,
  },
  pro: {
    cases:          UNLIMITED,
    meetings:       UNLIMITED,
    users:          50,
    investigations: 25,
  },
  enterprise: {
    cases:          UNLIMITED,
    meetings:       UNLIMITED,
    users:          UNLIMITED,
    investigations: UNLIMITED,
  },
};

const RESOURCE_LABELS = {
  cases:          "dossiers",
  meetings:       "rencontres",
  users:          "utilisateurs",
  investigations: "enquêtes",
};

const PLAN_KEYS = new Set(Object.keys(PLAN_LIMITS));

export function resolvePlanKey(subscription) {
  if (!subscription || typeof subscription !== "object") return "trial";
  if (subscription.status === "trialing") return "trial";
  const code = (subscription.plan && subscription.plan.code)
    || subscription.plan_code
    || null;
  if (code && PLAN_KEYS.has(code)) return code;
  return "trial";
}

export function getPlanLimits(subscription) {
  return PLAN_LIMITS[resolvePlanKey(subscription)] || PLAN_LIMITS.trial;
}

export function getUsageLimit(subscription, resourceKey) {
  const limits = getPlanLimits(subscription);
  if (Object.prototype.hasOwnProperty.call(limits, resourceKey)) {
    return limits[resourceKey];
  }
  return UNLIMITED;
}

export function isUsageAllowed(subscription, resourceKey, currentCount) {
  const limit = getUsageLimit(subscription, resourceKey);
  if (limit === UNLIMITED) return true;
  const n = Number(currentCount);
  if (!Number.isFinite(n)) return true;
  return n < limit;
}

export function getLimitMessage(resourceKey, limit) {
  if (limit === UNLIMITED || limit == null) return "";
  const label = RESOURCE_LABELS[resourceKey] || resourceKey;
  return `Limite de ${limit} ${label} atteinte pour votre plan. `
    + `Veuillez mettre à niveau votre abonnement (Admin → Facturation).`;
}

// Convenience wrapper for the typical "check before create" callsite. Returns
// { allowed:true } when creation is permitted, or { allowed:false, message }
// with a ready-to-display reason string when blocked.
export function checkUsage(subscription, resourceKey, currentCount) {
  if (isUsageAllowed(subscription, resourceKey, currentCount)) {
    return { allowed: true };
  }
  const limit = getUsageLimit(subscription, resourceKey);
  return { allowed: false, message: getLimitMessage(resourceKey, limit), limit };
}
