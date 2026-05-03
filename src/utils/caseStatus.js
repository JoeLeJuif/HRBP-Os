// ── Shared case-status helpers ───────────────────────────────────────────────
// Single source of truth for what counts as an "inactive" case across widgets.
// A case is considered inactive when its status is closed, resolved, done or archived.
// Missing / unknown status → treated as active (legacy data has no status field).

import { C } from '../theme.js';

// Canonical inactive set is { closed, archived, deleted }. Legacy values stay
// listed so that any case bypassing normalizeCase (e.g. raw Supabase row) is
// still classified correctly until it next round-trips through normalize.
// `deleted` was added in Phase 3 Batch 3.1 — deleted rows must always be
// classified as inactive so they never appear in active-case widgets.
export const INACTIVE_CASE_STATUSES = ["closed", "archived", "deleted", "resolved", "done", "fermé", "ferme"];

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

// Is the given ISO date within the current ISO week (Monday → Sunday)?
function isDateInCurrentWeek(isoDate) {
  if (!isoDate) return false;
  const d = new Date(typeof isoDate === "string" && isoDate.length === 10 ? isoDate + "T00:00:00" : isoDate);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
  const nextMonday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
  return d >= monday && d < nextMonday;
}

const URGENCY_TONE = { "Immediat": C.red, "Cette semaine": C.amber, "Ce mois": C.blue, "En veille": C.textD };

// Resolve the temporal badge for a case — returns null or { label, tone }.
// Closed/resolved cases short-circuit before any "Cette semaine" computation:
// the stored c.urgency is a user-set field that stays after closure, so we
// ignore it and use the business close date (closedDate / closedAt / dateFermeture)
// to derive "Fermé cette semaine" or nothing at all.
export function getCaseTimeBadge(caseItem) {
  if (!caseItem) return null;
  if (isCaseInactive(caseItem)) {
    const closedDate = caseItem.closedDate || caseItem.closedAt || caseItem.dateFermeture;
    if (closedDate && isDateInCurrentWeek(closedDate)) {
      return { label: "Fermé cette semaine", tone: C.textD };
    }
    return null;
  }
  const u = caseItem.urgency;
  if (!u) return null;
  return { label: u, tone: URGENCY_TONE[u] || C.textD };
}
