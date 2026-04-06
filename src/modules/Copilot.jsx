// ── MODULE: HRBP COPILOT ─────────────────────────────────────────────────────
// Source: HRBP_OS.jsx L.5453–5803

import { useState, useRef } from "react";
import Mono     from '../components/Mono.jsx';
import Card     from '../components/Card.jsx';
import AILoader from '../components/AILoader.jsx';
import { WORKSHOP_DB } from './Workshop.jsx';
import { COPILOT_SP } from '../prompts/copilot.js';
import { callAIText } from '../api/index.js';
import { fmtDate } from '../utils/format.js';
import { buildLegalPromptContext, isLegalSensitive } from '../utils/legal.js';
import { C, css } from '../theme.js';

export default function ModuleCopilot({ data }) {
  const [situation, setSituation]   = useState("");
  const [loading, setLoading]       = useState(false);
  const [response, setResponse]     = useState(null);
  const [error, setError]           = useState("");
  const [history, setHistory]       = useState([]);
  const [copied, setCopied]         = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const responseRef = useRef(null);

  // Build rich context from all OS data
  const buildContext = () => {
    const cases      = data.cases      || [];
    const meetings   = data.meetings   || [];
    const signals    = data.signals    || [];
    const decisions  = data.decisions  || [];
    const coaching   = data.coaching   || [];
    const prep1on1   = data.prep1on1   || [];

    const activeCases = cases.filter(c => c.status === "active" || c.status === "open");
    const recentMeetings = meetings.slice().reverse().slice(0, 8);
    const recentSignals  = signals.slice().reverse().slice(0, 6);

    // Active cases
    const casesCtx = activeCases.length > 0
      ? activeCases.map(c =>
          `- [${c.type?.toUpperCase()||"CASE"}] ${c.title} | Risk: ${c.riskLevel} | Status: ${c.status}\n  Situation: ${c.situation||""}\n  Interventions: ${c.interventionsDone||"none"}\n  HR Position: ${c.hrPosition||""}\n  Next follow-up: ${c.nextFollowUp||"not set"}`
        ).join("\n")
      : "No active cases.";

    // Signals
    const signalsCtx = recentSignals.length > 0
      ? recentSignals.map(s =>
          `- [${s.analysis?.category||"SIGNAL"}] ${s.analysis?.title||""} (${s.analysis?.severity||""}) — ${fmtDate(s.savedAt)}\n  ${s.analysis?.interpretation||""}`
        ).join("\n")
      : "No recent signals.";

    // Recent meetings — include analysis summary
    const meetingsCtx = recentMeetings.length > 0
      ? recentMeetings.map(m => {
          const a = m.analysis || {};
          const actions = (a.actions||[]).map(x => `${x.action} [${x.owner}/${x.delay}]`).join("; ");
          return `- [${m.meetingType?.toUpperCase()||"MEETING"}] ${a.meetingTitle||""} — ${m.director||""} (${fmtDate(m.savedAt)})\n  Risk: ${a.overallRisk||""} — ${a.overallRiskRationale||""}\n  Summary: ${(a.summary||[]).join(" | ")}\n  Actions: ${actions||"none"}`;
        }).join("\n")
      : "No recent meetings.";

    // Open actions from meetings
    const openActions = recentMeetings.flatMap(m =>
      (m.analysis?.actions||[]).map(a => `- ${a.action} [${a.owner} / ${a.delay}] — from meeting: ${m.analysis?.meetingTitle||""} (${fmtDate(m.savedAt)})`)
    );
    const actionsCtx = openActions.length > 0 ? openActions.slice(0, 12).join("\n") : "No tracked open actions.";

    // Coaching
    const coachingCtx = (coaching||[]).slice(-3).map(c =>
      `- ${c.scenario||""} — ${fmtDate(c.savedAt)}`
    ).join("\n") || "None.";

    // 1:1 prep recent outputs
    const prepCtx = (prep1on1||[]).slice(-3).map(p => {
      const o = p.output || {};
      return `- 1:1 with ${p.managerName||""} (${fmtDate(p.savedAt)}): Risk ${o.overallRisk||""} — ${o.executiveSummary||""}`;
    }).join("\n") || "None.";

    // Workshop playbooks — list available
    const playbooksCtx = WORKSHOP_DB.map(w => `- ${w.title} [${w.category}]`).join("\n");

    return `## ACTIVE CASES (${activeCases.length})
${casesCtx}

## SIGNALS (last ${recentSignals.length})
${signalsCtx}

## RECENT HISTORY — MEETINGS (last ${recentMeetings.length})
${meetingsCtx}

## OPEN ACTIONS / FOLLOW-UPS
${actionsCtx}

## RECENT COACHING
${coachingCtx}

## RECENT 1:1 PREP OUTPUTS
${prepCtx}

## INTERNAL PLAYBOOKS AVAILABLE
${playbooksCtx}`;
  };

  const analyze = async () => {
    if (!situation.trim()) return;
    const ctx = buildContext();
    const _copProv = data.profile?.defaultProvince || "QC";
    const _copLegal = isLegalSensitive(situation)
      ? `\n\n## CADRE LEGAL\n\n${buildLegalPromptContext(_copProv)}` : "";
    const userMsg = `${ctx}${_copLegal}\n\n---\n\n## USER SITUATION\n\n${situation.trim()}`;
    setLoading(true); setError(""); setResponse(null);
    try {
      const text = await callAIText(COPILOT_SP, userMsg, 4000);
      setResponse(text);
      setHistory(h => [{ situation: situation.trim(), response: text, ts: new Date().toISOString() }, ...h.slice(0, 9)]);
      setTimeout(() => responseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch(e) { setError("Erreur: " + e.message); }
    finally { setLoading(false); }
  };

  const importCopilotResponse = (text) => {
    setResponse(text);
    setHistory(h => [{ situation: situation.trim(), response: text, ts: new Date().toISOString() }, ...h.slice(0, 9)]);
    setTimeout(() => responseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const copyResponse = () => {
    if (!response) return;
    const ta = document.createElement("textarea");
    ta.value = response;
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  };

  // Parse markdown-style sections from response
  const renderResponse = (text) => {
    if (!text) return null;
    const sections = [];
    const lines = text.split("\n");
    let current = null;
    for (const line of lines) {
      if (line.startsWith("## ")) {
        if (current) sections.push(current);
        current = { heading: line.replace(/^##\s*/, ""), lines: [] };
      } else if (current) {
        current.lines.push(line);
      } else {
        if (!current) current = { heading: null, lines: [] };
        current.lines.push(line);
      }
    }
    if (current) sections.push(current);

    const SECTION_COLORS = {
      "1.": C.blue, "2.": C.purple, "3.": C.teal,
      "4.": C.red, "5.": C.amber, "6.": C.em,
      "7.": C.purple, "8.": C.amber,
    };
    const getColor = (heading) => {
      if (!heading) return C.em;
      const key = Object.keys(SECTION_COLORS).find(k => heading.startsWith(k));
      return key ? SECTION_COLORS[key] : C.em;
    };

    return sections.map((sec, i) => {
      const color = getColor(sec.heading);
      const body = sec.lines.join("\n").trim();
      if (!body && !sec.heading) return null;
      return (
        <div key={i} style={{ marginBottom: sec.heading ? 12 : 0 }}>
          {sec.heading && (
            <div style={{ display:"flex", alignItems:"center", gap:8,
              marginBottom:8, paddingBottom:6, borderBottom:`1px solid ${color}30` }}>
              <Mono color={color} size={10}>{sec.heading}</Mono>
            </div>
          )}
          {body && (
            <div style={{ fontSize:13, color:C.text, lineHeight:1.8, whiteSpace:"pre-wrap" }}>
              {body.split("\n").map((line, j) => {
                if (line.startsWith("* ") || line.startsWith("- ")) {
                  return (
                    <div key={j} style={{ display:"flex", gap:10, marginBottom:5, alignItems:"flex-start" }}>
                      <span style={{ color, flexShrink:0, marginTop:3, fontSize:10 }}>▸</span>
                      <span style={{ lineHeight:1.7 }}>{line.replace(/^[*-]\s*/, "")}</span>
                    </div>
                  );
                }
                if (line.startsWith("→ ")) {
                  return (
                    <div key={j} style={{ padding:"6px 10px", background:color+"10",
                      borderLeft:`2px solid ${color}`, borderRadius:"0 6px 6px 0",
                      marginBottom:5, fontSize:12, color:C.text }}>
                      {line}
                    </div>
                  );
                }
                if (/^\*\*.*\*\*/.test(line)) {
                  return <div key={j} style={{ fontWeight:700, color:C.text, marginBottom:3 }}>
                    {line.replace(/\*\*(.*?)\*\*/g, "$1")}
                  </div>;
                }
                if (line.trim() === "") return <div key={j} style={{ height:6 }}/>;
                return <div key={j} style={{ marginBottom:3 }}>{line}</div>;
              })}
            </div>
          )}
        </div>
      );
    }).filter(Boolean);
  };

  // Counts for context summary
  const activeCasesCount  = (data.cases||[]).filter(c => c.status==="active"||c.status==="open").length;
  const meetingsCount     = (data.meetings||[]).length;
  const signalsCount      = (data.signals||[]).length;
  const total             = activeCasesCount + meetingsCount + signalsCount;

  return (
    <div style={{ maxWidth:860, margin:"0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:6 }}>
          <div style={{ width:34, height:34, background:C.em, borderRadius:8,
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>⚡</div>
          <div>
            <div style={{ fontSize:18, fontWeight:700, color:C.text }}>HRBP Copilot</div>
            <div style={{ fontSize:12, color:C.textM }}>Intelligence stratégique avec accès complet au contexte du OS</div>
          </div>
        </div>

        {/* Context summary bar */}
        <button onClick={() => setContextExpanded(v => !v)}
          style={{ width:"100%", display:"flex", alignItems:"center", gap:12,
            padding:"10px 14px", background:C.surfL, border:`1px solid ${C.border}`,
            borderRadius:8, cursor:"pointer", fontFamily:"'DM Sans',sans-serif",
            marginTop:10, textAlign:"left" }}>
          <span style={{ fontSize:11, color:C.textD, fontFamily:"'DM Mono',monospace", letterSpacing:1, textTransform:"uppercase" }}>
            Contexte injecté
          </span>
          <div style={{ display:"flex", gap:8, flex:1 }}>
            {[
              { label:`${activeCasesCount} cas actifs`,  color:C.em },
              { label:`${meetingsCount} meetings`,        color:C.blue },
              { label:`${signalsCount} signaux`,          color:C.purple },
              { label:`${(data.prep1on1||[]).length} preps 1:1`, color:C.teal },
            ].map((item,i) => (
              <span key={i} style={{ background:item.color+"18", border:`1px solid ${item.color}30`,
                color:item.color, borderRadius:5, padding:"2px 8px",
                fontSize:10, fontWeight:600, fontFamily:"'DM Mono',monospace" }}>
                {item.label}
              </span>
            ))}
          </div>
          <span style={{ fontSize:11, color:C.textD, flexShrink:0 }}>
            {contextExpanded ? "▲ Masquer" : "▼ Voir le contexte"}
          </span>
        </button>

        {contextExpanded && (
          <div style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8,
            padding:"14px 16px", marginTop:4, fontSize:11, color:C.textD,
            fontFamily:"'DM Mono',monospace", lineHeight:1.8, maxHeight:280,
            overflowY:"auto", whiteSpace:"pre-wrap" }}>
            {buildContext()}
          </div>
        )}
      </div>

      {/* Input */}
      <Card style={{ marginBottom:14, borderLeft:`3px solid ${C.em}` }}>
        <Mono color={C.em} size={9}>SITUATION — Décris ce qui se passe</Mono>
        <textarea
          rows={5}
          value={situation}
          onChange={e => setSituation(e.target.value)}
          placeholder={"Ex: Mon gestionnaire TI refuse depuis 3 mois de documenter les problèmes de performance de son analyste senior. À chaque discussion, il dit que ça s'améliore, mais l'équipe me remonte que la situation empire. J'ai un signal reçu la semaine passée d'un pair qui dit vouloir quitter à cause de lui..."}
          style={{ ...css.textarea, marginTop:10, fontSize:13, lineHeight:1.7 }}
          onFocus={e=>e.target.style.borderColor=C.em+"60"}
          onBlur={e=>e.target.style.borderColor=C.border}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) analyze(); }}
        />
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:10 }}>
          <span style={{ fontSize:11, color:C.textD }}>Cmd/Ctrl + Enter pour analyser</span>
          {loading ? (
            <AILoader label="Analyse en cours…"/>
          ) : (
            <button onClick={analyze} disabled={!situation.trim()}
              style={{ ...css.btn(situation.trim() ? C.em : C.textD),
                padding:"10px 24px", fontSize:13,
                opacity: situation.trim() ? 1 : 0.5,
                boxShadow: situation.trim() ? `0 4px 20px ${C.em}30` : "none" }}>
              ⚡ Analyser
            </button>
          )}
        </div>
      </Card>

      {error && (
        <div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7,
          padding:"10px 14px", marginBottom:12, fontSize:12, color:C.red }}>⚠ {error}</div>
      )}

      {/* Response */}
      {response && (
        <div ref={responseRef}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <Mono color={C.em} size={9}>Analyse HRBP</Mono>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={copyResponse}
                style={{ ...css.btn(copied ? C.em : C.textM, true), padding:"6px 12px", fontSize:11 }}>
                {copied ? "✓ Copié" : "📋 Copier"}
              </button>
              <button onClick={() => { setResponse(null); setSituation(""); }}
                style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>
                ↺ Nouvelle analyse
              </button>
            </div>
          </div>
          <Card style={{ borderLeft:`3px solid ${C.em}` }}>
            {renderResponse(response)}
          </Card>
        </div>
      )}

      {/* History */}
      {history.length > 1 && !response && (
        <div style={{ marginTop:24 }}>
          <Mono color={C.textD} size={9}>Analyses précédentes — cette session</Mono>
          <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:7 }}>
            {history.slice(1).map((h,i) => (
              <button key={i}
                onClick={() => { setResponse(h.response); setSituation(h.situation); }}
                style={{ ...css.card, cursor:"pointer", textAlign:"left",
                  fontFamily:"'DM Sans',sans-serif", border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:12, color:C.text, lineHeight:1.5,
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {h.situation.substring(0, 120)}{h.situation.length > 120 ? "…" : ""}
                </div>
                <Mono color={C.textD} size={8} style={{ marginTop:4, display:"block" }}>
                  {new Date(h.ts).toLocaleTimeString("fr-CA", { hour:"2-digit", minute:"2-digit" })}
                </Mono>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!response && !loading && history.length === 0 && (
        <div style={{ textAlign:"center", padding:"40px 20px", color:C.textD }}>
          <div style={{ fontSize:40, marginBottom:16 }}>⚡</div>
          <div style={{ fontSize:14, color:C.textM, marginBottom:8 }}>
            Décris une situation — le Copilot analyse avec tout le contexte de ton OS.
          </div>
          <div style={{ fontSize:12, color:C.textD, maxWidth:480, margin:"0 auto", lineHeight:1.7 }}>
            Cas actifs · Meetings récents · Signaux · Preps 1:1 · Playbooks · Historique de décisions
          </div>
        </div>
      )}
    </div>
  );
}
