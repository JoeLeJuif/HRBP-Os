// ── MEETING OUTPUT NORMALIZATION ─────────────────────────────────────────────
// Single source of truth for the shape consumed by Meetings.jsx / MeetingEngine.jsx
// detail tabs. Ensures array-typed fields are always arrays so UI code doesn't
// need per-call defensive wrapping.

// Placeholder strings the AI or fallback layer may emit instead of "no data".
// Treated as empty so the UI renders the empty state, not a literal placeholder bullet.
const EMPTY_PLACEHOLDERS = new Set([
  "a completer", "à compléter", "a compléter", "à completer",
  "n/d", "n/a", "none", "aucun", "aucune",
]);

function isPlaceholder(s) {
  return EMPTY_PLACEHOLDERS.has(String(s).trim().toLowerCase());
}

export function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || isPlaceholder(trimmed)) return [];
    return [trimmed];
  }
  return [value];
}

const ARRAY_FIELDS = [
  "summary", "signals", "risks", "actions", "questions", "decisions",
  "keySignals", "mainRisks", "hrbpFollowups", "nextMeetingQuestions",
  "crossQuestions", "postes", "blocages", "blocagesGlobaux", "initiatives",
  "sanctions", "risquesLegaux", "documentationRequise", "pointsVigilance",
];

export function normalizeMeetingOutput(raw) {
  if (!raw || typeof raw !== "object") return raw;
  const out = { ...raw };

  ARRAY_FIELDS.forEach(f => { out[f] = toArray(out[f]); });

  // people canonicalization — accept `participants` as legacy alias, prefer `people`
  const peopleSrc = (out.people && typeof out.people === "object") ? out.people
                  : (raw.participants && typeof raw.participants === "object") ? raw.participants
                  : {};
  out.people = {
    ...peopleSrc,
    performance: toArray(peopleSrc.performance),
    leadership:  toArray(peopleSrc.leadership),
    engagement:  toArray(peopleSrc.engagement),
  };

  // caseEntry: nullable object (NOT an array). Accept caseLog / case_log as aliases.
  const ce = out.caseEntry || raw.caseLog || raw.case_log || null;
  out.caseEntry = (ce && typeof ce === "object" && (ce.title || ce.titre)) ? ce : null;

  // Nested: each crossQuestions entry's own `questions` must also be an array.
  out.crossQuestions = out.crossQuestions.map(cq =>
    (cq && typeof cq === "object") ? { ...cq, questions: toArray(cq.questions) } : cq
  );

  return out;
}
