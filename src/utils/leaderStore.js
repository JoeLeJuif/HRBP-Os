// ── LEADER EDITORIAL OVERLAY ──────────────────────────────────────────────────
// Lightweight editorial layer on top of Leader.jsx auto-discovery.
// Keyed by normalized leader name. Persisted in data.leaders (object map).
// Auto-migrates legacy data.portfolio[] on first read.

import { normKey } from './format.js';

export const MANAGER_TYPES = ["Solide","Évitant","Surchargé","Micromanager","Politique","En développement"];
export const PRESSURE_LEVELS = ["Elevee","Moderee","Faible"];
export const RISK_LEVELS = ["Critique","Élevé","Modéré","Faible"];

export const TYPE_ICON = {
  "Solide":"✅", "Évitant":"🫥", "Evitant":"🫥",
  "Surchargé":"🔥", "Surcharge":"🔥",
  "Micromanager":"🔬", "Politique":"🎭",
  "En développement":"🌱", "En developpement":"🌱",
};
export const PRESSURE_EMOJI = { "Elevee":"🔴", "Élevée":"🔴", "Moderee":"🟡", "Modérée":"🟡", "Faible":"🟢" };

export function emptyMeta() {
  return {
    type:"", pressure:"", riskOverride:"",
    topIssue:"", nextAction:"", execSummary:"",
    tags:[], lastInteraction:"", updatedAt:"",
    legacy:{},
  };
}

// Returns the leaders object map. Migrates from data.portfolio[] if data.leaders
// is empty/absent. Pure — does not mutate data.
export function getLeadersMap(data) {
  const existing = data.leaders;
  if (existing && typeof existing === "object" && !Array.isArray(existing) && Object.keys(existing).length > 0) {
    return existing;
  }
  // Migration from legacy portfolio
  const portfolio = Array.isArray(data.portfolio) ? data.portfolio : [];
  if (portfolio.length === 0) return {};
  const out = {};
  portfolio.forEach(p => {
    if (!p?.name) return;
    const key = normKey(p.name);
    if (!key) return;
    const known = ["id","name","team","level","risk","pressure","type","topIssue","hrbpAction","lastInteraction","notes"];
    const legacy = {};
    Object.keys(p).forEach(k => { if (!known.includes(k)) legacy[k] = p[k]; });
    out[key] = {
      type: p.type || "",
      pressure: p.pressure || "",
      riskOverride: p.risk || "",
      topIssue: p.topIssue || "",
      nextAction: p.hrbpAction || "",
      execSummary: p.notes || "",
      tags: [],
      lastInteraction: p.lastInteraction || "",
      updatedAt: new Date().toISOString().split("T")[0],
      legacy,
    };
  });
  return out;
}

export function getMeta(name, leadersMap) {
  if (!name) return emptyMeta();
  const k = normKey(name);
  return leadersMap[k] || emptyMeta();
}

export function setMeta(leadersMap, name, patch) {
  const k = normKey(name);
  if (!k) return leadersMap;
  const cur = leadersMap[k] || emptyMeta();
  const next = { ...cur, ...patch, updatedAt:new Date().toISOString().split("T")[0] };
  return { ...leadersMap, [k]: next };
}

const RISK_ORDER = { "Critique":0, "Élevé":1, "Eleve":1, "Modéré":2, "Modere":2, "Faible":3 };

// Compute "where to spend my next 5 HRBP hours" score for one leader.
// Inputs: autoLeader (from Leader.jsx buildLeaderIndex), meta (editorial overlay).
// Returns { score, reasons[] }
export function computeFocusScore(autoLeader, meta, todayISO) {
  let score = 0;
  const reasons = [];

  // Risk weight — prefer override, fallback to worst auto risk
  const activeCases = (autoLeader.cases || []).filter(c => c.status !== "closed" && c.status !== "resolved");
  const lastMeeting = (autoLeader.meetings || [])[0];
  const autoRisks = [...activeCases.map(c => c.riskLevel), lastMeeting?.analysis?.overallRisk].filter(Boolean);
  const minOrder = autoRisks.length ? Math.min(...autoRisks.map(r => RISK_ORDER[r] ?? 3)) : 3;
  const overrideOrder = meta.riskOverride ? RISK_ORDER[meta.riskOverride] ?? 3 : 9;
  const effectiveOrder = Math.min(minOrder, overrideOrder === 9 ? minOrder : overrideOrder);
  score += (3 - effectiveOrder) * 30;
  if (effectiveOrder === 0) reasons.push("risque critique");
  else if (effectiveOrder === 1) reasons.push("risque élevé");

  // Days since last interaction (meta override or last meeting)
  const lastDate = meta.lastInteraction || lastMeeting?.savedAt || null;
  const days = lastDate ? Math.floor((new Date(todayISO) - new Date(lastDate)) / 86400000) : 99;
  if (days > 21) { score += 20; reasons.push(`${days}j sans contact`); }
  else if (days > 14) { score += 10; reasons.push(`${days}j sans contact`); }

  // Pressure
  if (meta.pressure === "Elevee" || meta.pressure === "Élevée") { score += 15; reasons.push("pression élevée"); }

  // Manager type patterns
  if (meta.type === "Évitant" || meta.type === "Evitant") { score += 10; reasons.push("pattern évitant"); }
  if (meta.type === "Surchargé" || meta.type === "Surcharge") { score += 8; reasons.push("débordé"); }

  // Active cases multiplier
  if (activeCases.length >= 2) { score += 5; }

  return { score, reasons: reasons.slice(0, 3), days };
}

// Returns top N leaders sorted by focus score.
// autoLeaders: array from Object.values(buildLeaderIndex(data))
export function topFocusLeaders(autoLeaders, leadersMap, todayISO, n = 3) {
  return autoLeaders
    .map(l => {
      const meta = getMeta(l.name, leadersMap);
      const f = computeFocusScore(l, meta, todayISO);
      return { ...l, _meta: meta, _focus: f };
    })
    .filter(x => x._focus.score > 10)
    .sort((a, b) => b._focus.score - a._focus.score)
    .slice(0, n);
}
