// ── Billing access rules / entitlements ──────────────────────────────────────
// Single source of truth for "does this org get full access right now?" based
// only on the local `subscriptions.status` column. No grace period, no quotas,
// no emails, no suspension UI — those land in later steps. Pure function, no
// side effects, no Supabase calls. Safe to import from anywhere.
//
//   getBillingAccess(subscription, userEmail?) → {
//     hasFullAccess: boolean,
//     isLimited:     boolean,
//     status:        string | null,
//     reason:        "billing_active" | "billing_limited" | "internal_free_user",
//   }
//
//   hasFullBillingAccess(subscription, userEmail?) → boolean
//
// Full access: status ∈ { "active", "trialing" }.
// Anything else (past_due, unpaid, canceled, cancelled, incomplete,
// incomplete_expired, null/undefined, unknown strings) → limited.
//
// Internal free users (see services/internalUsers.js) bypass all checks and
// always return full access with status "internal_free".

import { isInternalFreeUser } from "./internalUsers.js";

const FULL_ACCESS_STATUSES = new Set(["active", "trialing"]);

export function getBillingAccess(subscription, userEmail = null) {
  if (isInternalFreeUser(userEmail)) {
    return {
      hasFullAccess: true,
      isLimited: false,
      status: "internal_free",
      reason: "internal_free_user",
    };
  }
  const raw = subscription && typeof subscription === "object"
    ? subscription.status
    : null;
  const status = typeof raw === "string" && raw.length > 0 ? raw : null;
  const full = status !== null && FULL_ACCESS_STATUSES.has(status);
  return {
    hasFullAccess: full,
    isLimited: !full,
    status,
    reason: full ? "billing_active" : "billing_limited",
  };
}

export function hasFullBillingAccess(subscription, userEmail = null) {
  return getBillingAccess(subscription, userEmail).hasFullAccess;
}
