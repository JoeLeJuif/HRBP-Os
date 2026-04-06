// ── NORMALIZE UTILS ───────────────────────────────────────────────────────────
// Source: HRBP_OS.jsx L.37-49 + L.247-262

// Normalize risk level strings from AI (unaccented → accented display key)
export function normalizeRisk(r) {
  if (!r) return "Modéré";
  const map = { "Critique":"Critique","Eleve":"Élevé","Elevé":"Élevé","Élevé":"Élevé","Eleve":"Élevé",
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
