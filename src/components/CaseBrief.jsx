// ── CaseBrief — auto-generated 30-sec Copilot brief shown on Case detail open.
// Triggers a focused callAIText on caseId change. Cached in module-scope to avoid
// re-calling when the user navigates list ↔ detail. Display only — never writes
// back to the Case.

import { useState, useEffect, useRef } from "react";
import { C } from '../theme.js';
import Mono from '../components/Mono.jsx';
import { callAIText } from '../api/index.js';
import { CASE_BRIEF_SP } from '../prompts/copilot.js';
import { buildLegalPromptContext } from '../utils/legal.js';

// Session-scoped cache: caseId → brief text. Survives unmount/remount.
const briefCache = new Map();

function findSimilarCase(caseObj, allCases) {
  if (!caseObj?.type) return null;
  return (allCases || []).find(c =>
    c.id !== caseObj.id &&
    c.type === caseObj.type &&
    (c.status === "resolved" || c.status === "closed")
  ) || null;
}

function buildBriefUserMsg(caseObj, data) {
  const province = caseObj.province || data.profile?.defaultProvince || "QC";
  const legalCtx = buildLegalPromptContext(province);
  const similar = findSimilarCase(caseObj, data.cases);

  const similarBlock = similar
    ? `## CAS SIMILAIRE DANS L'OS

Titre : ${similar.title || "(sans titre)"}
Statut : ${similar.status || ""}
Décision / Résolution : ${similar.decision || similar.hrPosition || "(non documentée)"}
Notes : ${similar.notes || "(aucune)"}`
    : `## CAS SIMILAIRE

Aucun cas similaire fermé ou résolu trouvé dans l'OS.`;

  return `## DOSSIER OUVERT

Titre : ${caseObj.title || "(sans titre)"}
Type : ${caseObj.type || "non défini"}
Risque déclaré : ${caseObj.riskLevel || "non défini"}
Urgence : ${caseObj.urgency || "non définie"}
Évolution : ${caseObj.evolution || "non renseignée"}
Posture RH : ${caseObj.hrPosture || "non renseignée"}
Province : ${province}
Gestionnaire : ${caseObj.director || "non défini"}
Employé / Groupe : ${caseObj.employee || "non défini"}
Département : ${caseObj.department || "non défini"}

Situation : ${caseObj.situation || "(non documentée)"}
Interventions déjà faites : ${caseObj.interventionsDone || "(aucune)"}
Position RH actuelle : ${caseObj.hrPosition || "(non définie)"}
Décision actuelle : ${caseObj.decision || "(aucune)"}
Notes HRBP : ${caseObj.notes || "(aucune)"}

## CADRE LÉGAL APPLICABLE (${province})

${legalCtx}

${similarBlock}`;
}

function renderBrief(raw) {
  if (!raw) return null;
  const sections = [];
  let current = null;
  for (const line of raw.split("\n")) {
    if (line.startsWith("## ")) {
      if (current) sections.push(current);
      current = { heading: line.replace(/^##\s*/, "").trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);

  return sections.map((s, i) => {
    const body = s.lines.join("\n").trim();
    if (!body) return null;
    return (
      <div key={i} style={{ marginBottom: 10 }}>
        <Mono color={C.em} size={9}>{s.heading.toUpperCase()}</Mono>
        <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6, marginTop: 4 }}>
          {body.split("\n").map((line, j) => {
            if (line.startsWith("- ") || line.startsWith("* ")) {
              return (
                <div key={j} style={{ display: "flex", gap: 8, marginBottom: 3, alignItems: "flex-start" }}>
                  <span style={{ color: C.em, fontSize: 10, marginTop: 4, flexShrink: 0 }}>▸</span>
                  <span>{line.replace(/^[-*]\s*/, "")}</span>
                </div>
              );
            }
            if (line.trim() === "") return <div key={j} style={{ height: 4 }} />;
            return <div key={j} style={{ marginBottom: 2 }}>{line}</div>;
          })}
        </div>
      </div>
    );
  }).filter(Boolean);
}

export default function CaseBrief({ caseObj, data }) {
  const cached = briefCache.get(caseObj.id) || null;
  const [text, setText] = useState(cached);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const lastKeyRef = useRef(null);

  useEffect(() => {
    const key = `${caseObj.id}::${refreshTick}`;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;

    if (refreshTick === 0 && briefCache.has(caseObj.id)) {
      setText(briefCache.get(caseObj.id));
      setLoading(false);
      setError("");
      return;
    }

    let cancelled = false;
    setText(null);
    setError("");
    setLoading(true);

    callAIText(CASE_BRIEF_SP, buildBriefUserMsg(caseObj, data), 1000)
      .then(t => {
        if (cancelled) return;
        briefCache.set(caseObj.id, t);
        setText(t);
      })
      .catch(e => { if (!cancelled) setError(e.message || "Erreur brief"); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [caseObj.id, refreshTick]); // eslint-disable-line

  const regenerate = () => {
    briefCache.delete(caseObj.id);
    setRefreshTick(t => t + 1);
  };

  return (
    <div style={{
      background: C.em + "0a",
      border: `1px solid ${C.em}33`,
      borderLeft: `3px solid ${C.em}`,
      borderRadius: 8,
      padding: "12px 14px",
      marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: (loading || error || text) ? 10 : 0 }}>
        <span style={{ fontSize: 13 }}>⚡</span>
        <Mono color={C.em} size={10}>BRIEF COPILOT (30 SEC)</Mono>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {loading && (
            <span style={{ fontSize: 10, color: C.textD, fontFamily: "'DM Mono',monospace" }}>
              Génération…
            </span>
          )}
          {!loading && (text || error) && (
            <button onClick={regenerate} title="Régénérer le brief"
              style={{ background: "none", border: `1px solid ${C.border}`, color: C.textD,
                borderRadius: 5, padding: "2px 8px", fontSize: 10, cursor: "pointer",
                fontFamily: "'DM Mono',monospace" }}>↻ Régénérer</button>
          )}
        </span>
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
          <div style={{ width: 14, height: 14, border: `2px solid ${C.surfLL}`,
            borderTop: `2px solid ${C.em}`, borderRadius: "50%",
            animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 11, color: C.textM }}>
            Lecture du dossier · cadre légal · cas similaires…
          </span>
        </div>
      )}

      {error && !loading && (
        <div style={{ fontSize: 11, color: C.red }}>⚠ Brief indisponible : {error}</div>
      )}

      {text && !loading && renderBrief(text)}
    </div>
  );
}
