// ── MODULE: WEEKLY BRIEF ──────────────────────────────────────────────────────
// Source: HRBP_OS.jsx L.2169–3239

import { useState, useEffect } from "react";
import Mono     from '../components/Mono.jsx';
import Badge    from '../components/Badge.jsx';
import Card     from '../components/Card.jsx';
import AILoader from '../components/AILoader.jsx';
import { BRIEF_SP, RECAP_SP, NEXT_WEEK_LOCK_SP } from '../prompts/brief.js';
import { callAI, callAIJson } from '../api/index.js';
import { fmtDate } from '../utils/format.js';
import { filterActiveCases } from '../utils/caseStatus.js';
import { getCaseFollowUp, followUpToText, fetchTasksForCases } from '../utils/caseFollowUp.js';
import { toArray } from '../utils/meetingModel.js';
import { C, css, DELAY_C, RISK } from '../theme.js';
import { useT } from '../lib/i18n.js';

// ── Inline shared helpers ─────────────────────────────────────────────────────
function RiskBadge({ level }) {
  const r = RISK[level] || RISK["Modéré"];
  return <span style={{ background:r.color+"22", color:r.color, border:`1px solid ${r.color}44`,
    borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:600,
    fontFamily:"'DM Mono',monospace", letterSpacing:.4, whiteSpace:"nowrap" }}>{level||"—"}</span>;
}
function SecHead({ icon, label, color=C.em }) {
  return <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:12 }}>
    <span style={{ fontSize:13 }}>{icon}</span>
    <Mono color={color} size={9}>{label}</Mono>
  </div>;
}

// ── Module ────────────────────────────────────────────────────────────────────
export default function ModuleBrief({ data, onSave }) {
  const { t } = useT();
  const [view, setView] = useState("new");
  const [briefTab, setBriefTab] = useState("brief"); // brief | recap
  const [inputs, setInputs] = useState({ meetings:"", signals:"", cases:"", kpi:"", other:"", weekOf:"" });

  // Recap — auto-generated from week history
  const [recapSubTab, setRecapSubTab] = useState("generate"); // generate | sent | history
  const [sentRecapText, setSentRecapText] = useState("");
  const [sentRecapSaved, setSentRecapSaved] = useState(false);
  const [editingRecapId, setEditingRecapId] = useState(null);
  const [recapResult, setRecapResult] = useState(null);
  const [recapLoading, setRecapLoading] = useState(false);
  const [recapError, setRecapError] = useState("");
  const [copied, setCopied] = useState(false);
  const [recapPrompt, setRecapPrompt] = useState("");

  // ── Next Week Lock state ──────────────────────────────────────────────────
  const [nwlSourceIdx, setNwlSourceIdx] = useState(0);   // index into sentRecaps (0 = latest)
  const [nwlResult, setNwlResult]       = useState(null);
  const [nwlLoading, setNwlLoading]     = useState(false);
  const [nwlError, setNwlError]         = useState("");
  const [nwlSaved, setNwlSaved]         = useState(false);
  const [nwlCopied, setNwlCopied]       = useState(false);
  const [nwlPrompt, setNwlPrompt]       = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(false);

  const getWeekBounds = () => {
    const today = new Date();
    const day = today.getDay();
    const monday = new Date(today); monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1)); monday.setHours(0,0,0,0);
    const friday = new Date(monday); friday.setDate(monday.getDate() + 4); friday.setHours(23,59,59,999);
    const toISO = d => d.toISOString().split("T")[0];
    return { start: toISO(monday), end: toISO(friday) };
  };
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  const briefs = data.briefs || [];

  // Phase 3 Batch 2.8 — bulk-fetch tasks for active cases so AI prompt
  // builders below can prefer the next open case_task over legacy fields.
  // Returns gracefully (empty object) when Supabase is unavailable.
  // Refetches on cases-length change (creation/deletion).
  const [tasksByCase, setTasksByCase] = useState({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = await fetchTasksForCases(data.cases || []);
      if (!cancelled) setTasksByCase(map);
    })();
    return () => { cancelled = true; };
  }, [data.cases?.length]); // eslint-disable-line

  const parseDate = (str) => {
    if (!str) return null;
    // ISO format YYYY-MM-DD (canonical after our standardization)
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str + "T00:00:00");
    // fr-CA legacy DD/MM/YYYY
    const fr = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (fr) return new Date(`${fr[3]}-${fr[2]}-${fr[1]}T00:00:00`);
    // Fallback
    try { const d = new Date(str); return isNaN(d) ? null : d; } catch { return null; }
  };

  const inPeriod = (dateStr) => {
    if (!periodStart || !periodEnd) return true;
    const d = parseDate(dateStr);
    if (!d) return false;
    const start = new Date(periodStart); start.setHours(0,0,0,0);
    const end = new Date(periodEnd); end.setHours(23,59,59,999);
    return d >= start && d <= end;
  };

  const autoFill = () => {
    const allMeetings = data.meetings || [];
    const allSignals = data.signals || [];
    const allCases = filterActiveCases(data.cases || []);

    const filteredMeetings = allMeetings.filter(m => inPeriod(m.savedAt));
    const filteredSignals = allSignals.filter(s => inPeriod(s.savedAt));

    const meetingsTxt = filteredMeetings.length > 0
      ? filteredMeetings.map(m =>
          `Meeting ${m.director} (${m.savedAt}): ${m.analysis?.meetingTitle} — Risque ${m.analysis?.overallRisk}. Actions: ${toArray(m.analysis?.actions).map(a=>a.action).join("; ")}`
        ).join("\n")
      : "(Aucun meeting enregistré dans cette période)";

    const signalsTxt = filteredSignals.length > 0
      ? filteredSignals.map(s =>
          `Signal ${s.analysis?.category} (${s.savedAt}): ${s.analysis?.title} — ${s.analysis?.severity}`
        ).join("\n")
      : "(Aucun signal enregistré dans cette période)";

    const casesTxt = allCases.map(c =>
      `Dossier actif: ${c.title} — Risque ${c.riskLevel} — Suivi: ${followUpToText(getCaseFollowUp(c, tasksByCase[c.id])) || "N/A"}`
    ).join("\n") || "(Aucun dossier actif)";

    const weekLabel = periodStart && periodEnd
      ? `Semaine du ${new Date(periodStart).toLocaleDateString("fr-CA")} au ${new Date(periodEnd).toLocaleDateString("fr-CA")}`
      : `Semaine du ${new Date().toLocaleDateString("fr-CA")}`;

    setInputs(f => ({ ...f, meetings: meetingsTxt, signals: signalsTxt, cases: casesTxt,
      weekOf: weekLabel, other: f.other || `Données: ${filteredMeetings.length} meeting(s), ${filteredSignals.length} signal(s) dans la période.` }));
  };

  const generate = async () => {
    setLoading(true); setError(""); setResult(null); setSaved(false);
    try {
      // ── previousWeekly context ────────────────────────────────────────────
      const lastBrief = briefs.length > 0 ? briefs[briefs.length - 1].brief : null;
      const prevCtx = lastBrief
        ? `\n=== BRIEF SEMAINE PRECEDENTE (${lastBrief.weekOf||"semaine passee"}) ===
Risque: ${lastBrief.riskLevel||""} — ${lastBrief.riskRationale||""}
TopPriorites: ${lastBrief.topPriorities?.map(p=>p.priority).join(", ")||""}
RisquesClés: ${lastBrief.keyRisks?.map(r=>r.risk).join(", ")||""}
LeadershipWatch: ${lastBrief.leadershipWatch?.map(l=>`${l.person}: ${l.signal}`).join("; ")||""}
RetentionWatch: ${lastBrief.retentionWatch?.map(r=>r.profile).join(", ")||""}
WatchList: ${lastBrief.watchList?.map(w=>`${w.subject} [${w.classification}]`).join("; ")||"Aucune"}\n`
        : "\n=== BRIEF SEMAINE PRECEDENTE : Aucun (premiere semaine) ===\n";

      // ── Case Log context ──────────────────────────────────────────────────
      const activeCases = filterActiveCases(data.cases || []);
      const caseCtx = activeCases.length > 0
        ? `\n=== CASE LOG (${activeCases.length} dossier(s) actif(s)) ===\n` +
          activeCases.map(c =>
            `DOSSIER [${c.type||""}] ${c.title||""} — Risque: ${c.riskLevel||""} — Statut: ${c.status||""}${c.urgency?` — Urgence: ${c.urgency}`:""}${c.evolution?` — Évolution: ${c.evolution}`:""}
  Situation: ${c.situation||""}
  Position RH: ${c.hrPosition||""}${c.decision?`\n  Décision: ${c.decision}`:""}${c.owner&&c.owner!=="HRBP"?`\n  Owner: ${c.owner}`:""}
  Suivi: ${followUpToText(getCaseFollowUp(c, tasksByCase[c.id]))}`
          ).join("\n")
        : "\n=== CASE LOG : Aucun dossier actif ===\n";

      const prompt = `SEMAINE DU: ${inputs.weekOf||new Date().toLocaleDateString("fr-CA")}
MEETINGS DE LA SEMAINE:\n${inputs.meetings||"Aucun meeting documenté"}
SIGNAUX DÉTECTÉS:\n${inputs.signals||"Aucun signal documenté"}
DOSSIERS ACTIFS:\n${inputs.cases||"Aucun dossier actif"}
KPI / DONNÉES RH:\n${inputs.kpi||"Non disponible"}
CONTEXTE ADDITIONNEL:\n${inputs.other||""}${prevCtx}${caseCtx}`;
      const parsed = await callAI(BRIEF_SP, prompt, prompt.length);
      setResult(parsed); setSaved(false); setView("new"); setBriefTab("brief");
    } catch(e) { setError("Erreur: " + e.message); }
    finally { setLoading(false); }
  };

  const generateRecap = async () => {
    setRecapLoading(true); setRecapError(""); setRecapResult(null); setCopied(false);
    try {
      const allMeetings   = data.meetings       || [];
      const allSignals    = data.signals         || [];
      const allCases      = filterActiveCases(data.cases || []);
      const allPreps      = data.prep1on1        || [];
      const allBriefs     = data.briefs          || [];

      const weekMeetings  = allMeetings.filter(m => inPeriod(m.savedAt));
      const weekSignals   = allSignals.filter(s  => inPeriod(s.savedAt));
      const weekPreps     = allPreps.filter(p    => inPeriod(p.savedAt));
      const activeCases   = allCases;

      const weekLabel = periodStart && periodEnd
        ? `Semaine du ${new Date(periodStart).toLocaleDateString("fr-CA")} au ${new Date(periodEnd).toLocaleDateString("fr-CA")}`
        : `Semaine du ${new Date().toLocaleDateString("fr-CA")}`;

      // Build rich meeting summaries — full actions, risks, people observations
      const meetingsTxt = weekMeetings.length > 0
        ? weekMeetings.map(m => {
            const a = m.analysis || {};
            const actions   = toArray(a.actions).map(x => x.action).join(" | ");
            const risks     = toArray(a.risks).map(x => `${x.level}: ${x.risk}`).join(" | ");
            const people    = [...toArray(a.people?.performance), ...toArray(a.people?.leadership), ...toArray(a.people?.engagement)].join(" | ");
            const taPostes  = toArray(a.postes).map(p => `${p.titre} (${p.etape}) — ${p.statutDetail}`).join(" | ");
            return [
              `MEETING [${m.savedAt}] ${m.meetingType?.toUpperCase()||""} — ${m.director||""}`,
              `  Titre: ${a.meetingTitle||""}`,
              `  Risque global: ${a.overallRisk||""} — ${a.overallRiskRationale||""}`,
              `  Résumé: ${toArray(a.summary).join(" | ")}`,
              actions   ? `  Actions: ${actions}`   : "",
              risks     ? `  Risques: ${risks}`     : "",
              people    ? `  People: ${people}`     : "",
              taPostes  ? `  Postes TA: ${taPostes}` : "",
            ].filter(Boolean).join("\n");
          }).join("\n\n")
        : "(Aucun meeting dans la période)";

      // Signals
      const signalsTxt = weekSignals.length > 0
        ? weekSignals.map(s => {
            const a = s.analysis || {};
            return `SIGNAL [${s.savedAt}] ${a.category||""} — ${a.title||""} (${a.severity||""})
  Interprétation: ${a.interpretation||""}
  Actions: ${toArray(a.actions).map(x=>x.action).join(" | ")}`;
          }).join("\n\n")
        : "(Aucun signal dans la période)";

      // Active cases — full detail
      const casesTxt = activeCases.length > 0
        ? activeCases.map(c =>
            `DOSSIER ACTIF [${c.type||""}] ${c.title||""} — Risque: ${c.riskLevel||""} — Statut: ${c.status||""}
  Situation: ${c.situation||""}
  Interventions: ${c.interventionsDone||""}
  Position RH: ${c.hrPosition||""}
  Prochain suivi: ${followUpToText(getCaseFollowUp(c, tasksByCase[c.id]))}`
          ).join("\n\n")
        : "(Aucun dossier actif)";

      // 1:1 prep sessions this week
      const prepsTxt = weekPreps.length > 0
        ? weekPreps.map(p => {
            const o = p.output || {};
            return `PREP 1:1 [${p.savedAt}] ${p.managerName||""}
  Résumé: ${o.executiveSummary||""}
  Risques: ${toArray(o.mainRisks).join(" | ")}
  Suivis HRBP: ${toArray(o.hrbpFollowups).join(" | ")}`;
          }).join("\n\n")
        : "";

      const prompt = `SEMAINE: ${weekLabel}
Génère un récap structuré pour ma directrice à partir de tout ce qui s'est passé cette semaine.

=== MEETINGS (${weekMeetings.length}) ===
${meetingsTxt}

=== SIGNAUX ORGANISATIONNELS (${weekSignals.length}) ===
${signalsTxt}

=== DOSSIERS ACTIFS (${activeCases.length}) ===
${casesTxt}
${prepsTxt ? `\n=== PRÉPARATIONS 1:1 (${weekPreps.length}) ===\n${prepsTxt}` : ""}`;

      const parsed = await callAI(RECAP_SP, prompt, prompt.length);
      setRecapResult(parsed);
    } catch(e) { setRecapError("Erreur: " + e.message); }
    finally { setRecapLoading(false); }
  };

  const stripEmoji = (str) =>
    str.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}\u2190-\u21FF]/gu, "")
       .replace(/\s{2,}/g, " ").trim();

  const buildCopyText = (r) => {
    if (!r) return "";
    const lines = [];
    lines.push(`Récap RH — ${r.weekLabel || inputs.weekOf || ""}`);
    lines.push("");

    const section = (title, items) => {
      if (!items || items.length === 0) return;
      lines.push(title);
      items.forEach(i => lines.push(`  - ${stripEmoji(i.item)}`));
      lines.push("");
    };

    if (r.recrutement?.embauches?.length || r.recrutement?.processus?.length || r.recrutement?.ouvertures?.length) {
      lines.push("Recrutement");
      if (r.recrutement?.embauches?.length) { lines.push("  Embauches confirmées :"); r.recrutement.embauches.forEach(i => lines.push(`    - ${stripEmoji(i.item)}`)); }
      if (r.recrutement?.processus?.length) { lines.push("  Processus en cours :"); r.recrutement.processus.forEach(i => lines.push(`    - ${stripEmoji(i.item)}`)); }
      if (r.recrutement?.ouvertures?.length) { lines.push("  Ouvertures de poste :"); r.recrutement.ouvertures.forEach(i => lines.push(`    - ${stripEmoji(i.item)}`)); }
      lines.push("");
    }
    section("Promotions", r.promotions);
    section("Fins d'emploi", r.fins_emploi);
    section("Gestion de la performance / Plaintes / Enquêtes", r.performance);
    section("Processus et Projets RH", r.projets_rh);
    section("Divers", r.divers);
    return lines.join("\n");
  };

  const copyRecap = () => {
    const text = buildCopyText(recapResult);
    // execCommand works in iframes where clipboard API is blocked
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed"; ta.style.top = "0"; ta.style.left = "0";
    ta.style.width = "1px"; ta.style.height = "1px"; ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) {
      setCopied(true); setTimeout(() => setCopied(false), 2500);
    } else {
      // Last resort: show in prompt so user can Ctrl+C manually
      window.prompt("Copie ce texte (Ctrl+C) :", text);
    }
  };

  const saveBrief = () => {
    if (!result || saved) return;
    const b = { id:Date.now().toString(), savedAt:new Date().toISOString().split("T")[0], brief:result };
    onSave("briefs", [...briefs, b]);
    setSaved(true);
  };

  const saveSentRecap = () => {
    if (!sentRecapText.trim() || sentRecapSaved) return;
    const trimmed = sentRecapText.trim();
    const todayISO = new Date().toISOString().split("T")[0];
    const existing = data.sentRecaps || [];
    if (editingRecapId) {
      const updated = existing.map(r =>
        r.id === editingRecapId ? { ...r, sentText: trimmed, savedAt: todayISO } : r
      );
      onSave("sentRecaps", updated);
      setEditingRecapId(null);
    } else {
      const weekLabel = inputs.weekOf || new Date().toLocaleDateString("fr-CA");
      const entry = { id: Date.now().toString(), savedAt: todayISO, weekLabel, sentText: trimmed };
      onSave("sentRecaps", [...existing, entry]);
    }
    setSentRecapSaved(true);
    setTimeout(() => setSentRecapSaved(false), 3000);
  };

  const startEditRecap = (r) => {
    setEditingRecapId(r.id);
    setSentRecapText(r.sentText || "");
    setSentRecapSaved(false);
    setRecapSubTab("sent");
  };

  const cancelEditRecap = () => {
    setEditingRecapId(null);
    setSentRecapText("");
    setSentRecapSaved(false);
  };

  const deleteSentRecap = (id) => {
    if (!window.confirm(t("brief.history.confirmDelete"))) return;
    const filtered = (data.sentRecaps || []).filter(r => r.id !== id);
    onSave("sentRecaps", filtered);
    if (editingRecapId === id) {
      setEditingRecapId(null);
      setSentRecapText("");
    }
    if (nwlSourceIdx >= filtered.length && nwlSourceIdx > 0) setNwlSourceIdx(0);
  };

  // ── BRIEF TABS (shown when result exists)
  const BRIEF_RESULT_TABS = [
    { id:"brief", label:t("brief.tab.intel") },
    { id:"recap", label:t("brief.tab.recap") },
    { id:"insights", label:t("brief.tab.insights") },
  ];

  // ── Insights cross-modules state ──────────────────────────────────────────
  const [insightsResult, setInsightsResult] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState("");
  const [insightsSaved, setInsightsSaved] = useState(false);

  const generateInsights = async () => {
    setInsightsLoading(true); setInsightsError(""); setInsightsResult(null); setInsightsSaved(false);
    try {
      const todayISO = new Date().toISOString().split("T")[0];
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      const activeCasesIns = filterActiveCases(data.cases || [])
        .slice(0, 8)
        .map(c => `- [${c.type||""}] ${c.title||"Sans titre"} — Risque: ${c.riskLevel||"?"} — Statut: ${c.status||"?"} — ${c.director||c.employee||""}`)
        .join("\n");

      const activeSignalsIns = (data.signals || [])
        .slice(0, 8)
        .map(s => {
          const a = s.analysis || {};
          return `- ${a.title||a.category||"Signal"} [${a.severity||"?"}] — ${a.interpretation||""} (${s.savedAt||""})`;
        })
        .join("\n");

      const recentMeetingsIns = (data.meetings || [])
        .filter(m => new Date(m.savedAt || m.dateCreated || 0).getTime() > sevenDaysAgo)
        .slice(0, 8)
        .map(m => {
          const a = m.analysis || m.output || {};
          return `- ${a.meetingTitle||m.meetingType||"Meeting"} — ${m.director||""} — Risque: ${a.overallRisk||"?"} — Actions: ${toArray(a.actions).slice(0,2).map(x=>x.action||x).join("; ")||"aucune"}`;
        })
        .join("\n");

      const recentPrepsIns = (data.prep1on1 || [])
        .filter(p => p.kind === "1:1-meeting" && new Date(p.savedAt || 0).getTime() > sevenDaysAgo)
        .slice(0, 5)
        .map(p => {
          const o = p.output || {};
          return `- ${o.meetingTitle||p.engineType||"1:1"} — ${p.managerName||""} — ${o.hrbpKeyMessage||""}`;
        })
        .join("\n");

      const sp = `Tu es un HRBP senior qui analyse des patterns organisationnels.
A partir des donnees fournies, identifie des patterns non evidents, des tendances emergentes et des risques systemiques.
Ton analyse doit etre strategique, pas operationnelle.
Evite de repeter les faits bruts — cherche ce qu ils revelent.
Reponds UNIQUEMENT en JSON strict. Aucun texte avant ou apres. Aucun backtick. Francais professionnel.
{"patterns":"1 court paragraphe sur les themes recurrents entre modules","risquesSystemiques":"1 court paragraphe sur ce qui pourrait s aggraver si non traite","anglesMorts":"1 court paragraphe sur ce qui merite attention mais n est pas encore un cas ou signal formel","recommandation":"1 action HRBP prioritaire pour cette semaine — concrete et actionnable","riskLevel":"Faible|Modere|Eleve|Critique"}`;

      const up = `ANALYSE CROSS-MODULES — Semaine du ${todayISO}

CAS ACTIFS (${filterActiveCases(data.cases || []).length}) :
${activeCasesIns || "Aucun cas actif"}

SIGNAUX ORGANISATIONNELS (${(data.signals||[]).length}) :
${activeSignalsIns || "Aucun signal"}

MEETINGS RECENTS — 7 derniers jours (${(data.meetings||[]).filter(m=>new Date(m.savedAt||0).getTime()>sevenDaysAgo).length}) :
${recentMeetingsIns || "Aucun meeting recent"}

SESSIONS MEETING ENGINE RECENTES :
${recentPrepsIns || "Aucune session recente"}

Identifie les patterns recurrents, risques systemiques, angles morts et donne 1 recommandation strategique.`;

      const parsed = await callAI(sp, up, up.length);
      setInsightsResult(parsed);
    } catch(e) { setInsightsError("Erreur: " + e.message); }
    finally { setInsightsLoading(false); }
  };

  const saveInsights = () => {
    if (!insightsResult || insightsSaved) return;
    // Save insights into the most recent brief object (migration douce)
    const allBriefs = [...(data.briefs || [])];
    if (allBriefs.length > 0) {
      // Patch last brief with insights
      const last = { ...allBriefs[allBriefs.length - 1], insights: insightsResult };
      allBriefs[allBriefs.length - 1] = last;
    } else {
      // No brief yet — create a standalone entry
      allBriefs.push({
        id: Date.now().toString(),
        savedAt: new Date().toISOString().split("T")[0],
        brief: null,
        insights: insightsResult,
      });
    }
    onSave("briefs", allBriefs);
    setInsightsSaved(true);
  };

  // ── Next Week Lock ─────────────────────────────────────────────────────────
  const generateNWL = async () => {
    const sentList = [...(data.sentRecaps||[])].reverse();
    const recap = sentList[nwlSourceIdx];
    if (!recap?.sentText?.trim()) return;
    setNwlLoading(true); setNwlError(""); setNwlResult(null); setNwlSaved(false);
    try {
      const parsed = await callAIJson(
        NEXT_WEEK_LOCK_SP,
        `RECAP ENVOYÉ (semaine ${recap.weekLabel}):\n\n${recap.sentText}`,
        1200
      );
      setNwlResult(parsed);
    } catch(e) { setNwlError("Erreur: " + e.message); }
    finally { setNwlLoading(false); }
  };

  const importNWLResponse = (parsed) => {
    setNwlResult(parsed);
  };

  const saveNWL = () => {
    if (!nwlResult || nwlSaved) return;
    const sentList = [...(data.sentRecaps||[])].reverse();
    const recap = sentList[nwlSourceIdx];
    const entry = {
      id: Date.now().toString(),
      savedAt: new Date().toISOString().split("T")[0],
      sourceRecapId: recap?.id||"",
      sourceWeekLabel: recap?.weekLabel||"",
      lock: nwlResult,
    };
    onSave("nextWeekLocks", [...(data.nextWeekLocks||[]), entry]);
    setNwlSaved(true);
  };

  const copyNWL = () => {
    if (!nwlResult) return;
    const r = nwlResult;
    const sentList = [...(data.sentRecaps||[])].reverse();
    const recap = sentList[nwlSourceIdx];
    const txt = [
      `Next Week Lock — ${recap?.weekLabel||""}`,
      ``,
      `THÈME: ${r.theme}`,
      ``,
      `POURQUOI: ${r.why}`,
      ``,
      `TOP 2 PRIORITÉS:`,
      ...(r.priorities||[]).map((p,i)=>`${i+1}. ${p.priority}\n   → Pourquoi maintenant: ${p.whyNow}`),
      ``,
      `MANAGER FOCUS:`,
      ...(r.managerFocus||[]).map(m=>`- ${m.name} → ${m.reason}`),
      ``,
      `ACTION STRUCTURANTE:`,
      `${r.structuralAction?.action}`,
      `Impact: ${r.structuralAction?.impact}`,
      ``,
      `MESSAGE LEADERSHIP:`,
      `${r.leadershipMessage}`,
    ].join("\n");
    const ta = document.createElement("textarea");
    ta.value = txt; ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta);
    setNwlCopied(true); setTimeout(()=>setNwlCopied(false), 2000);
  };

  return (
    <div style={{ maxWidth:860, margin:"0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>{t("brief.title")}</div>
          <div style={{ fontSize:12, color:C.textM }}>{briefs.length}</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {briefs.length > 0 && <button onClick={() => setView(view==="archive"?"new":"archive")}
            style={{ ...css.btn(C.blue, true), padding:"8px 14px", fontSize:12 }}>
            {view==="archive"?t("brief.newBrief"):t("brief.archive")}
          </button>}
          {view==="new" && <button onClick={autoFill}
            style={{ ...css.btn(C.purple, true), padding:"8px 14px", fontSize:12 }}>
            {t("brief.autofill")}
          </button>}
        </div>
      </div>

      {/* ARCHIVE VIEW */}
      {view === "archive" && <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {briefs.slice().reverse().map((b,i) => {
          const r = RISK[b.brief?.riskLevel]||RISK["Modéré"];
          return <button key={i} onClick={() => { setResult(b.brief); setSaved(true); setView("new"); setBriefTab("brief"); }}
            style={{ background:C.surfL, border:`1px solid ${r.color}28`, borderLeft:`3px solid ${r.color}`,
              borderRadius:8, padding:"13px 15px", cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
              <span style={{ fontSize:13, fontWeight:500, color:C.text }}>{b.brief?.weekOf}</span>
              <RiskBadge level={b.brief?.riskLevel}/>
            </div>
            <div style={{ fontSize:12, color:C.textM }}>{b.brief?.executiveSummary?.substring(0,100)}…</div>
          </button>;
        })}
      </div>}

      {/* NEW / FORM VIEW */}
      {view === "new" && !result && (
        <div>
          {/* Period */}
          <Card style={{ marginBottom:14 }}>
            <SecHead icon="📅" label={t("brief.period")} color={C.blue}/>
            <div style={{ display:"flex", gap:16, alignItems:"flex-end", flexWrap:"wrap" }}>
              <div>
                <Mono color={C.textD} size={9}>{t("brief.from")}</Mono>
                <input type="date" value={periodStart} onChange={e=>{
                  setPeriodStart(e.target.value);
                  const end = new Date(e.target.value); end.setDate(end.getDate()+6);
                  setPeriodEnd(end.toISOString().split("T")[0]);
                }} style={{ display:"block", marginTop:4, padding:"7px 10px", borderRadius:7,
                  border:`1px solid ${C.border}`, fontSize:12, fontFamily:"inherit",
                  background:C.surfL, color:C.text, outline:"none" }}/>
              </div>
              <div>
                <Mono color={C.textD} size={9}>{t("brief.to")}</Mono>
                <input type="date" value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)}
                  style={{ display:"block", marginTop:4, padding:"7px 10px", borderRadius:7,
                    border:`1px solid ${C.border}`, fontSize:12, fontFamily:"inherit",
                    background:C.surfL, color:C.text, outline:"none" }}/>
              </div>
              {periodStart && periodEnd && (
                <div style={{ fontSize:11, color:C.textM, paddingBottom:8 }}>
                  {`${new Date(periodStart).toLocaleDateString("fr-CA",{weekday:"short",month:"short",day:"numeric"})} → ${new Date(periodEnd).toLocaleDateString("fr-CA",{weekday:"short",month:"short",day:"numeric"})}`}
                </div>
              )}
            </div>
          </Card>

          {/* Tab switcher for input sections */}
          <div style={{ display:"flex", gap:2, borderBottom:`1px solid ${C.border}`, marginBottom:14 }}>
            {[{id:"brief",label:t("brief.tab.intel")},{id:"recap",label:t("brief.tab.recap")},{id:"nwl",label:t("brief.tab.nwl")}].map(tt => (
              <button key={tt.id} onClick={() => setBriefTab(tt.id)}
                style={{ background:"none", border:"none", cursor:"pointer", padding:"8px 16px",
                  fontSize:12, fontWeight:briefTab===tt.id?700:400,
                  color:briefTab===tt.id?(tt.id==="nwl"?C.purple:C.em):C.textM,
                  borderBottom:`2px solid ${briefTab===tt.id?(tt.id==="nwl"?C.purple:C.em):"transparent"}`,
                  marginBottom:-1, fontFamily:"'DM Sans',sans-serif" }}>
                {tt.label}
              </button>
            ))}
          </div>

          {/* Brief inputs */}
          {briefTab === "brief" && (
            <div>
              <Card style={{ marginBottom:14 }}>
                <SecHead icon="📊" label={t("brief.inputs.heading")} color={C.amber}/>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  {[
                    ["meetings","⚡ Meetings de la semaine","Résumé ou points clés de chaque meeting..."],
                    ["signals","📡 Signaux détectés","Observations, conversations informelles..."],
                    ["cases","📂 Dossiers actifs","Statut des cas en cours, escalades, résolutions..."],
                    ["kpi","📊 KPI / Données RH","Taux roulement, absentéisme, recrutement, headcount..."],
                  ].map(([key,label,ph]) => <div key={key}>
                    <Mono color={C.textD} size={9}>{label}</Mono>
                    <textarea rows={4} value={inputs[key]} onChange={e=>setInputs(f=>({...f,[key]:e.target.value}))}
                      placeholder={ph} style={{ ...css.textarea, marginTop:6 }}
                      onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
                  </div>)}
                </div>
                <div style={{ marginTop:12 }}>
                  <Mono color={C.textD} size={9}>{t("brief.inputs.context")}</Mono>
                  <input value={inputs.other} onChange={e=>setInputs(f=>({...f,other:e.target.value}))}
                    placeholder="Ex: annonce RH, réorg prévue, contexte corporatif..." style={{ ...css.input, marginTop:6 }}
                    onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
                </div>
              </Card>

              {error && <div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7,
                padding:"10px 14px", marginBottom:12, fontSize:12, color:C.red }}>⚠ {error}</div>}

              {loading ? <AILoader label={t("brief.generating")}/> : (
                <button onClick={generate} style={{ ...css.btn(C.amber), width:"100%", padding:"13px", fontSize:14,
                  boxShadow:`0 4px 20px ${C.amber}30` }}>
                  {t("brief.generate")}
                </button>
              )}
            </div>
          )}

          {briefTab === "recap" && (() => {
            const sentRecaps = data.sentRecaps || [];
            const lastSent = sentRecaps.length > 0 ? sentRecaps[sentRecaps.length - 1] : null;
            const subTabs = [
              { id:"generate", label:t("brief.recap.gen") },
              { id:"sent",     label:t("brief.recap.sent") },
              { id:"history",  label:`${t("brief.recap.history")}${sentRecaps.length > 0 ? ` (${sentRecaps.length})` : ""}` },
            ];
            return (
              <div>
                {/* Sub-tabs */}
                <div style={{ display:"flex", gap:2, borderBottom:`1px solid ${C.border}`, marginBottom:14 }}>
                  {subTabs.map(t => (
                    <button key={t.id} onClick={() => setRecapSubTab(t.id)}
                      style={{ background:"none", border:"none", cursor:"pointer", padding:"7px 14px",
                        fontSize:11, fontWeight:recapSubTab===t.id?700:400,
                        color:recapSubTab===t.id?C.blue:C.textM,
                        borderBottom:`2px solid ${recapSubTab===t.id?C.blue:"transparent"}`,
                        marginBottom:-1, fontFamily:"'DM Sans',sans-serif" }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* ── GENERATE sub-tab */}
                {recapSubTab === "generate" && (
                  <div>
                    <div style={{ background:C.blue+"10", border:`1px solid ${C.blue}25`, borderRadius:8,
                      padding:"10px 14px", marginBottom:14, fontSize:12, color:C.textM }}>
                      {t("brief.recap.banner")}
                    </div>
                    {recapError && <div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7,
                      padding:"10px 14px", marginBottom:12, fontSize:12, color:C.red }}>⚠ {recapError}</div>}
                    {recapLoading ? <AILoader label={t("brief.recap.generating")}/> : (
                      !recapResult && <button onClick={generateRecap} style={{ ...css.btn(C.blue), width:"100%", padding:"13px", fontSize:14,
                        boxShadow:`0 4px 20px ${C.blue}30` }}>
                        {t("brief.recap.generate")}
                      </button>
                    )}
                  {recapResult && (
                    <div style={{ marginTop:16 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:C.text }}>📋 {recapResult.weekLabel}</div>
                        <div style={{ display:"flex", gap:8 }}>
                          <button onClick={() => setRecapResult(null)} style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>{t("brief.recap.regen")}</button>
                          <button onClick={copyRecap} style={{ ...css.btn(copied?C.em:C.blue), padding:"8px 14px", fontSize:12 }}>
                            {copied ? t("copilot.copied") + " !" : t("copilot.copy")}
                          </button>
                        </div>
                      </div>
                      {(recapResult.recrutement?.embauches?.length>0||recapResult.recrutement?.processus?.length>0||recapResult.recrutement?.ouvertures?.length>0) && (
                        <Card style={{ marginBottom:10 }}>
                          <SecHead icon="🎯" label={t("brief.recap.recrutement")} color={C.blue}/>
                          {recapResult.recrutement?.embauches?.length>0 && <div style={{ marginBottom:10 }}>
                            <Mono color={C.em} size={9}>{t("brief.recap.embauches")}</Mono>
                            {recapResult.recrutement.embauches.map((i,idx) => (
                              <div key={idx} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                                <span style={{ color:C.em, fontSize:12, flexShrink:0 }}>✓</span>
                                <span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{i.item}</span>
                              </div>
                            ))}
                          </div>}
                          {recapResult.recrutement?.processus?.length>0 && <div style={{ marginBottom:10 }}>
                            <Mono color={C.blue} size={9}>{t("brief.recap.processus")}</Mono>
                            {recapResult.recrutement.processus.map((i,idx) => (
                              <div key={idx} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                                <span style={{ color:C.blue, fontSize:12, flexShrink:0 }}>→</span>
                                <span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{i.item}</span>
                              </div>
                            ))}
                          </div>}
                          {recapResult.recrutement?.ouvertures?.length>0 && <div>
                            <Mono color={C.textD} size={9}>{t("brief.recap.ouvertures")}</Mono>
                            {recapResult.recrutement.ouvertures.map((i,idx) => (
                              <div key={idx} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                                <span style={{ color:C.textD, fontSize:12, flexShrink:0 }}>+</span>
                                <span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{i.item}</span>
                              </div>
                            ))}
                          </div>}
                        </Card>
                      )}
                      {[
                        {key:"promotions", icon:"⬆", label:t("brief.recap.promotions"),                        color:C.purple},
                        {key:"fins_emploi",icon:"🚪", label:t("brief.recap.endings"),                    color:C.textM},
                        {key:"performance",icon:"⚖",  label:t("brief.recap.performance"),color:C.red},
                        {key:"projets_rh", icon:"🔧", label:t("brief.recap.hrProjects"),          color:C.teal},
                        {key:"divers",     icon:"📎", label:t("brief.recap.divers"),                           color:C.textD},
                      ].map(({key,icon,label,color}) => recapResult[key]?.length>0 && (
                        <Card key={key} style={{ marginBottom:10, borderLeft:`3px solid ${color}` }}>
                          <SecHead icon={icon} label={label} color={color}/>
                          {recapResult[key].map((i,idx) => (
                            <div key={idx} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                              <span style={{ color, fontSize:12, flexShrink:0 }}>•</span>
                              <span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{i.item}</span>
                            </div>
                          ))}
                        </Card>
                      ))}
                    </div>
                  )}
                  </div>
                )}

                {/* ── SENT RECAP sub-tab */}
                {recapSubTab === "sent" && (() => {
                  const isEditing = !!editingRecapId;
                  const editingEntry = isEditing ? (data.sentRecaps||[]).find(r => r.id === editingRecapId) : null;
                  return (
                  <div>
                    <div style={{ background:C.em+"10", border:`1px solid ${C.em}25`, borderRadius:8,
                      padding:"10px 14px", marginBottom:14, fontSize:12, color:C.textM }}>
                      {t("brief.sent.banner")}
                    </div>
                    {isEditing && (
                      <div style={{ background:C.blue+"12", border:`1px solid ${C.blue}33`, borderRadius:7,
                        padding:"8px 12px", marginBottom:10, fontSize:11, color:C.blue, display:"flex",
                        alignItems:"center", justifyContent:"space-between", gap:10 }}>
                        <span>{t("brief.sent.editingBanner")} {editingEntry?.weekLabel || ""}</span>
                        <button onClick={cancelEditRecap}
                          style={{ ...css.btn(C.textM, true), padding:"4px 10px", fontSize:11 }}>
                          {t("brief.sent.cancelEdit")}
                        </button>
                      </div>
                    )}
                    <Mono color={C.textD} size={9}>{t("brief.sent.label")}</Mono>
                    <textarea rows={14} value={sentRecapText}
                      onChange={e => { setSentRecapText(e.target.value); setSentRecapSaved(false); }}
                      placeholder={t("brief.sent.placeholder")}
                      style={{ ...css.textarea, marginTop:6, fontFamily:"monospace", fontSize:12, lineHeight:1.7 }}
                      onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
                    <div style={{ display:"flex", gap:10, marginTop:10 }}>
                      <div style={{ fontSize:11, color:C.textD, flex:1, alignSelf:"center" }}>
                        {isEditing ? (editingEntry?.weekLabel || "") : (inputs.weekOf || new Date().toLocaleDateString("fr-CA"))}
                      </div>
                      <button onClick={saveSentRecap} disabled={!sentRecapText.trim() || sentRecapSaved}
                        style={{ ...css.btn(sentRecapSaved ? C.textD : C.em), padding:"9px 20px", fontSize:13 }}>
                        {sentRecapSaved
                          ? (isEditing ? t("brief.sent.updated") : t("brief.sent.archived"))
                          : (isEditing ? t("brief.sent.saveChanges") : t("brief.sent.archive"))}
                      </button>
                    </div>
                    {sentRecapSaved && (
                      <div style={{ marginTop:12, padding:"10px 14px", background:C.em+"12", border:`1px solid ${C.em}30`,
                        borderRadius:7, fontSize:12, color:C.em }}>
                        {isEditing ? t("brief.sent.updatedConfirm") : t("brief.sent.archivedConfirm")}
                      </div>
                    )}
                  </div>
                  );
                })()}

                {/* ── HISTORY sub-tab */}
                {recapSubTab === "history" && (
                  <div>
                    {sentRecaps.length === 0 ? (
                      <div style={{ textAlign:"center", padding:"40px 20px", color:C.textD, fontSize:13 }}>
                        {t("brief.history.empty")}
                      </div>
                    ) : (
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        {[...sentRecaps].reverse().map((r, i) => (
                          <Card key={r.id||i}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, gap:8 }}>
                              <div>
                                <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{r.weekLabel}</div>
                                <Mono color={C.textD} size={9}>{t("brief.history.archivedAt")} {r.savedAt}</Mono>
                              </div>
                              <div style={{ display:"flex", gap:6 }}>
                                <button onClick={() => startEditRecap(r)}
                                  style={{ ...css.btn(C.blue, true), padding:"5px 10px", fontSize:11 }}>
                                  {t("brief.history.edit")}
                                </button>
                                <button onClick={() => deleteSentRecap(r.id)}
                                  style={{ ...css.btn(C.red, true), padding:"5px 10px", fontSize:11 }}>
                                  {t("brief.history.delete")}
                                </button>
                              </div>
                            </div>
                            <div style={{ fontSize:12, color:C.textM, background:C.surfLL, borderRadius:7,
                              padding:"10px 12px", whiteSpace:"pre-wrap", lineHeight:1.7,
                              maxHeight:200, overflowY:"auto", fontFamily:"monospace" }}>
                              {r.sentText}
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── NEXT WEEK LOCK TAB */}
          {briefTab === "nwl" && (() => {
            const sentList = [...(data.sentRecaps||[])].reverse();
            const recap = sentList[nwlSourceIdx];
            return (
              <div>
                {sentList.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"50px 20px" }}>
                    <div style={{ fontSize:32, marginBottom:12 }}>🔒</div>
                    <div style={{ fontSize:13, color:C.textM, marginBottom:6 }}>{t("brief.nwl.empty.title")}</div>
                    <div style={{ fontSize:12, color:C.textD, maxWidth:340, margin:"0 auto" }}>
                      {t("brief.nwl.empty.body")}
                    </div>
                    <button onClick={() => { setBriefTab("recap"); setRecapSubTab("sent"); }}
                      style={{ ...css.btn(C.purple, true), marginTop:16, padding:"8px 18px", fontSize:12 }}>
                      {t("brief.nwl.empty.cta")}
                    </button>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                    {/* Source selector */}
                    <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                      <Mono color={C.textD} size={8}>{t("brief.nwl.source")}</Mono>
                      <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                        {sentList.slice(0,5).map((r,i) => (
                          <button key={r.id||i} onClick={() => { setNwlSourceIdx(i); setNwlResult(null); setNwlSaved(false); }}
                            style={{ padding:"4px 11px", borderRadius:5, fontSize:11, cursor:"pointer",
                              fontFamily:"'DM Sans',sans-serif", border:"none",
                              background: nwlSourceIdx===i ? C.purple+"22" : C.surfLL,
                              color: nwlSourceIdx===i ? C.purple : C.textD,
                              fontWeight: nwlSourceIdx===i ? 700 : 400,
                              outline: nwlSourceIdx===i ? `1px solid ${C.purple}55` : "none" }}>
                            {r.weekLabel || fmtDate(r.savedAt)}
                          </button>
                        ))}
                      </div>
                      {!nwlLoading ? (
                        <button onClick={generateNWL}
                          style={{ ...css.btn(C.purple), padding:"7px 18px", fontSize:12, marginLeft:"auto",
                            boxShadow:`0 4px 16px ${C.purple}30` }}>
                          ⚡ {nwlResult ? t("brief.nwl.regen") : t("brief.nwl.generate")}
                        </button>
                      ) : <AILoader label={t("brief.nwl.analyzing")}/>}
                    </div>

                    {nwlError && <div style={{ background:C.red+"15", border:`1px solid ${C.red}33`,
                      borderRadius:7, padding:"9px 14px", fontSize:12, color:C.red }}>⚠ {nwlError}</div>}

                    {!nwlResult && !nwlLoading && (
                      <div style={{ textAlign:"center", padding:"32px 20px",
                        background:C.surfL, borderRadius:10, border:`1px solid ${C.border}` }}>
                        <div style={{ fontSize:13, color:C.textM, marginBottom:4 }}>
                          Récap sélectionné: <span style={{ color:C.purple, fontWeight:700 }}>{recap?.weekLabel}</span>
                        </div>
                        <div style={{ fontSize:11, color:C.textD }}>Clique sur Générer pour transformer ce récap en plan d'exécution pour la semaine prochaine.</div>
                      </div>
                    )}

                    {nwlResult && (() => {
                      const r = nwlResult;
                      return (
                        <div style={{ border:`1.5px solid ${C.purple}40`, borderRadius:12, overflow:"hidden" }}>
                          {/* Theme */}
                          <div style={{ padding:"18px 20px",
                            background:`linear-gradient(135deg,${C.purple}15,${C.blue}08)`,
                            borderBottom:`1px solid ${C.purple}25` }}>
                            <Mono color={C.purple} size={8} style={{ display:"block", marginBottom:8 }}>{t("brief.nwl.theme")}</Mono>
                            <div style={{ fontSize:22, fontWeight:800, color:C.text, lineHeight:1.2, marginBottom:8 }}>{r.theme}</div>
                            <div style={{ fontSize:13, color:C.textM, lineHeight:1.65 }}>{r.why}</div>
                          </div>
                          {/* Priorities */}
                          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}` }}>
                            <Mono color={C.em} size={8} style={{ display:"block", marginBottom:10 }}>{t("brief.nwl.priorities")}</Mono>
                            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                              {(r.priorities||[]).map((p,i) => (
                                <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                                  <div style={{ width:22, height:22, background:C.em, borderRadius:"50%",
                                    flexShrink:0, display:"flex", alignItems:"center",
                                    justifyContent:"center", fontSize:11, fontWeight:800, color:C.bg }}>{i+1}</div>
                                  <div style={{ flex:1 }}>
                                    <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:3 }}>{p.priority}</div>
                                    <div style={{ fontSize:11, color:C.amber }}>⏱ {p.whyNow}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* Manager focus */}
                          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}` }}>
                            <Mono color={C.blue} size={8} style={{ display:"block", marginBottom:8 }}>{t("brief.nwl.managerFocus")}</Mono>
                            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                              {(r.managerFocus||[]).map((m,i) => (
                                <div key={i} style={{ display:"flex", gap:8, alignItems:"baseline", flexWrap:"wrap" }}>
                                  <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{m.name}</span>
                                  <span style={{ fontSize:12, color:C.textM }}>→ {m.reason}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* Structural action */}
                          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}`, background:C.em+"06" }}>
                            <Mono color={C.em} size={8} style={{ display:"block", marginBottom:8 }}>{t("brief.nwl.structuralAction")}</Mono>
                            <div style={{ fontSize:13, color:C.text, fontWeight:600, marginBottom:4 }}>{r.structuralAction?.action}</div>
                            <div style={{ fontSize:12, color:C.em }}>Impact: {r.structuralAction?.impact}</div>
                          </div>
                          {/* Leadership message */}
                          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}` }}>
                            <Mono color={C.textD} size={8} style={{ display:"block", marginBottom:8 }}>{t("brief.nwl.leadershipMessage")}</Mono>
                            <div style={{ fontSize:13, color:C.text, lineHeight:1.75, fontStyle:"italic",
                              padding:"10px 14px", background:C.surfLL, borderRadius:8,
                              borderLeft:`3px solid ${C.purple}` }}>
                              {r.leadershipMessage}
                            </div>
                          </div>
                          {/* Actions bar */}
                          <div style={{ padding:"10px 20px", background:C.surfL,
                            display:"flex", gap:8, justifyContent:"flex-end", alignItems:"center" }}>
                            <span style={{ fontSize:11, color:C.textD, flex:1 }}>
                              Basé sur: <span style={{ color:C.purple }}>{recap?.weekLabel}</span>
                            </span>
                            <button onClick={copyNWL}
                              style={{ ...css.btn(nwlCopied?C.em:C.textM, true), padding:"6px 14px", fontSize:11 }}>
                              {nwlCopied ? t("copilot.copied") : t("copilot.copy")}
                            </button>
                            <button onClick={saveNWL} disabled={nwlSaved}
                              style={{ ...css.btn(nwlSaved?C.textD:C.purple), padding:"6px 14px", fontSize:11,
                                opacity:nwlSaved?0.5:1 }}>
                              {nwlSaved ? t("brief.archived") : t("brief.archiveBtn")}
                            </button>
                            <button onClick={() => { setNwlResult(null); setNwlSaved(false); generateNWL(); }}
                              style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>↺</button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      )}

      {/* RESULT VIEW — Brief generated */}
      {result && view==="new" && (
        <div>
          {/* Tab switcher */}
          <div style={{ display:"flex", gap:2, borderBottom:`1px solid ${C.border}`, marginBottom:14 }}>
            {BRIEF_RESULT_TABS.map(t => (
              <button key={t.id} onClick={() => setBriefTab(t.id)}
                style={{ background:"none", border:"none", cursor:"pointer", padding:"8px 16px",
                  fontSize:12, fontWeight:briefTab===t.id?700:400,
                  color:briefTab===t.id?C.em:C.textM,
                  borderBottom:`2px solid ${briefTab===t.id?C.em:"transparent"}`,
                  marginBottom:-1, fontFamily:"'DM Sans',sans-serif" }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── INTELLIGENCE BRIEF TAB */}
          {briefTab === "brief" && (
            <div>
              <div style={{ background:C.surfL, border:`1px solid ${C.border}`, borderRadius:10,
                padding:"16px 20px", marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div style={{ fontSize:16, fontWeight:700, color:C.text }}>{result.weekOf}</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <RiskBadge level={result.riskLevel}/>
                    {result.orgPulse?.overall && <Badge label={result.orgPulse.overall} color={C.blue}/>}
                    <button onClick={saveBrief} disabled={saved}
                      style={{ ...css.btn(saved?C.textD:C.em), padding:"6px 14px", fontSize:11 }}>
                      {saved?t("brief.archived"):t("brief.archiveBtn")}
                    </button>
                  </div>
                </div>
                <div style={{ fontSize:13, color:C.text, lineHeight:1.7, fontStyle:"italic" }}>{result.executiveSummary}</div>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <Card>
                  <SecHead icon="🎯" label={t("brief.brief.priorities")} color={C.red}/>
                  {result.topPriorities?.map((p,i) => {
                    const EVO_C = {"Aggrave":C.red,"Persistant":C.amber,"Nouveau":C.blue,"En amelioration":C.teal,"Resolu":C.textD};
                    const ec = p.evolution ? (EVO_C[p.evolution]||C.textD) : null;
                    return <div key={i} style={{ marginBottom:10 }}>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:4 }}>
                        <Badge label={p.urgency} color={DELAY_C[p.urgency]||C.blue} size={10}/>
                        {ec && <Badge label={p.evolution} color={ec} size={9}/>}
                        {p.carryOver && <Badge label="↺" color={C.textD} size={9}/>}
                      </div>
                      <div style={{ fontSize:13, color:C.text, fontWeight:500 }}>{p.priority}</div>
                      <div style={{ fontSize:11, color:C.textM, marginTop:3 }}>{p.why}</div>
                      {p.source && <Mono color={C.textD} size={8} style={{ marginTop:3 }}>SOURCE · {p.source}</Mono>}
                    </div>;
                  })}
                </Card>
                <Card>
                  <SecHead icon="⚠" label={t("brief.brief.risks")} color={C.amber}/>
                  {result.keyRisks?.map((r,i) => {
                    const EVO_C = {"Aggrave":C.red,"Persistant":C.amber,"Nouveau":C.blue,"En amelioration":C.teal,"Resolu":C.textD};
                    const ec = r.evolution ? (EVO_C[r.evolution]||C.textD) : null;
                    return <div key={i} style={{ marginBottom:8 }}>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:4 }}>
                        <RiskBadge level={r.level}/>
                        {ec && <Badge label={r.evolution} color={ec} size={9}/>}
                        {r.carryOver && <Badge label="↺" color={C.textD} size={9}/>}
                      </div>
                      <div style={{ fontSize:13, color:C.text }}>{r.risk}</div>
                    </div>;
                  })}
                </Card>
                <Card>
                  <SecHead icon="👁" label={t("brief.brief.leadershipWatch")} color={C.purple}/>
                  {result.leadershipWatch?.map((l,i) => {
                    const EVO_C = {"Aggrave":C.red,"Persistant":C.amber,"Nouveau":C.blue,"En amelioration":C.teal,"Resolu":C.textD};
                    const ec = l.evolution ? (EVO_C[l.evolution]||C.textD) : null;
                    return <div key={i} style={{ marginBottom:10, borderBottom:`1px solid ${C.border}`, paddingBottom:8 }}>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center", marginBottom:5 }}>
                        <span style={{ fontSize:12, fontWeight:600, color:C.text }}>{l.person}</span>
                        {ec && <Badge label={l.evolution} color={ec} size={9}/>}
                        {l.carryOver && <Badge label="↺" color={C.textD} size={9}/>}
                      </div>
                      <div style={{ fontSize:12, color:C.textM, marginBottom:3 }}>{l.signal}</div>
                      <div style={{ fontSize:11, color:C.em }}>→ {l.action}</div>
                    </div>;
                  })}
                </Card>
                <Card>
                  <SecHead icon="✈" label={t("brief.brief.retentionWatch")} color={C.red}/>
                  {result.retentionWatch?.map((r,i) => {
                    const EVO_C = {"Aggrave":C.red,"Persistant":C.amber,"Nouveau":C.blue,"En amelioration":C.teal,"Resolu":C.textD};
                    const ec = r.evolution ? (EVO_C[r.evolution]||C.textD) : null;
                    return <div key={i} style={{ marginBottom:10 }}>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:4 }}>
                        <RiskBadge level={r.risk}/>
                        <Badge label={r.window} color={C.purple} size={10}/>
                        {ec && <Badge label={r.evolution} color={ec} size={9}/>}
                        {r.carryOver && <Badge label="↺" color={C.textD} size={9}/>}
                      </div>
                      <div style={{ fontSize:12, color:C.text }}>{r.profile}</div>
                      <div style={{ fontSize:11, color:C.em, marginTop:3 }}>Levier: {r.lever}</div>
                    </div>;
                  })}
                </Card>
              </div>

              <Card style={{ marginTop:12 }}>
                <SecHead icon="📅" label={t("brief.brief.weeklyActions")} color={C.em}/>
                {result.weeklyActions?.map((a,i) => <div key={i} style={{ display:"flex", gap:10, marginBottom:8 }}>
                  <Badge label={a.deadline} color={C.amber} size={10}/>
                  <div>
                    <div style={{ fontSize:13, color:C.text }}>{a.action}</div>
                    <Mono color={C.textD} size={9}>{t("brief.brief.ownerLabel")}: {a.owner}</Mono>
                  </div>
                </div>)}
              </Card>

              {result.lookAhead && <Card style={{ marginTop:10 }}>
                <SecHead icon="🔭" label={t("brief.brief.lookAhead")} color={C.teal}/>
                <div style={{ fontSize:13, color:C.text, lineHeight:1.7 }}>{result.lookAhead}</div>
              </Card>}

              {result.watchList?.length > 0 && (
                <Card style={{ marginTop:10, borderLeft:`3px solid ${C.textD}` }}>
                  <SecHead icon="📡" label={t("brief.brief.watchList")} color={C.textM}/>
                  {result.watchList.map((w,i) => {
                    const CLASSIF_C = {"activeRisk":C.amber,"latentSignal":C.blue,"resolved":C.teal};
                    const cc = CLASSIF_C[w.classification] || C.textD;
                    const EVO_C = {"Aggrave":C.red,"Persistant":C.amber,"Nouveau":C.blue,"En amelioration":C.teal,"Resolu":C.textD};
                    const ec = w.evolution ? (EVO_C[w.evolution]||C.textD) : C.textD;
                    return (
                      <div key={i} style={{ marginBottom:i<result.watchList.length-1?10:0, paddingBottom:i<result.watchList.length-1?10:0, borderBottom:i<result.watchList.length-1?`1px solid ${C.border}`:"none" }}>
                        <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:5 }}>
                          <Badge label={w.classification} color={cc} size={9}/>
                          {w.evolution && <Badge label={w.evolution} color={ec} size={9}/>}
                          {w.source && <Badge label={w.source} color={C.textD} size={9}/>}
                          {w.carryOver && <Badge label="↺ carry-over" color={C.textD} size={9}/>}
                        </div>
                        <div style={{ fontSize:13, color:C.text, marginBottom:w.note?3:0 }}>{w.subject}</div>
                        {w.note && <div style={{ fontSize:11, color:C.textD, fontStyle:"italic" }}>{w.note}</div>}
                      </div>
                    );
                  })}
                </Card>
              )}

              <div style={{ textAlign:"center", marginTop:16 }}>
                <button onClick={() => { setResult(null); setInputs({meetings:"",signals:"",cases:"",kpi:"",other:"",weekOf:""}); setSaved(false); setBriefTab("brief"); }}
                  style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:7,
                    padding:"8px 20px", fontSize:12, color:C.textD, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                  {t("brief.brief.newBrief")}
                </button>
              </div>
            </div>
          )}

          {/* ── RECAP DIRECTRICE TAB (in result view) */}
          {briefTab === "recap" && (() => {
            const sentRecaps = data.sentRecaps || [];
            const lastSent = sentRecaps.length > 0 ? sentRecaps[sentRecaps.length - 1] : null;
            const subTabs = [
              { id:"generate", label:t("brief.recap.gen") },
              { id:"sent",     label:t("brief.recap.sent") },
              { id:"history",  label:`${t("brief.recap.history")}${sentRecaps.length > 0 ? ` (${sentRecaps.length})` : ""}` },
            ];
            return (
              <div>
                {/* Sub-tabs */}
                <div style={{ display:"flex", gap:2, borderBottom:`1px solid ${C.border}`, marginBottom:14 }}>
                  {subTabs.map(t => (
                    <button key={t.id} onClick={() => setRecapSubTab(t.id)}
                      style={{ background:"none", border:"none", cursor:"pointer", padding:"7px 14px",
                        fontSize:11, fontWeight:recapSubTab===t.id?700:400,
                        color:recapSubTab===t.id?C.blue:C.textM,
                        borderBottom:`2px solid ${recapSubTab===t.id?C.blue:"transparent"}`,
                        marginBottom:-1, fontFamily:"'DM Sans',sans-serif" }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* ── GENERATE sub-tab */}
                {recapSubTab === "generate" && (
                  <div>
                    <div style={{ background:C.blue+"10", border:`1px solid ${C.blue}25`, borderRadius:8,
                      padding:"10px 14px", marginBottom:14, fontSize:12, color:C.textM }}>
                      {t("brief.recap.banner")}
                    </div>
                    {recapError && <div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7,
                      padding:"10px 14px", marginBottom:12, fontSize:12, color:C.red }}>⚠ {recapError}</div>}
                    {recapLoading ? <AILoader label={t("brief.recap.generating")}/> : (
                      !recapResult && <button onClick={generateRecap} style={{ ...css.btn(C.blue), width:"100%", padding:"13px", fontSize:14,
                        boxShadow:`0 4px 20px ${C.blue}30` }}>
                        {t("brief.recap.generate")}
                      </button>
                    )}
                  {recapResult && (
                    <div style={{ marginTop:16 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:C.text }}>📋 {recapResult.weekLabel}</div>
                        <div style={{ display:"flex", gap:8 }}>
                          <button onClick={() => setRecapResult(null)} style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>{t("brief.recap.regen")}</button>
                          <button onClick={copyRecap} style={{ ...css.btn(copied?C.em:C.blue), padding:"8px 14px", fontSize:12 }}>
                            {copied ? t("copilot.copied") + " !" : t("copilot.copy")}
                          </button>
                        </div>
                      </div>
                      {(recapResult.recrutement?.embauches?.length>0||recapResult.recrutement?.processus?.length>0||recapResult.recrutement?.ouvertures?.length>0) && (
                        <Card style={{ marginBottom:10 }}>
                          <SecHead icon="🎯" label={t("brief.recap.recrutement")} color={C.blue}/>
                          {recapResult.recrutement?.embauches?.length>0 && <div style={{ marginBottom:10 }}>
                            <Mono color={C.em} size={9}>{t("brief.recap.embauches")}</Mono>
                            {recapResult.recrutement.embauches.map((i,idx) => (
                              <div key={idx} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                                <span style={{ color:C.em, fontSize:12, flexShrink:0 }}>✓</span>
                                <span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{i.item}</span>
                              </div>
                            ))}
                          </div>}
                          {recapResult.recrutement?.processus?.length>0 && <div style={{ marginBottom:10 }}>
                            <Mono color={C.blue} size={9}>{t("brief.recap.processus")}</Mono>
                            {recapResult.recrutement.processus.map((i,idx) => (
                              <div key={idx} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                                <span style={{ color:C.blue, fontSize:12, flexShrink:0 }}>→</span>
                                <span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{i.item}</span>
                              </div>
                            ))}
                          </div>}
                          {recapResult.recrutement?.ouvertures?.length>0 && <div>
                            <Mono color={C.textD} size={9}>{t("brief.recap.ouvertures")}</Mono>
                            {recapResult.recrutement.ouvertures.map((i,idx) => (
                              <div key={idx} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                                <span style={{ color:C.textD, fontSize:12, flexShrink:0 }}>+</span>
                                <span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{i.item}</span>
                              </div>
                            ))}
                          </div>}
                        </Card>
                      )}
                      {[
                        {key:"promotions", icon:"⬆", label:t("brief.recap.promotions"),                        color:C.purple},
                        {key:"fins_emploi",icon:"🚪", label:t("brief.recap.endings"),                    color:C.textM},
                        {key:"performance",icon:"⚖",  label:t("brief.recap.performance"),color:C.red},
                        {key:"projets_rh", icon:"🔧", label:t("brief.recap.hrProjects"),          color:C.teal},
                        {key:"divers",     icon:"📎", label:t("brief.recap.divers"),                           color:C.textD},
                      ].map(({key,icon,label,color}) => recapResult[key]?.length>0 && (
                        <Card key={key} style={{ marginBottom:10, borderLeft:`3px solid ${color}` }}>
                          <SecHead icon={icon} label={label} color={color}/>
                          {recapResult[key].map((i,idx) => (
                            <div key={idx} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                              <span style={{ color, fontSize:12, flexShrink:0 }}>•</span>
                              <span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{i.item}</span>
                            </div>
                          ))}
                        </Card>
                      ))}
                    </div>
                  )}
                  </div>
                )}

                {/* ── SENT RECAP sub-tab */}
                {recapSubTab === "sent" && (() => {
                  const isEditing = !!editingRecapId;
                  const editingEntry = isEditing ? (data.sentRecaps||[]).find(r => r.id === editingRecapId) : null;
                  return (
                  <div>
                    <div style={{ background:C.em+"10", border:`1px solid ${C.em}25`, borderRadius:8,
                      padding:"10px 14px", marginBottom:14, fontSize:12, color:C.textM }}>
                      {t("brief.sent.banner")}
                    </div>
                    {isEditing && (
                      <div style={{ background:C.blue+"12", border:`1px solid ${C.blue}33`, borderRadius:7,
                        padding:"8px 12px", marginBottom:10, fontSize:11, color:C.blue, display:"flex",
                        alignItems:"center", justifyContent:"space-between", gap:10 }}>
                        <span>{t("brief.sent.editingBanner")} {editingEntry?.weekLabel || ""}</span>
                        <button onClick={cancelEditRecap}
                          style={{ ...css.btn(C.textM, true), padding:"4px 10px", fontSize:11 }}>
                          {t("brief.sent.cancelEdit")}
                        </button>
                      </div>
                    )}
                    <Mono color={C.textD} size={9}>{t("brief.sent.label")}</Mono>
                    <textarea rows={14} value={sentRecapText}
                      onChange={e => { setSentRecapText(e.target.value); setSentRecapSaved(false); }}
                      placeholder={t("brief.sent.placeholder")}
                      style={{ ...css.textarea, marginTop:6, fontFamily:"monospace", fontSize:12, lineHeight:1.7 }}
                      onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
                    <div style={{ display:"flex", gap:10, marginTop:10 }}>
                      <div style={{ fontSize:11, color:C.textD, flex:1, alignSelf:"center" }}>
                        {isEditing ? (editingEntry?.weekLabel || "") : (inputs.weekOf || new Date().toLocaleDateString("fr-CA"))}
                      </div>
                      <button onClick={saveSentRecap} disabled={!sentRecapText.trim() || sentRecapSaved}
                        style={{ ...css.btn(sentRecapSaved ? C.textD : C.em), padding:"9px 20px", fontSize:13 }}>
                        {sentRecapSaved
                          ? (isEditing ? t("brief.sent.updated") : t("brief.sent.archived"))
                          : (isEditing ? t("brief.sent.saveChanges") : t("brief.sent.archive"))}
                      </button>
                    </div>
                    {sentRecapSaved && (
                      <div style={{ marginTop:12, padding:"10px 14px", background:C.em+"12", border:`1px solid ${C.em}30`,
                        borderRadius:7, fontSize:12, color:C.em }}>
                        {isEditing ? t("brief.sent.updatedConfirm") : t("brief.sent.archivedConfirm")}
                      </div>
                    )}
                  </div>
                  );
                })()}

                {/* ── HISTORY sub-tab */}
                {recapSubTab === "history" && (
                  <div>
                    {sentRecaps.length === 0 ? (
                      <div style={{ textAlign:"center", padding:"40px 20px", color:C.textD, fontSize:13 }}>
                        {t("brief.history.empty")}
                      </div>
                    ) : (
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        {[...sentRecaps].reverse().map((r, i) => (
                          <Card key={r.id||i}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, gap:8 }}>
                              <div>
                                <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{r.weekLabel}</div>
                                <Mono color={C.textD} size={9}>{t("brief.history.archivedAt")} {r.savedAt}</Mono>
                              </div>
                              <div style={{ display:"flex", gap:6 }}>
                                <button onClick={() => startEditRecap(r)}
                                  style={{ ...css.btn(C.blue, true), padding:"5px 10px", fontSize:11 }}>
                                  {t("brief.history.edit")}
                                </button>
                                <button onClick={() => deleteSentRecap(r.id)}
                                  style={{ ...css.btn(C.red, true), padding:"5px 10px", fontSize:11 }}>
                                  {t("brief.history.delete")}
                                </button>
                              </div>
                            </div>
                            <div style={{ fontSize:12, color:C.textM, background:C.surfLL, borderRadius:7,
                              padding:"10px 12px", whiteSpace:"pre-wrap", lineHeight:1.7,
                              maxHeight:200, overflowY:"auto", fontFamily:"monospace" }}>
                              {r.sentText}
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── INSIGHTS CROSS-MODULES TAB */}
          {briefTab === "insights" && (
            <div>
              <Card style={{ marginBottom:14 }}>
                <SecHead icon="🔍" label={t("brief.insights.header")} color={C.purple}/>
                <div style={{ fontSize:12, color:C.textM, marginBottom:14, lineHeight:1.6 }}>
                  {t("brief.insights.body")}
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={generateInsights} disabled={insightsLoading}
                    style={{ ...css.btn(C.purple), opacity:insightsLoading?.5:1 }}>
                    {insightsLoading ? t("brief.insights.generating") : t("brief.insights.generate")}
                  </button>
                  {insightsResult && !insightsSaved && (
                    <button onClick={saveInsights} style={css.btn(C.em)}>{t("brief.insights.save")}</button>
                  )}
                  {insightsSaved && <Badge label={t("brief.insights.saved")} color={C.em}/>}
                </div>
              </Card>

              {insightsLoading && <AILoader label={t("brief.insights.analyzing")}/>}
              {insightsError && <div style={{ color:C.red, fontSize:12, marginBottom:10 }}>{insightsError}</div>}

              {insightsResult && (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {insightsResult.patterns && (
                    <Card style={{ borderLeft:`3px solid ${C.blue}` }}>
                      <SecHead icon="🔄" label={t("brief.insights.patterns")} color={C.blue}/>
                      <div style={{ fontSize:13, color:C.text, lineHeight:1.7 }}>{insightsResult.patterns}</div>
                    </Card>
                  )}
                  {insightsResult.risquesSystemiques && (
                    <Card style={{ borderLeft:`3px solid ${C.red}` }}>
                      <SecHead icon="⚠️" label={t("brief.insights.systemic")} color={C.red}/>
                      <div style={{ fontSize:13, color:C.text, lineHeight:1.7 }}>{insightsResult.risquesSystemiques}</div>
                    </Card>
                  )}
                  {insightsResult.anglesMorts && (
                    <Card style={{ borderLeft:`3px solid ${C.amber}` }}>
                      <SecHead icon="👁" label={t("brief.insights.blindspots")} color={C.amber}/>
                      <div style={{ fontSize:13, color:C.text, lineHeight:1.7 }}>{insightsResult.anglesMorts}</div>
                    </Card>
                  )}
                  {insightsResult.recommandation && (
                    <Card style={{ borderLeft:`3px solid ${C.em}`, background:C.em+"08" }}>
                      <SecHead icon="🎯" label={t("brief.insights.recommendation")} color={C.em}/>
                      <div style={{ fontSize:13, color:C.text, lineHeight:1.7, fontWeight:500 }}>{insightsResult.recommandation}</div>
                      {insightsResult.riskLevel && (
                        <div style={{ marginTop:8 }}><RiskBadge level={insightsResult.riskLevel}/></div>
                      )}
                    </Card>
                  )}
                </div>
              )}

              {/* Insights history — from briefs that have insights attached */}
              {(() => {
                const briefsWithInsights = (data.briefs||[]).filter(b => b.insights).reverse().slice(0,5);
                return briefsWithInsights.length > 0 && !insightsResult && (
                  <Card style={{ marginTop:14 }}>
                    <SecHead icon="📚" label={t("brief.insights.history")} color={C.textD}/>
                    {briefsWithInsights.map((b,i) => (
                      <button key={b.id||i}
                        onClick={() => setInsightsResult(b.insights)}
                        style={{ display:"block", width:"100%", background:C.surfL, border:`1px solid ${C.border}`,
                          borderRadius:8, padding:"10px 14px", marginBottom:8, cursor:"pointer",
                          textAlign:"left", fontFamily:"'DM Sans',sans-serif", transition:"opacity .15s" }}
                        onMouseEnter={e=>e.currentTarget.style.opacity="0.8"}
                        onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <Mono size={9} color={C.purple}>🔍 Insights — {b.savedAt}</Mono>
                          {b.insights?.riskLevel && <RiskBadge level={b.insights.riskLevel}/>}
                        </div>
                        <div style={{ fontSize:11, color:C.textM, marginTop:4, lineHeight:1.4,
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {b.insights?.recommandation || b.insights?.patterns || "—"}
                        </div>
                      </button>
                    ))}
                  </Card>
                );
              })()}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
