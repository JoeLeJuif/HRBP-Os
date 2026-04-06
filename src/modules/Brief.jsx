// ── MODULE: WEEKLY BRIEF ──────────────────────────────────────────────────────
// Source: HRBP_OS.jsx L.2169–3239

import { useState } from "react";
import Mono     from '../components/Mono.jsx';
import Badge    from '../components/Badge.jsx';
import Card     from '../components/Card.jsx';
import AILoader from '../components/AILoader.jsx';
import { BRIEF_SP, RECAP_SP, NEXT_WEEK_LOCK_SP } from '../prompts/brief.js';
import { callAI, callAIJson } from '../api/index.js';
import { fmtDate } from '../utils/format.js';
import { C, css, DELAY_C, RISK } from '../theme.js';

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
  const [view, setView] = useState("new");
  const [briefTab, setBriefTab] = useState("brief"); // brief | recap
  const [inputs, setInputs] = useState({ meetings:"", signals:"", cases:"", kpi:"", other:"", weekOf:"" });

  // Recap — auto-generated from week history
  const [recapSubTab, setRecapSubTab] = useState("generate"); // generate | sent | history
  const [sentRecapText, setSentRecapText] = useState("");
  const [sentRecapSaved, setSentRecapSaved] = useState(false);
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
    const allCases = data.cases || [];

    const filteredMeetings = allMeetings.filter(m => inPeriod(m.savedAt));
    const filteredSignals = allSignals.filter(s => inPeriod(s.savedAt));

    const meetingsTxt = filteredMeetings.length > 0
      ? filteredMeetings.map(m =>
          `Meeting ${m.director} (${m.savedAt}): ${m.analysis?.meetingTitle} — Risque ${m.analysis?.overallRisk}. Actions: ${m.analysis?.actions?.map(a=>a.action).join("; ")}`
        ).join("\n")
      : "(Aucun meeting enregistré dans cette période)";

    const signalsTxt = filteredSignals.length > 0
      ? filteredSignals.map(s =>
          `Signal ${s.analysis?.category} (${s.savedAt}): ${s.analysis?.title} — ${s.analysis?.severity}`
        ).join("\n")
      : "(Aucun signal enregistré dans cette période)";

    const casesTxt = allCases.filter(c => c.status==="active"||c.status==="open").map(c =>
      `Dossier actif: ${c.title} — Risque ${c.riskLevel} — Suivi: ${c.nextFollowUp||"N/A"}`
    ).join("\n") || "(Aucun dossier actif)";

    const weekLabel = periodStart && periodEnd
      ? `Semaine du ${new Date(periodStart).toLocaleDateString("fr-CA")} au ${new Date(periodEnd).toLocaleDateString("fr-CA")}`
      : `Semaine du ${new Date().toLocaleDateString("fr-CA")}`;

    setInputs(f => ({ ...f, meetings: meetingsTxt, signals: signalsTxt, cases: casesTxt,
      weekOf: weekLabel, other: f.other || `Données: ${filteredMeetings.length} meeting(s), ${filteredSignals.length} signal(s) dans la période.` }));

    // Also pre-fill recap from cases
    const caseTAFill = allCases.filter(c => c.type==="performance"||c.type==="pip"||c.type==="complaint"||c.type==="investigation")
      .map(c => `${c.title} (${c.employee||c.director||""}) — ${c.status}`).join("\n");
    if (caseTAFill) setRecapInputs(f => ({ ...f, performance: f.performance || caseTAFill }));

    const retentionFill = allCases.filter(c => c.type==="exit"||c.type==="reorg")
      .map(c => `${c.title} — ${c.status}`).join("\n");
    if (retentionFill) setRecapInputs(f => ({ ...f, fins_emploi: f.fins_emploi || retentionFill }));
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
      const activeCases = (data.cases||[]).filter(c => c.status==="active"||c.status==="open");
      const caseCtx = activeCases.length > 0
        ? `\n=== CASE LOG (${activeCases.length} dossier(s) actif(s)) ===\n` +
          activeCases.map(c =>
            `DOSSIER [${c.type||""}] ${c.title||""} — Risque: ${c.riskLevel||""} — Statut: ${c.status||""}${c.urgency?` — Urgence: ${c.urgency}`:""}${c.evolution?` — Évolution: ${c.evolution}`:""}
  Situation: ${c.situation||""}
  Position RH: ${c.hrPosition||""}${c.decision?`\n  Décision: ${c.decision}`:""}${c.owner&&c.owner!=="HRBP"?`\n  Owner: ${c.owner}`:""}
  Suivi: ${c.dueDate||c.nextFollowUp||""}`
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
      const allCases      = data.cases           || [];
      const allPreps      = data.prep1on1        || [];
      const allBriefs     = data.briefs          || [];

      const weekMeetings  = allMeetings.filter(m => inPeriod(m.savedAt));
      const weekSignals   = allSignals.filter(s  => inPeriod(s.savedAt));
      const weekPreps     = allPreps.filter(p    => inPeriod(p.savedAt));
      const activeCases   = allCases.filter(c    => c.status === "active" || c.status === "open");

      const weekLabel = periodStart && periodEnd
        ? `Semaine du ${new Date(periodStart).toLocaleDateString("fr-CA")} au ${new Date(periodEnd).toLocaleDateString("fr-CA")}`
        : `Semaine du ${new Date().toLocaleDateString("fr-CA")}`;

      // Build rich meeting summaries — full actions, risks, people observations
      const meetingsTxt = weekMeetings.length > 0
        ? weekMeetings.map(m => {
            const a = m.analysis || {};
            const actions   = a.actions?.map(x => x.action).join(" | ") || "";
            const risks     = a.risks?.map(x => `${x.level}: ${x.risk}`).join(" | ") || "";
            const people    = [...(a.people?.performance||[]), ...(a.people?.leadership||[]), ...(a.people?.engagement||[])].join(" | ");
            const taPostes  = a.postes?.map(p => `${p.titre} (${p.etape}) — ${p.statutDetail}`).join(" | ") || "";
            return [
              `MEETING [${m.savedAt}] ${m.meetingType?.toUpperCase()||""} — ${m.director||""}`,
              `  Titre: ${a.meetingTitle||""}`,
              `  Risque global: ${a.overallRisk||""} — ${a.overallRiskRationale||""}`,
              `  Résumé: ${(a.summary||[]).join(" | ")}`,
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
  Actions: ${a.actions?.map(x=>x.action).join(" | ")||""}`;
          }).join("\n\n")
        : "(Aucun signal dans la période)";

      // Active cases — full detail
      const casesTxt = activeCases.length > 0
        ? activeCases.map(c =>
            `DOSSIER ACTIF [${c.type||""}] ${c.title||""} — Risque: ${c.riskLevel||""} — Statut: ${c.status||""}
  Situation: ${c.situation||""}
  Interventions: ${c.interventionsDone||""}
  Position RH: ${c.hrPosition||""}
  Prochain suivi: ${c.nextFollowUp||""}`
          ).join("\n\n")
        : "(Aucun dossier actif)";

      // 1:1 prep sessions this week
      const prepsTxt = weekPreps.length > 0
        ? weekPreps.map(p => {
            const o = p.output || {};
            return `PREP 1:1 [${p.savedAt}] ${p.managerName||""}
  Résumé: ${o.executiveSummary||""}
  Risques: ${o.mainRisks?.join(" | ")||""}
  Suivis HRBP: ${o.hrbpFollowups?.join(" | ")||""}`;
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
    const weekLabel = inputs.weekOf || new Date().toLocaleDateString("fr-CA");
    const entry = {
      id: Date.now().toString(),
      savedAt: new Date().toISOString().split("T")[0],
      weekLabel,
      sentText: sentRecapText.trim(),
    };
    // Store sent recaps as a separate list in briefs storage under a sentRecaps key
    const existing = data.sentRecaps || [];
    onSave("sentRecaps", [...existing, entry]);
    setSentRecapSaved(true);
    setTimeout(() => setSentRecapSaved(false), 3000);
  };

  // ── BRIEF TABS (shown when result exists)
  const BRIEF_RESULT_TABS = [
    { id:"brief", label:"📊 Intelligence Brief" },
    { id:"recap", label:"📋 Récap directrice" },
  ];

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
          <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>Weekly Intelligence Brief</div>
          <div style={{ fontSize:12, color:C.textM }}>{briefs.length} brief(s) archivé(s)</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {briefs.length > 0 && <button onClick={() => setView(view==="archive"?"new":"archive")}
            style={{ ...css.btn(C.blue, true), padding:"8px 14px", fontSize:12 }}>
            {view==="archive"?"← Nouveau brief":"📚 Archive"}
          </button>}
          {view==="new" && <button onClick={autoFill}
            style={{ ...css.btn(C.purple, true), padding:"8px 14px", fontSize:12 }}>
            ⚡ Remplir depuis mes données
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
            <SecHead icon="📅" label="Période couverte" color={C.blue}/>
            <div style={{ display:"flex", gap:16, alignItems:"flex-end", flexWrap:"wrap" }}>
              <div>
                <Mono color={C.textD} size={9}>Du</Mono>
                <input type="date" value={periodStart} onChange={e=>{
                  setPeriodStart(e.target.value);
                  const end = new Date(e.target.value); end.setDate(end.getDate()+6);
                  setPeriodEnd(end.toISOString().split("T")[0]);
                }} style={{ display:"block", marginTop:4, padding:"7px 10px", borderRadius:7,
                  border:`1px solid ${C.border}`, fontSize:12, fontFamily:"inherit",
                  background:C.surfL, color:C.text, outline:"none" }}/>
              </div>
              <div>
                <Mono color={C.textD} size={9}>Au</Mono>
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
            {[{id:"brief",label:"📊 Intelligence Brief"},{id:"recap",label:"📋 Récap directrice"},{id:"nwl",label:"🔒 Next Week Lock"}].map(t => (
              <button key={t.id} onClick={() => setBriefTab(t.id)}
                style={{ background:"none", border:"none", cursor:"pointer", padding:"8px 16px",
                  fontSize:12, fontWeight:briefTab===t.id?700:400,
                  color:briefTab===t.id?(t.id==="nwl"?C.purple:C.em):C.textM,
                  borderBottom:`2px solid ${briefTab===t.id?(t.id==="nwl"?C.purple:C.em):"transparent"}`,
                  marginBottom:-1, fontFamily:"'DM Sans',sans-serif" }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Brief inputs */}
          {briefTab === "brief" && (
            <div>
              <Card style={{ marginBottom:14 }}>
                <SecHead icon="📊" label="Inputs de la semaine" color={C.amber}/>
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
                  <Mono color={C.textD} size={9}>Contexte additionnel</Mono>
                  <input value={inputs.other} onChange={e=>setInputs(f=>({...f,other:e.target.value}))}
                    placeholder="Ex: annonce RH, réorg prévue, contexte corporatif..." style={{ ...css.input, marginTop:6 }}
                    onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
                </div>
              </Card>

              {error && <div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7,
                padding:"10px 14px", marginBottom:12, fontSize:12, color:C.red }}>⚠ {error}</div>}

              {loading ? <AILoader label="Génération du brief"/> : (
                <button onClick={generate} style={{ ...css.btn(C.amber), width:"100%", padding:"13px", fontSize:14,
                  boxShadow:`0 4px 20px ${C.amber}30` }}>
                  📊 Générer le Weekly Brief
                </button>
              )}
            </div>
          )}

          {briefTab === "recap" && (() => {
            const sentRecaps = data.sentRecaps || [];
            const lastSent = sentRecaps.length > 0 ? sentRecaps[sentRecaps.length - 1] : null;
            const subTabs = [
              { id:"generate", label:"⚡ Générer" },
              { id:"sent",     label:"📤 Récap envoyé" },
              { id:"history",  label:`📚 Historique${sentRecaps.length > 0 ? ` (${sentRecaps.length})` : ""}` },
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
                      📅 Généré automatiquement depuis tous tes meetings, signaux, dossiers et preps 1:1 de la période sélectionnée.
                    </div>
                    {recapError && <div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7,
                      padding:"10px 14px", marginBottom:12, fontSize:12, color:C.red }}>⚠ {recapError}</div>}
                    {recapLoading ? <AILoader label="Génération du récap depuis l'historique"/> : (
                      !recapResult && <button onClick={generateRecap} style={{ ...css.btn(C.blue), width:"100%", padding:"13px", fontSize:14,
                        boxShadow:`0 4px 20px ${C.blue}30` }}>
                        📋 Générer le récap directrice
                      </button>
                    )}
                  {recapResult && (
                    <div style={{ marginTop:16 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:C.text }}>📋 {recapResult.weekLabel}</div>
                        <div style={{ display:"flex", gap:8 }}>
                          <button onClick={() => setRecapResult(null)} style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>↺ Regénérer</button>
                          <button onClick={copyRecap} style={{ ...css.btn(copied?C.em:C.blue), padding:"8px 14px", fontSize:12 }}>
                            {copied ? "✓ Copié !" : "📋 Copier"}
                          </button>
                        </div>
                      </div>
                      {(recapResult.recrutement?.embauches?.length>0||recapResult.recrutement?.processus?.length>0||recapResult.recrutement?.ouvertures?.length>0) && (
                        <Card style={{ marginBottom:10 }}>
                          <SecHead icon="🎯" label="Recrutement" color={C.blue}/>
                          {recapResult.recrutement?.embauches?.length>0 && <div style={{ marginBottom:10 }}>
                            <Mono color={C.em} size={9}>EMBAUCHES CONFIRMÉES</Mono>
                            {recapResult.recrutement.embauches.map((i,idx) => (
                              <div key={idx} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                                <span style={{ color:C.em, fontSize:12, flexShrink:0 }}>✓</span>
                                <span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{i.item}</span>
                              </div>
                            ))}
                          </div>}
                          {recapResult.recrutement?.processus?.length>0 && <div style={{ marginBottom:10 }}>
                            <Mono color={C.blue} size={9}>PROCESSUS EN COURS</Mono>
                            {recapResult.recrutement.processus.map((i,idx) => (
                              <div key={idx} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                                <span style={{ color:C.blue, fontSize:12, flexShrink:0 }}>→</span>
                                <span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{i.item}</span>
                              </div>
                            ))}
                          </div>}
                          {recapResult.recrutement?.ouvertures?.length>0 && <div>
                            <Mono color={C.textD} size={9}>OUVERTURES DE POSTE</Mono>
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
                        {key:"promotions", icon:"⬆", label:"Promotions",                        color:C.purple},
                        {key:"fins_emploi",icon:"🚪", label:"Fins d'emploi",                    color:C.textM},
                        {key:"performance",icon:"⚖",  label:"Performance / Plaintes / Enquêtes",color:C.red},
                        {key:"projets_rh", icon:"🔧", label:"Processus et Projets RH",          color:C.teal},
                        {key:"divers",     icon:"📎", label:"Divers",                           color:C.textD},
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
                {recapSubTab === "sent" && (
                  <div>
                    <div style={{ background:C.em+"10", border:`1px solid ${C.em}25`, borderRadius:8,
                      padding:"10px 14px", marginBottom:14, fontSize:12, color:C.textM }}>
                      📤 Colle ici le récap final que tu as envoyé à ta directrice. Il sera archivé avec la date et consultable les semaines suivantes.
                    </div>
                    <Mono color={C.textD} size={9}>RÉCAP FINAL ENVOYÉ</Mono>
                    <textarea rows={14} value={sentRecapText}
                      onChange={e => { setSentRecapText(e.target.value); setSentRecapSaved(false); }}
                      placeholder={"Colle ton récap final ici — tel qu'envoyé à ta directrice..."}
                      style={{ ...css.textarea, marginTop:6, fontFamily:"monospace", fontSize:12, lineHeight:1.7 }}
                      onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
                    <div style={{ display:"flex", gap:10, marginTop:10 }}>
                      <div style={{ fontSize:11, color:C.textD, flex:1, alignSelf:"center" }}>
                        {inputs.weekOf || new Date().toLocaleDateString("fr-CA")}
                      </div>
                      <button onClick={saveSentRecap} disabled={!sentRecapText.trim() || sentRecapSaved}
                        style={{ ...css.btn(sentRecapSaved ? C.textD : C.em), padding:"9px 20px", fontSize:13 }}>
                        {sentRecapSaved ? "✓ Archivé" : "💾 Archiver ce récap"}
                      </button>
                    </div>
                    {sentRecapSaved && (
                      <div style={{ marginTop:12, padding:"10px 14px", background:C.em+"12", border:`1px solid ${C.em}30`,
                        borderRadius:7, fontSize:12, color:C.em }}>
                        ✓ Récap archivé — consultable dans Historique la semaine prochaine.
                      </div>
                    )}
                  </div>
                )}

                {/* ── HISTORY sub-tab */}
                {recapSubTab === "history" && (
                  <div>
                    {sentRecaps.length === 0 ? (
                      <div style={{ textAlign:"center", padding:"40px 20px", color:C.textD, fontSize:13 }}>
                        Aucun récap archivé. Archive ton premier récap dans l'onglet Récap envoyé.
                      </div>
                    ) : (
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        {[...sentRecaps].reverse().map((r, i) => (
                          <Card key={r.id||i}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                              <div>
                                <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{r.weekLabel}</div>
                                <Mono color={C.textD} size={9}>Archivé le {r.savedAt}</Mono>
                              </div>
                              <button onClick={() => {
                                setSentRecapText(r.sentText);
                                setRecapSubTab("sent");
                              }} style={{ ...css.btn(C.textM, true), padding:"5px 10px", fontSize:11 }}>
                                Consulter
                              </button>
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
                    <div style={{ fontSize:13, color:C.textM, marginBottom:6 }}>Aucun récap archivé</div>
                    <div style={{ fontSize:12, color:C.textD, maxWidth:340, margin:"0 auto" }}>
                      Archive un récap dans Récap directrice → Récap envoyé. Ce module le transforme en plan d'exécution pour la semaine suivante.
                    </div>
                    <button onClick={() => { setBriefTab("recap"); setRecapSubTab("sent"); }}
                      style={{ ...css.btn(C.purple, true), marginTop:16, padding:"8px 18px", fontSize:12 }}>
                      → Archiver un récap
                    </button>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                    {/* Source selector */}
                    <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                      <Mono color={C.textD} size={8}>SOURCE</Mono>
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
                          ⚡ {nwlResult ? "Régénérer" : "Générer la semaine suivante"}
                        </button>
                      ) : <AILoader label="Analyse du récap…"/>}
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
                            <Mono color={C.purple} size={8} style={{ display:"block", marginBottom:8 }}>THÈME DE LA SEMAINE</Mono>
                            <div style={{ fontSize:22, fontWeight:800, color:C.text, lineHeight:1.2, marginBottom:8 }}>{r.theme}</div>
                            <div style={{ fontSize:13, color:C.textM, lineHeight:1.65 }}>{r.why}</div>
                          </div>
                          {/* Priorities */}
                          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}` }}>
                            <Mono color={C.em} size={8} style={{ display:"block", marginBottom:10 }}>TOP 2 PRIORITÉS</Mono>
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
                            <Mono color={C.blue} size={8} style={{ display:"block", marginBottom:8 }}>MANAGER FOCUS</Mono>
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
                            <Mono color={C.em} size={8} style={{ display:"block", marginBottom:8 }}>ACTION STRUCTURANTE</Mono>
                            <div style={{ fontSize:13, color:C.text, fontWeight:600, marginBottom:4 }}>{r.structuralAction?.action}</div>
                            <div style={{ fontSize:12, color:C.em }}>Impact: {r.structuralAction?.impact}</div>
                          </div>
                          {/* Leadership message */}
                          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}` }}>
                            <Mono color={C.textD} size={8} style={{ display:"block", marginBottom:8 }}>MESSAGE LEADERSHIP</Mono>
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
                              {nwlCopied ? "✓ Copié" : "📋 Copier"}
                            </button>
                            <button onClick={saveNWL} disabled={nwlSaved}
                              style={{ ...css.btn(nwlSaved?C.textD:C.purple), padding:"6px 14px", fontSize:11,
                                opacity:nwlSaved?0.5:1 }}>
                              {nwlSaved ? "✓ Archivé" : "💾 Archiver"}
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
                      {saved?"✓ Archivé":"💾 Archiver"}
                    </button>
                  </div>
                </div>
                <div style={{ fontSize:13, color:C.text, lineHeight:1.7, fontStyle:"italic" }}>{result.executiveSummary}</div>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <Card>
                  <SecHead icon="🎯" label="Top priorités" color={C.red}/>
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
                  <SecHead icon="⚠" label="Risques clés" color={C.amber}/>
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
                  <SecHead icon="👁" label="Leadership Watch" color={C.purple}/>
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
                  <SecHead icon="✈" label="Retention Watch" color={C.red}/>
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
                <SecHead icon="📅" label="Actions de la semaine" color={C.em}/>
                {result.weeklyActions?.map((a,i) => <div key={i} style={{ display:"flex", gap:10, marginBottom:8 }}>
                  <Badge label={a.deadline} color={C.amber} size={10}/>
                  <div>
                    <div style={{ fontSize:13, color:C.text }}>{a.action}</div>
                    <Mono color={C.textD} size={9}>OWNER: {a.owner}</Mono>
                  </div>
                </div>)}
              </Card>

              {result.lookAhead && <Card style={{ marginTop:10 }}>
                <SecHead icon="🔭" label="Semaine prochaine" color={C.teal}/>
                <div style={{ fontSize:13, color:C.text, lineHeight:1.7 }}>{result.lookAhead}</div>
              </Card>}

              {result.watchList?.length > 0 && (
                <Card style={{ marginTop:10, borderLeft:`3px solid ${C.textD}` }}>
                  <SecHead icon="📡" label="Radar — Sujets à garder en mémoire" color={C.textM}/>
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
                  ↺ Nouveau brief
                </button>
              </div>
            </div>
          )}

          {/* ── RECAP DIRECTRICE TAB (in result view) */}
          {briefTab === "recap" && (() => {
            const sentRecaps = data.sentRecaps || [];
            const lastSent = sentRecaps.length > 0 ? sentRecaps[sentRecaps.length - 1] : null;
            const subTabs = [
              { id:"generate", label:"⚡ Générer" },
              { id:"sent",     label:"📤 Récap envoyé" },
              { id:"history",  label:`📚 Historique${sentRecaps.length > 0 ? ` (${sentRecaps.length})` : ""}` },
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
                      📅 Généré automatiquement depuis tous tes meetings, signaux, dossiers et preps 1:1 de la période sélectionnée.
                    </div>
                    {recapError && <div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7,
                      padding:"10px 14px", marginBottom:12, fontSize:12, color:C.red }}>⚠ {recapError}</div>}
                    {recapLoading ? <AILoader label="Génération du récap depuis l'historique"/> : (
                      !recapResult && <button onClick={generateRecap} style={{ ...css.btn(C.blue), width:"100%", padding:"13px", fontSize:14,
                        boxShadow:`0 4px 20px ${C.blue}30` }}>
                        📋 Générer le récap directrice
                      </button>
                    )}
                  {recapResult && (
                    <div style={{ marginTop:16 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:C.text }}>📋 {recapResult.weekLabel}</div>
                        <div style={{ display:"flex", gap:8 }}>
                          <button onClick={() => setRecapResult(null)} style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>↺ Regénérer</button>
                          <button onClick={copyRecap} style={{ ...css.btn(copied?C.em:C.blue), padding:"8px 14px", fontSize:12 }}>
                            {copied ? "✓ Copié !" : "📋 Copier"}
                          </button>
                        </div>
                      </div>
                      {(recapResult.recrutement?.embauches?.length>0||recapResult.recrutement?.processus?.length>0||recapResult.recrutement?.ouvertures?.length>0) && (
                        <Card style={{ marginBottom:10 }}>
                          <SecHead icon="🎯" label="Recrutement" color={C.blue}/>
                          {recapResult.recrutement?.embauches?.length>0 && <div style={{ marginBottom:10 }}>
                            <Mono color={C.em} size={9}>EMBAUCHES CONFIRMÉES</Mono>
                            {recapResult.recrutement.embauches.map((i,idx) => (
                              <div key={idx} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                                <span style={{ color:C.em, fontSize:12, flexShrink:0 }}>✓</span>
                                <span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{i.item}</span>
                              </div>
                            ))}
                          </div>}
                          {recapResult.recrutement?.processus?.length>0 && <div style={{ marginBottom:10 }}>
                            <Mono color={C.blue} size={9}>PROCESSUS EN COURS</Mono>
                            {recapResult.recrutement.processus.map((i,idx) => (
                              <div key={idx} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                                <span style={{ color:C.blue, fontSize:12, flexShrink:0 }}>→</span>
                                <span style={{ fontSize:13, color:C.text, lineHeight:1.6 }}>{i.item}</span>
                              </div>
                            ))}
                          </div>}
                          {recapResult.recrutement?.ouvertures?.length>0 && <div>
                            <Mono color={C.textD} size={9}>OUVERTURES DE POSTE</Mono>
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
                        {key:"promotions", icon:"⬆", label:"Promotions",                        color:C.purple},
                        {key:"fins_emploi",icon:"🚪", label:"Fins d'emploi",                    color:C.textM},
                        {key:"performance",icon:"⚖",  label:"Performance / Plaintes / Enquêtes",color:C.red},
                        {key:"projets_rh", icon:"🔧", label:"Processus et Projets RH",          color:C.teal},
                        {key:"divers",     icon:"📎", label:"Divers",                           color:C.textD},
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
                {recapSubTab === "sent" && (
                  <div>
                    <div style={{ background:C.em+"10", border:`1px solid ${C.em}25`, borderRadius:8,
                      padding:"10px 14px", marginBottom:14, fontSize:12, color:C.textM }}>
                      📤 Colle ici le récap final que tu as envoyé à ta directrice. Il sera archivé avec la date et consultable les semaines suivantes.
                    </div>
                    <Mono color={C.textD} size={9}>RÉCAP FINAL ENVOYÉ</Mono>
                    <textarea rows={14} value={sentRecapText}
                      onChange={e => { setSentRecapText(e.target.value); setSentRecapSaved(false); }}
                      placeholder={"Colle ton récap final ici — tel qu'envoyé à ta directrice..."}
                      style={{ ...css.textarea, marginTop:6, fontFamily:"monospace", fontSize:12, lineHeight:1.7 }}
                      onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
                    <div style={{ display:"flex", gap:10, marginTop:10 }}>
                      <div style={{ fontSize:11, color:C.textD, flex:1, alignSelf:"center" }}>
                        {inputs.weekOf || new Date().toLocaleDateString("fr-CA")}
                      </div>
                      <button onClick={saveSentRecap} disabled={!sentRecapText.trim() || sentRecapSaved}
                        style={{ ...css.btn(sentRecapSaved ? C.textD : C.em), padding:"9px 20px", fontSize:13 }}>
                        {sentRecapSaved ? "✓ Archivé" : "💾 Archiver ce récap"}
                      </button>
                    </div>
                    {sentRecapSaved && (
                      <div style={{ marginTop:12, padding:"10px 14px", background:C.em+"12", border:`1px solid ${C.em}30`,
                        borderRadius:7, fontSize:12, color:C.em }}>
                        ✓ Récap archivé — consultable dans Historique la semaine prochaine.
                      </div>
                    )}
                  </div>
                )}

                {/* ── HISTORY sub-tab */}
                {recapSubTab === "history" && (
                  <div>
                    {sentRecaps.length === 0 ? (
                      <div style={{ textAlign:"center", padding:"40px 20px", color:C.textD, fontSize:13 }}>
                        Aucun récap archivé. Archive ton premier récap dans l'onglet Récap envoyé.
                      </div>
                    ) : (
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        {[...sentRecaps].reverse().map((r, i) => (
                          <Card key={r.id||i}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                              <div>
                                <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{r.weekLabel}</div>
                                <Mono color={C.textD} size={9}>Archivé le {r.savedAt}</Mono>
                              </div>
                              <button onClick={() => {
                                setSentRecapText(r.sentText);
                                setRecapSubTab("sent");
                              }} style={{ ...css.btn(C.textM, true), padding:"5px 10px", fontSize:11 }}>
                                Consulter
                              </button>
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

        </div>
      )}
    </div>
  );
}
