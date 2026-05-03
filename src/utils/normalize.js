// ── NORMALIZE UTILS ───────────────────────────────────────────────────────────
// Source: HRBP_OS.jsx L.37-49 + L.247-262

import { toArray } from "./meetingModel.js";

// Normalize risk level strings from AI (unaccented → accented display key)
export function normalizeRisk(r) {
  if (!r) return "Modéré";
  const map = { "Critique":"Critique","Eleve":"Élevé","Elevé":"Élevé","Élevé":"Élevé",
    "Modere":"Modéré","Modéré":"Modéré","Moderé":"Modéré","Faible":"Faible","faible":"Faible" };
  return map[r] || r;
}

// Normalize delay strings
export function normalizeDelay(d) {
  if (!d) return d;
  const map = { "Immediat":"Immédiat","Immédiat":"Immédiat","Immediate":"Immédiat",
    "24h":"24h","7 jours":"7 jours","30 jours":"30 jours","Continu":"Continu","Hebdo":"Continu" };
  return map[d] || d;
}

// Normalize AI-returned data objects — fix accents, dates, missing fields
export function normalizeAIData(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const clone = { ...obj };
  // Normalize risk fields
  const riskFields = ["overallRisk","riskLevel","level","urgencyLevel","risque"];
  riskFields.forEach(f => { if (clone[f]) clone[f] = normalizeRisk(clone[f]); });
  // Normalize delay fields
  const delayFields = ["delay","urgency"];
  delayFields.forEach(f => { if (clone[f]) clone[f] = normalizeDelay(clone[f]); });
  // Recurse into arrays
  Object.keys(clone).forEach(k => {
    if (Array.isArray(clone[k])) clone[k] = clone[k].map(v => typeof v === "object" && v !== null ? normalizeAIData(v) : v);
    else if (clone[k] && typeof clone[k] === "object") clone[k] = normalizeAIData(clone[k]);
  });
  return clone;
}

// ── CASE / INVESTIGATION NORMALIZERS ─────────────────────────────────────────
// Pure, idempotent (except updatedAt), never throw. Return null on invalid input.

function _str(v, fallback = "") {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "string") return v;
  try { return String(v); } catch { return fallback; }
}

function _pickEnum(v, allowed, fallback) {
  return allowed.indexOf(v) !== -1 ? v : fallback;
}

function _isoOrNull(v) {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString();
  return null;
}

const CASE_TYPES = ["performance","pip","conflict_ee","conflict_em","complaint","immigration","retention","promotion","return","reorg","exit","investigation"];
// Canonical case statuses. `archived` doubles as a status value AND a boolean
// flag (`c.archived === true`) for back-compat with the existing archive flow.
// Deletion only enters the system via saveCases reconciliation — never via
// transitionCase.
export const CASE_STATUSES = ["open","in_progress","waiting","closed","archived","deleted"];
export const CASE_STATUS_DEFAULT = "open";
// Legacy → canonical migration. Applied in normalizeCase so old rows hydrate
// to a valid value without a separate backfill script. Anything not in the
// map and not already canonical falls back to the default.
const LEGACY_STATUS_MAP = {
  active: "in_progress",
  pending: "waiting",
  resolved: "closed",
  escalated: "in_progress",
};
function _migrateStatus(s, archivedFlag) {
  if (archivedFlag === true) return "archived";
  const raw = typeof s === "string" ? s.trim().toLowerCase() : "";
  if (!raw) return CASE_STATUS_DEFAULT;
  if (CASE_STATUSES.indexOf(raw) !== -1) return raw;
  return LEGACY_STATUS_MAP[raw] || CASE_STATUS_DEFAULT;
}
const CASE_OWNERS = ["HRBP","Gestionnaire","HRBP + Gestionnaire","Direction"];
const CASE_SCOPES = ["leader","individual","team","org"];
const CASE_URGENCIES = ["Immédiat","Cette semaine","Ce mois","En veille"];
const CASE_EVOLUTIONS = ["","Nouveau","En cours","Aggravé","En amélioration","Bloqué","Résolu"];
const CASE_POSTURES = ["","Partenaire","Garant","Coach","Neutre","Enquêteur"];

export function normalizeCase(c) {
  if (c === null || c === undefined) return null;
  if (typeof c !== "object" || Array.isArray(c)) return null;
  try {
    const createdAt =
      _isoOrNull(c.createdAt) ||
      _isoOrNull(c.dateCreated) ||
      _isoOrNull(c.savedAt) ||
      _isoOrNull(c.openDate) ||
      new Date().toISOString();

    const rawUrgency = normalizeDelay(c.urgency);
    const urgency =
      rawUrgency === null || rawUrgency === undefined || rawUrgency === ""
        ? ""
        : _pickEnum(rawUrgency, CASE_URGENCIES, rawUrgency);

    // Phase 3 Batch 1: align legacy `archived` boolean with canonical
    // `status === "archived"`. Either signal flips both. Pre-Phase-2.5 rows
    // that have one without the other get reconciled here on every read,
    // so downstream code can trust either field equivalently.
    const status = _migrateStatus(c.status, c.archived === true);
    const out = {
      ...c,
      id: _str(c.id, "") || String(Date.now()),
      title: _str(c.title).trim() || "(sans titre)",
      type: _pickEnum(_str(c.type).toLowerCase(), CASE_TYPES, "performance"),
      riskLevel: normalizeRisk(c.riskLevel),
      status,
      archived: status === "archived",
      director: _str(c.director).trim(),
      employee: _str(c.employee).trim(),
      department: _str(c.department).trim(),
      province: _str(c.province).trim().toUpperCase() || "QC",
      openDate: _isoOrNull(c.openDate),
      dueDate: _isoOrNull(c.dueDate),
      closedDate: _isoOrNull(c.closedDate),
      situation: _str(c.situation),
      interventionsDone: _str(c.interventionsDone),
      hrPosition: _str(c.hrPosition),
      decision: _str(c.decision),
      nextFollowUp: _str(c.nextFollowUp),
      notes: _str(c.notes),
      actions: toArray(c.actions),
      owner: _pickEnum(_str(c.owner), CASE_OWNERS, "HRBP"),
      scope: _pickEnum(_str(c.scope), CASE_SCOPES, "leader"),
      urgency,
      evolution: _pickEnum(_str(c.evolution), CASE_EVOLUTIONS, ""),
      hrPosture: _pickEnum(_str(c.hrPosture), CASE_POSTURES, ""),
      createdAt,
      dateCreated: _isoOrNull(c.dateCreated) || createdAt,
      savedAt: _isoOrNull(c.savedAt) || createdAt,
      updatedAt: _isoOrNull(c.updatedAt) || new Date().toISOString(),
    };
    if (c.meetingId !== undefined && c.meetingId !== null) {
      out.meetingId = _str(c.meetingId);
    }
    return out;
  } catch {
    return null;
  }
}

const INV_STATUSES = ["draft","complete"];
const INV_SOURCES = ["meeting-engine-express","manual","other"];

export function normalizeInvestigation(i) {
  if (i === null || i === undefined) return null;
  if (typeof i !== "object" || Array.isArray(i)) return null;
  try {
    const createdAt =
      _isoOrNull(i.createdAt) ||
      _isoOrNull(i.savedAt) ||
      new Date().toISOString();

    const caseTitle = _str(i.caseTitle).trim();
    const title = _str(i.title).trim() || caseTitle;

    let caseData = i.caseData;
    if (caseData && typeof caseData === "object") {
      caseData = normalizeAIData(caseData);
    } else if (caseData === undefined) {
      caseData = null;
    }

    return {
      ...i,
      id: _str(i.id, "") || String(Date.now()),
      caseId: i.caseId === null || i.caseId === undefined ? null : _str(i.caseId),
      caseTitle,
      caseType: _pickEnum(_str(i.caseType).toLowerCase(), CASE_TYPES, "investigation"),
      urgencyLevel: normalizeRisk(i.urgencyLevel),
      province: _str(i.province).trim().toUpperCase() || "QC",
      caseData,
      people: toArray(i.people),
      title,
      titleAuto: Boolean(i.titleAuto),
      linkedCaseId: i.linkedCaseId === null || i.linkedCaseId === undefined ? null : _str(i.linkedCaseId),
      status: _pickEnum(_str(i.status), INV_STATUSES, "draft"),
      source: _pickEnum(_str(i.source), INV_SOURCES, "manual"),
      enrichedAt: _isoOrNull(i.enrichedAt),
      createdAt,
      savedAt: _isoOrNull(i.savedAt) || createdAt,
      updatedAt: _isoOrNull(i.updatedAt) || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
