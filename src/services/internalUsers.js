// ── Internal free users (billing/quota bypass) ───────────────────────────────
// Permanent allow-list of internal accounts that get full access regardless of
// subscription state, with no plan quotas applied. Used by billingAccess.js
// and planLimits.js — do not import elsewhere unless you also need to bypass.

export const INTERNAL_FREE_USERS = [
  "samuelchartrand99@gmail.com",
  "samuel.chartrand@intelcom.ca",
];

const INTERNAL_SET = new Set(INTERNAL_FREE_USERS.map(e => e.toLowerCase()));

export function isInternalFreeUser(email) {
  if (typeof email !== "string") return false;
  const norm = email.trim().toLowerCase();
  if (!norm) return false;
  return INTERNAL_SET.has(norm);
}
