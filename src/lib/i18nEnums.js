// ── HRBP OS — Shared enum translation helpers ───────────────────────────────
// Single source of truth for translating enum-shaped values used across modules.
// Each helper accepts the bound `t` from `useT()` and returns the localized
// label, falling back to the raw value when no translation key exists.
//
// Why centralized: case status, case risk, decision status/type/risk, and role
// labels were previously redeclared in 3+ modules each (Cases, Decisions, Home,
// Admin), which meant adding a new status required 3 edits to stay in sync.

// Canonical id lists (drive dropdowns, filters, fallback positions).
export const CASE_STATUS_IDS    = ["open", "in_progress", "waiting", "closed", "archived"];
export const DECISION_STATUS_IDS = ["draft", "decided", "reviewed", "archived"];
export const DECISION_TYPE_IDS   = ["discipline", "performance", "organizational", "talent", "legal", "other"];
export const DECISION_RISK_IDS   = ["low", "medium", "high"];
export const ROLE_IDS            = ["super_admin", "admin", "hrbp"];

// Case risk uses the French label as its canonical id (legacy data shape).
// Normalize to a translation-key suffix here so call sites don't need to know.
const CASE_RISK_KEY = { "Critique":"critical", "Élevé":"high", "Modéré":"moderate", "Faible":"low" };

// Builds a `(t, value) → label` helper for a given key prefix.
// `keyMap` (optional) translates a raw enum value into the suffix used in the
// dictionary — needed when the value isn't already i18n-friendly (e.g. "Élevé").
function makeT(prefix, keyMap) {
  return (t, value) => {
    if (value === null || value === undefined || value === "") return value;
    const suffix = keyMap ? keyMap[value] : value;
    if (!suffix) return value;
    const fullKey = `${prefix}.${suffix}`;
    const v = t(fullKey);
    return v === fullKey ? value : v;
  };
}

export const tStatus         = makeT("case.status");
export const tRisk           = makeT("case.risk", CASE_RISK_KEY);
export const tDecisionStatus = makeT("decision.status");
export const tDecisionType   = makeT("decision.type");
export const tDecisionRisk   = makeT("decision.risk");
export const tRole           = makeT("admin.role");
