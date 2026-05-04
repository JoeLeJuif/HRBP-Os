// ── Identity normalization & merge helpers ───────────────────────────────────
// Pure functions for matching and rewriting employee/manager names across
// jsonb-stored entities. Used by `src/services/identityMerge.js` to power
// the "merge duplicate" / "rename" flow, and safe to use against in-memory
// (localStorage) data too.
//
// Match rule: case-insensitive, accent-insensitive, whitespace-collapsed.
// "CHanny  Tremblay" and "channy tremblay" and "Channy Trémblay" all
// normalize to the same key. The replacement preserves the caller-provided
// `target` casing so the canonical display form is whatever the user typed.

export function normalizeIdentityKey(s) {
  if (s == null) return "";
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function identityMatches(value, source) {
  const v = normalizeIdentityKey(value);
  const s = normalizeIdentityKey(source);
  if (!v || !s) return false;
  return v === s;
}

// Each apply* helper returns { changed, value } where `value` is the original
// reference when no match was found (so callers can short-circuit equality
// checks) and a new object when at least one field was rewritten.

export function applyMergeToCaseData(c, source, target) {
  if (!c || typeof c !== "object") return { changed: false, value: c };
  let changed = false;
  const out = { ...c };
  if (identityMatches(c.employee, source)) { out.employee = target; changed = true; }
  if (identityMatches(c.director, source)) { out.director = target; changed = true; }
  return { changed, value: changed ? out : c };
}

export function applyMergeToInvestigationData(i, source, target) {
  if (!i || typeof i !== "object") return { changed: false, value: i };
  let changed = false;
  const out = { ...i };
  if (Array.isArray(i.people)) {
    let arrChanged = false;
    const next = i.people.map(p => {
      if (identityMatches(p, source)) { arrChanged = true; return target; }
      return p;
    });
    if (arrChanged) { out.people = next; changed = true; }
  }
  return { changed, value: changed ? out : i };
}

const MEETING_PEOPLE_CATEGORIES = ["performance", "leadership", "engagement"];

export function applyMergeToMeetingData(m, source, target) {
  if (!m || typeof m !== "object") return { changed: false, value: m };
  let changed = false;
  const out = { ...m };
  if (identityMatches(m.director,    source)) { out.director    = target; changed = true; }
  if (identityMatches(m.managerName, source)) { out.managerName = target; changed = true; }
  if (m.people && typeof m.people === "object") {
    let peopleChanged = false;
    const newPeople = { ...m.people };
    for (const cat of MEETING_PEOPLE_CATEGORIES) {
      const arr = m.people[cat];
      if (!Array.isArray(arr)) continue;
      let catChanged = false;
      const next = arr.map(p => {
        if (identityMatches(p, source)) { catChanged = true; return target; }
        return p;
      });
      if (catChanged) { newPeople[cat] = next; peopleChanged = true; }
    }
    if (peopleChanged) { out.people = newPeople; changed = true; }
  }
  return { changed, value: changed ? out : m };
}

export function applyMergeToBriefData(b, source, target) {
  if (!b || typeof b !== "object") return { changed: false, value: b };
  let changed = false;
  const out = { ...b };
  for (const key of ["director", "employee", "managerName", "manager_name"]) {
    if (identityMatches(b[key], source)) { out[key] = target; changed = true; }
  }
  return { changed, value: changed ? out : b };
}

// ── localStorage rewrite ─────────────────────────────────────────────────────
// HRBP OS still reads primarily from localStorage (the Supabase store is a
// shadow). This helper mirrors `mergeIdentity()` against the four jsonb-
// equivalent keys so the in-app view updates after a reload. Pure side-
// effect — returns a breakdown { cases, investigations, meetings, briefs }.
// Caller is expected to follow with a reload (or in-memory state refresh)
// so React picks up the new values.
//
// `localStorage` is consulted directly (not via the async sGet/sSet wrappers)
// so the helper stays sync; keeps the Admin handler simple.

const LS_KEYS = {
  cases:          "hrbp_os:cases",
  investigations: "hrbp_os:investigations",
  meetings:       "hrbp_os:meetings",
  briefs:         "hrbp_os:briefs",
};

// `dryRun=true` only counts what would change without touching localStorage —
// powers the Preview button in Admin's Rename panel.
function _rewriteLsArray(key, applyFn, source, target, dryRun = false) {
  let raw;
  try { raw = localStorage.getItem(key); } catch { return 0; }
  if (!raw) return 0;
  let arr;
  try { arr = JSON.parse(raw); } catch { return 0; }
  if (!Array.isArray(arr)) return 0;
  let updated = 0;
  const next = arr.map(item => {
    const { changed, value } = applyFn(item, source, target);
    if (changed) updated += 1;
    return value;
  });
  if (updated === 0 || dryRun) return updated;
  try { localStorage.setItem(key, JSON.stringify(next)); } catch { return 0; }
  return updated;
}

function _runLsBreakdown(sourceName, targetName, dryRun) {
  const breakdown = { cases: 0, investigations: 0, meetings: 0, briefs: 0 };
  if (typeof localStorage === "undefined") return breakdown;
  const s = typeof sourceName === "string" ? sourceName.trim() : "";
  const t = typeof targetName === "string" ? targetName.trim() : "";
  if (!s || !t || s === t) return breakdown;
  breakdown.cases          = _rewriteLsArray(LS_KEYS.cases,          applyMergeToCaseData,          s, t, dryRun);
  breakdown.investigations = _rewriteLsArray(LS_KEYS.investigations, applyMergeToInvestigationData, s, t, dryRun);
  breakdown.meetings       = _rewriteLsArray(LS_KEYS.meetings,       applyMergeToMeetingData,       s, t, dryRun);
  breakdown.briefs         = _rewriteLsArray(LS_KEYS.briefs,         applyMergeToBriefData,         s, t, dryRun);
  return breakdown;
}

export function applyMergeToLocalStorage(sourceName, targetName) {
  return _runLsBreakdown(sourceName, targetName, false);
}

export function previewMergeInLocalStorage(sourceName, targetName) {
  return _runLsBreakdown(sourceName, targetName, true);
}
