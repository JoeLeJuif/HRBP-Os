// ── Shared case-status helpers ───────────────────────────────────────────────
// Single source of truth for what counts as an "inactive" case across widgets.
// A case is considered inactive when its status is closed, resolved, done or archived.
// Missing / unknown status → treated as active (legacy data has no status field).

export const INACTIVE_CASE_STATUSES = ["closed", "resolved", "done", "archived"];

export function isCaseInactive(c) {
  if (!c) return false;
  const s = typeof c.status === "string" ? c.status.toLowerCase() : "";
  return s !== "" && INACTIVE_CASE_STATUSES.includes(s);
}

export function isCaseActive(c) {
  return !isCaseInactive(c);
}

export function filterActiveCases(cases) {
  return (cases || []).filter(isCaseActive);
}
