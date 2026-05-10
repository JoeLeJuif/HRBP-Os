// ── Module: Meetings ─────────────────────────────────────────────────────────
// Source: HRBP_OS.jsx L.570–1737
// Extraction fidèle — aucune modification de logique

import { useState, useEffect } from "react";
import { C, css, DELAY_C, RISK } from '../theme.js';
import { fmtDate, getProvince } from '../utils/format.js';
import { buildLegalPromptContext } from '../utils/legal.js';
import { filterActiveCases } from '../utils/caseStatus.js';
import { getLeadersMap, isPersonArchived } from '../utils/leaderStore.js';
import { callAI } from '../api/index.js';
import { MEETING_SP, DISC_SP, TA_SP, INIT_SP } from '../prompts/meetings.js';
import { normalizeMeetingOutput, toArray } from '../utils/meetingModel.js';
import Mono         from '../components/Mono.jsx';
import Badge        from '../components/Badge.jsx';
import Card         from '../components/Card.jsx';
import Divider      from '../components/Divider.jsx';
import ProvinceBadge  from '../components/ProvinceBadge.jsx';
import Module1on1Prep from './Prep1on1.jsx';
import MeetingEngine  from './MeetingEngine.jsx';
import { useT } from '../lib/i18n.js';
import { ENGINE_MEETING_TYPES } from '../utils/engineMeetingTypes.js';

// ── Inline shared helpers ─────────────────────────────────────────────────────
function RiskBadge({ level }) {
  const norm = level;
  const r = RISK[norm] || RISK["Modéré"];
  return <Badge label={norm} color={r.color} />;
}
function SecHead({ icon, label, color=C.em }) {
  return <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, paddingBottom:8, borderBottom:`1px solid ${color}28` }}>
    <span style={{ fontSize:14 }}>{icon}</span>
    <Mono size={10} color={color}>{label}</Mono>
  </div>;
}
function BulletList({ items, color=C.em }) {
  if (!items?.length) return null;
  return <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
    {items.map((item,i) => <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
      <div style={{ width:5, height:5, borderRadius:"50%", background:color, flexShrink:0, marginTop:7 }} />
      <span style={{ fontSize:13, color:C.text, lineHeight:1.65 }}>
        {typeof item==="string" ? item : item.text || JSON.stringify(item)}
      </span>
    </div>)}
  </div>;
}

// ── MODULE: MEETINGS ──────────────────────────────────────────────────────────
// Meeting-specific loader with elapsed time + progress hint
function MeetingLoader({ chars=0 }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs(s => s+1), 1000);
    return () => clearInterval(t);
  }, []);
  const est = chars > 40000 ? 55 : chars > 20000 ? 35 : chars > 10000 ? 22 : 12;
  const pct = Math.min(95, Math.round((secs / est) * 100));
  const msg = secs < 5  ? "Envoi du transcript…"
            : secs < 12 ? "Lecture en cours…"
            : secs < 25 ? "Analyse des signaux et risques…"
            : secs < 40 ? "Génération du JSON…"
            : secs < 85 ? "Finalisation — encore quelques secondes…"
            :              "⚠ Délai long — si ça ne répond pas, relance.";
  return (
    <div style={{ padding:"24px 20px", background:C.surfL, borderRadius:10,
      border:`1px solid ${C.border}`, textAlign:"center" }}>
      <div style={{ width:36, height:36, border:`2px solid ${C.surfLL}`,
        borderTop:`2px solid ${C.em}`, borderRadius:"50%",
        animation:"spin 1s linear infinite", margin:"0 auto 14px" }}/>
      <div style={{ fontSize:13, color:C.text, fontWeight:600, marginBottom:6 }}>{msg}</div>
      <div style={{ height:4, background:C.surfLL, borderRadius:2, margin:"10px 0 8px",
        overflow:"hidden" }}>
        <div style={{ height:"100%", background:C.em, borderRadius:2,
          width:pct+"%", transition:"width .8s ease" }}/>
      </div>
      <div style={{ fontSize:11, color:C.textD }}>
        {secs}s écoulées{chars > 10000 ? ` · Transcript ${Math.round(chars/1000)}k car.` : ""}
        {secs > est ? " · Presque terminé…" : ` · ~${Math.max(1, est-secs)}s restantes`}
      </div>
    </div>
  );
}

function MeetingsTranscripts({ data, onSaveSession, onUpdateMeeting, onNavigate, focusMeetingId, onClearFocus, onSwitchTab }) {
  const { t } = useT();
  const [view, setView] = useState("list"); // list | new | result | director
  const [transcript, setTranscript] = useState("");
  const [meetingType, setMeetingType] = useState("director");
  const [meetingProvince, setMeetingProvince] = useState("QC");
  const [dirName, setDirName] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(false);
  const [briefPrompt, setBriefPrompt] = useState("");
  const [meetingPrompt, setMeetingPrompt] = useState("");
  const [activeDir, setActiveDir] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [meetingDate, setMeetingDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [meetingScope, setMeetingScope] = useState("leader");

  // ── Inter-module focus: auto-open a specific session on mount ────────────────
  useEffect(() => {
    if (!focusMeetingId) return;
    const meetings = data.meetings || [];
    console.log("[focus]", focusMeetingId, meetings.map(m => m.id));
    const fid = String(focusMeetingId);
    // Pass 1: direct match
    let target = meetings.find(m => String(m.id) === fid);
    // Pass 2: prep1on1 id → "mtg_" + id
    if (!target) target = meetings.find(m => String(m.id) === `mtg_${fid}`);
    // Pass 3: focusMeetingId is "mtg_xxx", meeting stored as raw "xxx"
    if (!target) target = meetings.find(m => `mtg_${String(m.id)}` === fid);
    // Pass 4: fallback by savedAt (timestamp overlap)
    if (!target) target = meetings.find(m => {
      const sa = String(m.savedAt || "");
      return sa && (sa.includes(fid) || fid.includes(sa));
    });
    if (target) {
      setActiveSession(target);
      // Normalize on read to protect against legacy sessions saved pre-contract.
      const raw = target.analysis || target.output || null;
      setResult(raw ? normalizeMeetingOutput(raw) : null);
      setTab("summary");
      setView("session");
      if (onClearFocus) onClearFocus();
    } else {
      console.log("[focus] not found — keeping focusMeetingId for retry");
    }
  }, [focusMeetingId, data.meetings]); // eslint-disable-line

  // Portfolio archive sync: hide meetings whose director is archived in
  // data.leaders from the active hub. Drill-down "director" view inherits
  // because its entry button only renders for non-archived directors.
  const leadersMap = getLeadersMap(data);
  const meetings = (data.meetings || []).filter(m => !isPersonArchived(m.director, leadersMap));
  const directors = [...new Set(meetings.map(m => m.director).filter(Boolean))];

  // Compress transcript: remove filler words, timestamps, repeated whitespace
  const compressTranscript = (t) => {
    return t
      // Remove common timestamp formats: [00:00], (00:00:00), 00:00:00
      .replace(/\[?\d{1,2}:\d{2}(?::\d{2})?\]?/g, "")
      // Remove speaker labels repetition padding: "SPEAKER_01:", "[Intervenant]:"
      .replace(/^(SPEAKER_\d+|Intervenant\s*\d*|Participant\s*\d*)\s*:/gim, "")
      // Remove filler words (fr + en)
      .replace(/\b(euh|heu|umm|uhh|uh|hmm|genre|tu sais|you know|like|ok ok|right right|yeah yeah)\b/gi, "")
      // Collapse 3+ newlines to 2
      .replace(/\n{3,}/g, "\n\n")
      // Collapse multiple spaces
      .replace(/ {2,}/g, " ")
      // Remove lines that are only whitespace or dashes
      .replace(/^[-\s]*$/gm, "")
      .trim();
  };

  const analyze = async () => {
    if (transcript.trim().length < 80) return;
    setLoading(true); setError(""); setResult(null); setSaved(false);
    try {
      const raw = transcript.trim();
      // Auto-compress if over 20k chars
      const t = raw.length > 20000 ? compressTranscript(raw) : raw;
      const _mProv = meetingProvince || data.profile?.defaultProvince || "QC";
      const _legalInject = meetingType === "disciplinaire"
        ? `\n${buildLegalPromptContext(_mProv)}\n` : "";
      const sp = meetingType === "ta" ? TA_SP
               : meetingType === "disciplinaire" ? DISC_SP
               : meetingType === "initiatives"   ? INIT_SP
               : MEETING_SP;
      // For very long transcripts: use a focused summary-first approach
      const isVeryLong = t.length > 25000;
      const focusNote = isVeryLong
        ? "\n\nNOTE: Transcript très long. Priorise les signaux RH, risques et actions. Max 3 items par liste. Sois concis."
        : "";
      const prompt = `TYPE: ${meetingType}\nDIRECTEUR: ${dirName||"Non spécifié"}\n${context?`CONTEXTE: ${context}\n`:""}${_legalInject}${focusNote}\nTRANSCRIPT:\n${t}`;
      const parsed = await callAI(sp, prompt, t.length);
      if (dirName) parsed.director = dirName;
      setResult(normalizeMeetingOutput(parsed));
      setView("result");
    } catch(e) {
      setError("Erreur: " + e.message);
    }
    finally { setLoading(false); }
  };

  // Manual compress button handler
  const handleCompress = () => {
    const compressed = compressTranscript(transcript);
    setTranscript(compressed);
  };

  const saveResult = () => {
    if (!result || saved) return;
    const today = new Date().toISOString().split("T")[0];
    const session = { id:Date.now().toString(), director:result.director||dirName||"Non assigné",
      savedAt: meetingDate || today, dateCreated: today,
      meetingType, scope:meetingScope, province:meetingProvince, analysis:result };
    onSaveSession(session, result.caseEntry);
    setSaved(true);
  };

  const isTAMeeting   = meetingType === "ta"            || activeSession?.meetingType === "ta";
  const isDiscMeeting = meetingType === "disciplinaire" || activeSession?.meetingType === "disciplinaire";
  const isInitMeeting = meetingType === "initiatives"   || activeSession?.meetingType === "initiatives";
  const TABS = isDiscMeeting ? [
    {id:"summary",   icon:"📋", label:t("meetings.tab.summary")},
    {id:"faits",     icon:"📄", label:t("meetings.tab.faits")},
    {id:"juridique", icon:"⚖",  label:t("meetings.tab.juridique")},
    {id:"sanction",  icon:"🔴", label:t("meetings.tab.sanction")},
    {id:"actions",   icon:"✅", label:t("meetings.tab.actionsDocs")},
  ] : isInitMeeting ? [
    {id:"summary",    icon:"📋", label:t("meetings.tab.summary")},
    {id:"initiatives",icon:"🚀", label:t("meetings.tab.initiatives"), badge: result?.initiatives?.length > 0 ? result.initiatives.length : null},
    {id:"blocages",   icon:"🚧", label:t("meetings.tab.blocages"),    badge: result?.blocagesGlobaux?.length > 0 ? result.blocagesGlobaux.length : null},
    {id:"decisions",  icon:"✅", label:t("meetings.tab.decisions")},
    {id:"actions",    icon:"🎯", label:t("meetings.tab.actions")},
    {id:"questions",  icon:"💬", label:t("meetings.tab.nextMeeting")},
  ] : isTAMeeting ? [
    {id:"summary",   icon:"📋", label:t("meetings.tab.summary")},
    {id:"postes",    icon:"🎯", label:t("meetings.tab.postes"), badge: result?.postes?.length > 0 ? result.postes.length : null},
    {id:"blocages",  icon:"🚧", label:t("meetings.tab.blocages"), badge: result?.blocages?.length > 0 ? result.blocages.length : null},
    {id:"actions",   icon:"✅", label:t("meetings.tab.actions")},
    {id:"questions", icon:"💬", label:t("meetings.tab.nextMeeting")},
  ] : [
    {id:"summary",icon:"📋",label:t("meetings.tab.summary")},
    {id:"people",icon:"👥",label:t("meetings.tab.people")},
    {id:"signals",icon:"📡",label:t("meetings.tab.signals")},
    {id:"risks",icon:"⚠",label:t("meetings.tab.risks")},
    {id:"actions",icon:"🎯",label:t("meetings.tab.actions")},
    {id:"questions",icon:"💬",label:t("meetings.tab.questions"), badge: result?.crossQuestions?.length > 0 ? `+${result.crossQuestions.length}` : null},
    {id:"case",icon:"📂",label:t("meetings.tab.case")},
  ];
  const [tab, setTab] = useState("summary");
  const [qsub, setQsub] = useState("meeting");
  const [groupBy, setGroupBy] = useState("director");
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaDraft, setMetaDraft] = useState({});

  if (view === "list") {
    const TYPE_META = {
      executif:      { label:t("meetings.type.executif").replace(/^[^\s]+\s/,""),            icon:"🏛", color:C.purple },
      vp:            { label:"VP",                  icon:"📊", color:C.blue },
      director:      { label:t("meetings.type.director").replace(/^[^\s]+\s/,""),          icon:"🏢", color:C.blue },
      manager:       { label:t("meetings.type.manager").replace(/^[^\s]+\s/,""),        icon:"👤", color:C.blue },
      talent:        { label:t("meetings.type.talent").replace(/^[^\s]+\s/,""),       icon:"⭐", color:C.amber },
      org:           { label:t("meetings.type.org").replace(/^[^\s]+\s/,""),    icon:"🔄", color:C.purple },
      ta:            { label:t("meetings.type.ta").replace(/^[^\s]+\s/,""),  icon:"🎯", color:C.teal },
      hrbpteam:      { label:t("meetings.type.hrbpteam").replace(/^[^\s]+\s/,""),           icon:"🤝", color:C.em },
      disciplinaire: { label:t("meetings.type.disciplinaire").replace(/^[^\s]+\s/,""),       icon:"⚖",  color:C.red },
      initiatives:   { label:t("meetings.type.initiatives").replace(/^[^\s]+\s/,""),         icon:"🚀", color:C.em },
    };
    return (
    <div style={{ maxWidth:860, margin:"0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>{t("meetings.title")}</div>
          <div style={{ fontSize:12, color:C.textM }}>{meetings.length}</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={() => onSwitchTab && onSwitchTab("engine")} style={{ ...css.btn(C.em) }}>{t("meetings.engine")}</button>
        </div>
      </div>

      {/* ── Mini dashboard (types / risk / caseEntry / active linked cases) ── */}
      {meetings.length > 0 && (() => {
        const byType = {};
        const byRisk = { "Faible":0, "Modéré":0, "Élevé":0, "Critique":0 };
        const RISK_ALIAS = { "Modere":"Modéré", "Eleve":"Élevé" };
        let withCaseEntry = 0;
        meetings.forEach(m => {
          const t = m.meetingType || m.analysis?.engineType || "autre";
          byType[t] = (byType[t]||0) + 1;
          const rRaw = m.analysis?.overallRisk;
          const r = RISK_ALIAS[rRaw] || rRaw;
          if (r && byRisk[r] !== undefined) byRisk[r]++;
          const ce = m.analysis?.caseEntry;
          if (ce && (ce.titre || ce.title)) withCaseEntry++;
        });
        const topTypes = Object.entries(byType).sort((a,b)=>b[1]-a[1]).slice(0,3);
        const linkedActiveCases = filterActiveCases(data.cases).filter(c => c.meetingId).length;
        const riskColors = { "Faible":C.em, "Modéré":C.blue, "Élevé":C.amber, "Critique":C.red };
        const tileCss = { background:C.surfL, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 12px" };
        return (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:10, marginBottom:18 }}>
            <div style={{ ...tileCss, borderLeft:`3px solid ${C.em}` }}>
              <Mono color={C.em} size={9}>{t("meetings.tile.byType")}</Mono>
              <div style={{ marginTop:6, display:"flex", flexDirection:"column", gap:3 }}>
                {topTypes.map(([t,n]) => (
                  <div key={t} style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:C.textM }}>
                    <span>{t}</span><span style={{ color:C.text, fontWeight:600 }}>{n}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ ...tileCss, borderLeft:`3px solid ${C.amber}` }}>
              <Mono color={C.amber} size={9}>{t("meetings.tile.byRisk")}</Mono>
              <div style={{ marginTop:6, display:"flex", flexDirection:"column", gap:3 }}>
                {Object.entries(byRisk).map(([lvl,n]) => (
                  <div key={lvl} style={{ display:"flex", justifyContent:"space-between", fontSize:11 }}>
                    <span style={{ color:riskColors[lvl] }}>{lvl}</span>
                    <span style={{ color:C.text, fontWeight:600 }}>{n}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ ...tileCss, borderLeft:`3px solid ${C.purple}` }}>
              <Mono color={C.purple} size={9}>{t("meetings.tile.withCase")}</Mono>
              <div style={{ marginTop:8, fontSize:24, fontWeight:700, color:C.text }}>{withCaseEntry}</div>
              <div style={{ fontSize:10, color:C.textD }}>/ {meetings.length}</div>
            </div>
            <div style={{ ...tileCss, borderLeft:`3px solid ${C.red}` }}>
              <Mono color={C.red} size={9}>{t("meetings.tile.linkedCases")}</Mono>
              <div style={{ marginTop:8, fontSize:24, fontWeight:700, color:C.text }}>{linkedActiveCases}</div>
              <div style={{ fontSize:10, color:C.textD }}>{t("meetings.tile.linkedCases.sub")}</div>
            </div>
          </div>
        );
      })()}

      {/* Group by toggle */}
      <div style={{ display:"flex", gap:2, marginBottom:20, background:C.surfL, borderRadius:8, padding:4, width:"fit-content" }}>
        {[{id:"director",label:t("meetings.byDirector")},{id:"type",label:t("meetings.byType")}].map(g => (
          <button key={g.id} onClick={() => setGroupBy(g.id)}
            style={{ padding:"6px 16px", borderRadius:6, fontSize:12, cursor:"pointer",
              fontFamily:"'DM Sans',sans-serif", border:"none",
              background: groupBy===g.id ? C.em : "none",
              color: groupBy===g.id ? "#fff" : C.textM,
              fontWeight: groupBy===g.id ? 600 : 400 }}>
            {g.label}
          </button>
        ))}
      </div>

      {/* ── BY DIRECTOR ── */}
      {groupBy === "director" && (() => {
        const LEVEL_MAP = {
          employe:       { label:"Employé",      icon:"🧑", color:C.em,     order:0 },
          gestionnaire:  { label:t("meetings.type.manager").replace(/^[^\s]+\s/,""), icon:"👤", color:C.teal,   order:1 },
          directeur:     { label:t("meetings.type.director").replace(/^[^\s]+\s/,""),    icon:"🏢", color:C.blue,   order:2 },
          director:      { label:t("meetings.type.director").replace(/^[^\s]+\s/,""),    icon:"🏢", color:C.blue,   order:2 },
          manager:       { label:t("meetings.type.manager").replace(/^[^\s]+\s/,""), icon:"👤", color:C.teal,   order:1 },
          vp:            { label:"VP",           icon:"📊", color:C.blue,   order:3 },
          executif:      { label:t("meetings.type.executif").replace(/^[^\s]+\s/,""),     icon:"🏛", color:C.purple, order:4 },
          hrbp_team:     { label:t("meetings.type.hrbpteam").replace(/^[^\s]+\s/,""),    icon:"🤝", color:C.purple, order:5 },
          ta_team:       { label:"TA Team",      icon:"🎯", color:C.teal,   order:6 },
          autres:        { label:"Autres",       icon:"📋", color:C.textD,  order:7 },
        };
        const OTHER_LVL = { label:"Autres", icon:"📋", color:C.textD, order:7 };
        // Determine dominant level per director name (lowest order wins)
        const dirLevel = {};
        meetings.forEach(m => {
          if (!m.director) return;
          // For Meeting Engine sessions: use niveau; for Meetings Hub: use meetingType
          const levelKey = m.kind === "1:1-meeting" ? (m.niveau || m.analysis?.niveau || "autres") : m.meetingType;
          const lvl = LEVEL_MAP[levelKey];
          if (!lvl) return;
          const prev = dirLevel[m.director];
          if (!prev || lvl.order < prev.order) dirLevel[m.director] = lvl;
        });
        // Group directors by level
        const groups = {};
        directors.forEach(d => {
          const lvl = dirLevel[d] || OTHER_LVL;
          if (!groups[lvl.label]) groups[lvl.label] = { ...lvl, dirs: [] };
          groups[lvl.label].dirs.push(d);
        });
        const orderedGroups = Object.values(groups).sort((a,b) => a.order - b.order);
        return <>
          {orderedGroups.map(group => (
            <div key={group.label} style={{ marginBottom:22 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10,
                paddingBottom:6, borderBottom:`2px solid ${group.color}33` }}>
                <span style={{ fontSize:14 }}>{group.icon}</span>
                <Mono color={group.color} size={9}>{group.label}</Mono>
                <span style={{ fontSize:10, color:C.textD, fontFamily:"'DM Mono',monospace", letterSpacing:1 }}>
                  — {group.dirs.length} personne{group.dirs.length > 1 ? "s" : ""}
                </span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))", gap:10 }}>
                {group.dirs.map(d => {
                  const dm = meetings.filter(m => m.director===d);
                  const last = dm[dm.length-1];
                  const r = RISK[last?.analysis?.overallRisk]||RISK["Faible"];
                  return <button key={d} onClick={() => { setActiveDir(d); setView("director"); }}
                    style={{ background:C.surfL, border:`1px solid ${r.color}28`,
                      borderLeft:`3px solid ${group.color}`,
                      borderRadius:10, padding:"13px 14px", cursor:"pointer",
                      textAlign:"left", fontFamily:"'DM Sans',sans-serif" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                      <span style={{ fontSize:18 }}>{group.icon}</span>
                      <RiskBadge level={last?.analysis?.overallRisk||"Faible"} />
                    </div>
                    <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:4 }}>{d}</div>
                    <Mono color={C.textD} size={8}>
                      {dm.length} meeting{dm.length>1?"s":""}
                    </Mono>
                    {last?.savedAt && <Mono color={C.textD} size={8}>Dernier: {fmtDate(last.savedAt)}</Mono>}
                  </button>;
                })}
              </div>
            </div>
          ))}
          {directors.length === 0 && (
            <div style={{ textAlign:"center", padding:"60px 20px", color:C.textD }}>
              <div style={{ fontSize:36, marginBottom:12 }}>🎙️</div>
              <div style={{ fontSize:13, color:C.textM, marginBottom:6 }}>{t("meetings.empty.title")}</div>
              <div style={{ fontSize:12, color:C.textD }}>{t("meetings.empty.body")}</div>
            </div>
          )}
        </>;
      })()}

      {/* ── BY TYPE ── */}
      {groupBy === "type" && (() => {
        const groups = {};
        meetings.forEach(m => {
          const t = m.meetingType || "director";
          if (!groups[t]) groups[t] = [];
          groups[t].push(m);
        });
        return <>
          {Object.entries(groups).map(([type, group]) => {
            const meta = TYPE_META[type] || { label:type, icon:"📋", color:C.textD };
            return (
              <div key={type} style={{ marginBottom:22 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10,
                  paddingBottom:6, borderBottom:`2px solid ${meta.color}33` }}>
                  <span style={{ fontSize:14 }}>{meta.icon}</span>
                  <Mono color={meta.color} size={9}>{meta.label}</Mono>
                  <Badge label={`${group.length}`} color={meta.color} size={10}/>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {group.slice().reverse().map((m,i) => (
                    <button key={i}
                      onClick={() => { setActiveSession(m); setResult(normalizeMeetingOutput(m.analysis)); setTab("summary"); setView("session"); }}
                      style={{ ...css.card, cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif",
                        display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:500, color:C.text, marginBottom:4 }}>{m.analysis?.meetingTitle}</div>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                          {m.director && <Badge label={m.director} color={C.blue} size={10} />}
                          <ProvinceBadge province={getProvince(m, data.profile)}/>
                          <Mono color={C.textD} size={8}>{m.savedAt}</Mono>
                          <RiskBadge level={m.analysis?.overallRisk||"Faible"}/>
                          {m.scope && m.scope !== "leader" && (
                            <Badge label={{ team:"Équipe", individual:"Individuel", org:"Org" }[m.scope] || m.scope}
                              color={{ team:C.teal, individual:C.blue, org:C.textD }[m.scope] || C.textD}
                              size={9}/>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {meetings.length === 0 && (
            <div style={{ textAlign:"center", padding:"60px 20px", color:C.textD }}>
              <div style={{ fontSize:36, marginBottom:12 }}>🎙️</div>
              <div style={{ fontSize:13, color:C.textM, marginBottom:6 }}>{t("meetings.empty.title")}</div>
              <div style={{ fontSize:12, color:C.textD }}>{t("meetings.empty.body")}</div>
            </div>
          )}
        </>;
      })()}

      {/* Recent meetings footer */}
      {meetings.length > 0 && (
        <div style={{ marginTop:20 }}>
          <Mono color={C.textD} size={9}>{t("meetings.recent")}</Mono>
          <div style={{ display:"flex", flexDirection:"column", gap:5, marginTop:8 }}>
            {meetings.slice().reverse().slice(0,5).map((m,i) => (
              <button key={i}
                onClick={() => { setActiveSession(m); setResult(normalizeMeetingOutput(m.analysis)); setTab("summary"); setView("session"); }}
                style={{ ...css.card, cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif",
                  display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 12px" }}>
                <span style={{ fontSize:12, color:C.text }}>{m.analysis?.meetingTitle}</span>
                <div style={{ display:"flex", gap:6 }}>
                  {m.director && <Badge label={m.director} color={C.blue} size={10} />}
                  <ProvinceBadge province={getProvince(m, data.profile)}/>
                  <Mono color={C.textD} size={8}>{fmtDate(m.savedAt)}</Mono>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
    );
  }

  if (view === "new") {
    if (onSwitchTab) onSwitchTab("engine");
    setView("list");
    return null;
  }

  // Session / result view — Meeting Type dropdown reuses the 1:1 Engine list
  // (ENGINE_MEETING_TYPES). Labels resolve via i18n key `meetings.engineType.<id>`,
  // falling back to the shared FR label when no translation is registered.
  const MEETING_TYPES = ENGINE_MEETING_TYPES.map(et => {
    const key = `meetings.engineType.${et.id}`;
    const translated = t(key);
    return { id: et.id, label: translated === key ? et.label : translated };
  });

  // Edit-mode helpers — convert between structured fields and editable text blocks.
  const linesToArr = (s) => (s || "").split("\n").map(x => x.trim()).filter(Boolean);
  const arrToLines = (arr) => (Array.isArray(arr) ? arr : [])
    .map(x => typeof x === "string" ? x : (x?.text || ""))
    .filter(Boolean).join("\n");
  // Generic pipe-row encoder/decoder for arrays of objects.
  const objsToPipeLines = (arr, fields) => (Array.isArray(arr) ? arr : [])
    .map(o => {
      if (typeof o === "string") return o;
      return fields.map(f => (o?.[f] ?? "")).join(" | ");
    }).filter(s => s.replace(/[\s|]/g, "")).join("\n");
  const pipeLinesToObjs = (s, fields) => (s || "").split("\n").map(line => {
    const parts = line.split("|").map(x => x.trim());
    if (parts.every(p => !p)) return null;
    const out = {};
    fields.forEach((f, i) => { out[f] = parts[i] || ""; });
    // Fallback: if all but one field is empty and the lone field isn't the
    // "main" one, treat the whole line as the main field so users can paste
    // free-form bullets without remembering the pipe schema.
    return out;
  }).filter(Boolean);

  // Field schemas (kept here so encode/decode stay symmetric).
  const ACTION_FIELDS  = ["delay", "owner", "action"];
  const SIGNAL_FIELDS  = ["category", "breadth", "signal", "interpretation", "ifUnaddressed"];
  const RISK_FIELDS    = ["level", "trend", "risk", "rationale"];
  const QUESTION_FIELDS = ["target", "question", "why"];

  const openEditor = () => {
    const r = result || {};
    const ce = r.caseEntry || {};
    const ppl = r.people || {};
    setMetaDraft({
      meetingTitle: r.meetingTitle || activeSession?.analysis?.meetingTitle || "",
      director:     activeSession?.director ?? r.director ?? dirName ?? "",
      meetingType:  activeSession?.meetingType || meetingType,
      scope:        activeSession?.scope || meetingScope || "leader",
      savedAt:      activeSession?.savedAt || meetingDate || r.meetingDate || "",
      hrbpKeyMessage: r.hrbpKeyMessage || "",
      summaryText:  arrToLines(r.summary),
      peoplePerfText: arrToLines(ppl.performance),
      peopleLeadText: arrToLines(ppl.leadership),
      peopleEnggText: arrToLines(ppl.engagement),
      signalsText:   objsToPipeLines(r.signals, SIGNAL_FIELDS),
      risksText:     objsToPipeLines(r.risks, RISK_FIELDS),
      actionsText:   objsToPipeLines(r.actions, ACTION_FIELDS),
      questionsText: objsToPipeLines(r.questions, QUESTION_FIELDS),
      caseTitle:        ce.title || ce.titre || "",
      caseType:         ce.type || "",
      caseRiskLevel:    ce.riskLevel || "",
      caseSituation:    ce.situation || "",
      caseInterventions: ce.interventionsDone || "",
      caseHrPosition:   ce.hrPosition || "",
      caseNextFollowUp: ce.nextFollowUp || "",
      caseNotes:        ce.notes || "",
      notes:        typeof r.notes === "string" ? r.notes : "",
    });
    setEditingMeta(true);
  };

  const saveMeta = () => {
    const baseAnalysis = activeSession?.analysis || result || {};
    const caseTitle = (metaDraft.caseTitle || "").trim();
    const newCaseEntry = caseTitle ? {
      title: caseTitle,
      type:              metaDraft.caseType || "",
      riskLevel:         metaDraft.caseRiskLevel || "",
      situation:         metaDraft.caseSituation || "",
      interventionsDone: metaDraft.caseInterventions || "",
      hrPosition:        metaDraft.caseHrPosition || "",
      nextFollowUp:      metaDraft.caseNextFollowUp || "",
      notes:             metaDraft.caseNotes || "",
    } : null;
    const newAnalysis = {
      ...baseAnalysis,
      meetingTitle: metaDraft.meetingTitle || baseAnalysis.meetingTitle || "",
      director:     metaDraft.director !== undefined ? metaDraft.director : baseAnalysis.director,
      meetingDate:  metaDraft.savedAt || baseAnalysis.meetingDate || "",
      hrbpKeyMessage: metaDraft.hrbpKeyMessage || "",
      summary:      linesToArr(metaDraft.summaryText),
      people: {
        ...(baseAnalysis.people || {}),
        performance: linesToArr(metaDraft.peoplePerfText),
        leadership:  linesToArr(metaDraft.peopleLeadText),
        engagement:  linesToArr(metaDraft.peopleEnggText),
      },
      signals:    pipeLinesToObjs(metaDraft.signalsText,   SIGNAL_FIELDS),
      risks:      pipeLinesToObjs(metaDraft.risksText,     RISK_FIELDS),
      actions:    pipeLinesToObjs(metaDraft.actionsText,   ACTION_FIELDS),
      questions:  pipeLinesToObjs(metaDraft.questionsText, QUESTION_FIELDS),
      caseEntry:  newCaseEntry,
      notes:      metaDraft.notes || "",
    };
    if (view === "session" && activeSession) {
      const updated = {
        ...activeSession,
        meetingType: metaDraft.meetingType || activeSession.meetingType,
        scope:       metaDraft.scope       || activeSession.scope || "leader",
        director:    metaDraft.director !== undefined ? metaDraft.director : activeSession.director,
        savedAt:     metaDraft.savedAt || activeSession.savedAt,
        analysis:    newAnalysis,
      };
      onUpdateMeeting(updated);
      setActiveSession(updated);
      setResult(normalizeMeetingOutput(updated.analysis));
    } else {
      // result view: edit in-memory; the existing "Save" button persists.
      setResult(normalizeMeetingOutput(newAnalysis));
      if (metaDraft.savedAt) setMeetingDate(metaDraft.savedAt);
      if (metaDraft.director !== undefined) setDirName(metaDraft.director);
      if (metaDraft.meetingType) setMeetingType(metaDraft.meetingType);
      if (metaDraft.scope) setMeetingScope(metaDraft.scope);
    }
    setEditingMeta(false);
  };

  if ((view === "result" || view === "session") && result) return (
    <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <button onClick={() => { setView("list"); setResult(null); setTranscript(""); setContext(""); setEditingMeta(false); }}
          style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>{t("meetings.back")}</button>
        <div style={{ flex:1, fontSize:16, fontWeight:700, color:C.text }}>{result.meetingTitle}</div>
        <button onClick={() => editingMeta ? setEditingMeta(false) : openEditor()}
          style={{ ...css.btn(editingMeta ? C.amber : C.textM, true), padding:"6px 12px", fontSize:11 }}>
          {editingMeta ? t("meetings.editMeta.cancel") : t("meetings.editMeta")}
        </button>
        {view === "result" && <button onClick={saveResult} disabled={saved}
          style={{ ...css.btn(saved?C.textD:C.em), padding:"8px 16px", fontSize:12 }}>
          {saved ? t("meetings.saved") : t("meetings.save")}
        </button>}
      </div>

      {/* Inline meta + content editor (works in both result and session views) */}
      {editingMeta && (
        <div style={{ background:C.amber+"10", border:`1px solid ${C.amber}40`,
          borderRadius:10, padding:"14px 16px", marginBottom:14 }}>
          <Mono color={C.amber} size={9}>{t("meetings.editingMeta")}</Mono>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",
            gap:12, marginTop:12 }}>
            <div>
              <Mono color={C.textD} size={9}>{t("meetings.field.title")}</Mono>
              <input value={metaDraft.meetingTitle || ""}
                onChange={e => setMetaDraft(p => ({...p, meetingTitle: e.target.value}))}
                style={{ ...css.input, marginTop:5, fontSize:12 }}
                onFocus={e=>e.target.style.borderColor=C.amber+"60"}
                onBlur={e=>e.target.style.borderColor=C.border}/>
            </div>
            <div>
              <Mono color={C.textD} size={9}>{t("meetings.field.name")}</Mono>
              <input value={metaDraft.director || ""}
                onChange={e => setMetaDraft(p => ({...p, director: e.target.value}))}
                style={{ ...css.input, marginTop:5, fontSize:12 }}
                onFocus={e=>e.target.style.borderColor=C.amber+"60"}
                onBlur={e=>e.target.style.borderColor=C.border}/>
            </div>
            <div>
              <Mono color={C.textD} size={9}>{t("meetings.field.date")}</Mono>
              <input type="date" value={metaDraft.savedAt || ""}
                onChange={e => setMetaDraft(p => ({...p, savedAt: e.target.value}))}
                style={{ ...css.input, marginTop:5, fontSize:12 }}/>
            </div>
            <div>
              <Mono color={C.textD} size={9}>{t("meetings.field.type")}</Mono>
              <select value={metaDraft.meetingType || ""}
                onChange={e => setMetaDraft(p => ({...p, meetingType: e.target.value}))}
                style={{ ...css.input, marginTop:5, fontSize:12 }}>
                {MEETING_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <Mono color={C.textD} size={9}>{t("meetings.field.scope")}</Mono>
              <select value={metaDraft.scope || "leader"}
                onChange={e => setMetaDraft(p => ({...p, scope: e.target.value}))}
                style={{ ...css.input, marginTop:5, fontSize:12 }}>
                <option value="leader">{t("meetings.scope.leader")}</option>
                <option value="team">{t("meetings.scope.team")}</option>
                <option value="individual">{t("meetings.scope.individual")}</option>
                <option value="org">{t("meetings.scope.org")}</option>
              </select>
            </div>
          </div>
          {/* ── Section: Summary ── */}
          <div style={{ marginTop:18, paddingTop:12, borderTop:`1px solid ${C.amber}30` }}>
            <Mono color={C.amber} size={9}>{t("meetings.editSection.summary")}</Mono>
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:8 }}>
              <div>
                <Mono color={C.textD} size={9}>{t("meetings.field.hrbpKeyMessage")}</Mono>
                <textarea value={metaDraft.hrbpKeyMessage || ""}
                  onChange={e => setMetaDraft(p => ({...p, hrbpKeyMessage: e.target.value}))}
                  rows={2} style={{ ...css.textarea, marginTop:5, fontSize:12 }}/>
              </div>
              <div>
                <Mono color={C.textD} size={9}>{t("meetings.field.summary")}</Mono>
                <textarea value={metaDraft.summaryText || ""}
                  onChange={e => setMetaDraft(p => ({...p, summaryText: e.target.value}))}
                  rows={4} placeholder={t("meetings.field.summary.hint")}
                  style={{ ...css.textarea, marginTop:5, fontSize:12 }}/>
              </div>
            </div>
          </div>

          {/* ── Section: People ── */}
          <div style={{ marginTop:14, paddingTop:12, borderTop:`1px solid ${C.amber}30` }}>
            <Mono color={C.amber} size={9}>{t("meetings.editSection.people")}</Mono>
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:8 }}>
              <div>
                <Mono color={C.textD} size={9}>{t("meetings.field.people.performance")}</Mono>
                <textarea value={metaDraft.peoplePerfText || ""}
                  onChange={e => setMetaDraft(p => ({...p, peoplePerfText: e.target.value}))}
                  rows={3} placeholder={t("meetings.field.summary.hint")}
                  style={{ ...css.textarea, marginTop:5, fontSize:12 }}/>
              </div>
              <div>
                <Mono color={C.textD} size={9}>{t("meetings.field.people.leadership")}</Mono>
                <textarea value={metaDraft.peopleLeadText || ""}
                  onChange={e => setMetaDraft(p => ({...p, peopleLeadText: e.target.value}))}
                  rows={3} placeholder={t("meetings.field.summary.hint")}
                  style={{ ...css.textarea, marginTop:5, fontSize:12 }}/>
              </div>
              <div>
                <Mono color={C.textD} size={9}>{t("meetings.field.people.engagement")}</Mono>
                <textarea value={metaDraft.peopleEnggText || ""}
                  onChange={e => setMetaDraft(p => ({...p, peopleEnggText: e.target.value}))}
                  rows={3} placeholder={t("meetings.field.summary.hint")}
                  style={{ ...css.textarea, marginTop:5, fontSize:12 }}/>
              </div>
            </div>
          </div>

          {/* ── Section: Signals ── */}
          <div style={{ marginTop:14, paddingTop:12, borderTop:`1px solid ${C.amber}30` }}>
            <Mono color={C.amber} size={9}>{t("meetings.editSection.signals")}</Mono>
            <textarea value={metaDraft.signalsText || ""}
              onChange={e => setMetaDraft(p => ({...p, signalsText: e.target.value}))}
              rows={4} placeholder={t("meetings.field.signals.hint")}
              style={{ ...css.textarea, marginTop:8, fontSize:12 }}/>
          </div>

          {/* ── Section: Risks ── */}
          <div style={{ marginTop:14, paddingTop:12, borderTop:`1px solid ${C.amber}30` }}>
            <Mono color={C.amber} size={9}>{t("meetings.editSection.risks")}</Mono>
            <textarea value={metaDraft.risksText || ""}
              onChange={e => setMetaDraft(p => ({...p, risksText: e.target.value}))}
              rows={4} placeholder={t("meetings.field.risks.hint")}
              style={{ ...css.textarea, marginTop:8, fontSize:12 }}/>
          </div>

          {/* ── Section: Actions ── */}
          <div style={{ marginTop:14, paddingTop:12, borderTop:`1px solid ${C.amber}30` }}>
            <Mono color={C.amber} size={9}>{t("meetings.editSection.actions")}</Mono>
            <textarea value={metaDraft.actionsText || ""}
              onChange={e => setMetaDraft(p => ({...p, actionsText: e.target.value}))}
              rows={4} placeholder={t("meetings.field.actions.hint")}
              style={{ ...css.textarea, marginTop:8, fontSize:12 }}/>
          </div>

          {/* ── Section: Questions ── */}
          <div style={{ marginTop:14, paddingTop:12, borderTop:`1px solid ${C.amber}30` }}>
            <Mono color={C.amber} size={9}>{t("meetings.editSection.questions")}</Mono>
            <textarea value={metaDraft.questionsText || ""}
              onChange={e => setMetaDraft(p => ({...p, questionsText: e.target.value}))}
              rows={4} placeholder={t("meetings.field.questions.hint")}
              style={{ ...css.textarea, marginTop:8, fontSize:12 }}/>
          </div>

          {/* ── Section: Case Log ── */}
          <div style={{ marginTop:14, paddingTop:12, borderTop:`1px solid ${C.amber}30` }}>
            <Mono color={C.amber} size={9}>{t("meetings.editSection.caseLog")}</Mono>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:10, marginTop:8 }}>
              <div>
                <Mono color={C.textD} size={9}>{t("meetings.field.case.title")}</Mono>
                <input value={metaDraft.caseTitle || ""}
                  onChange={e => setMetaDraft(p => ({...p, caseTitle: e.target.value}))}
                  style={{ ...css.input, marginTop:5, fontSize:12 }}/>
              </div>
              <div>
                <Mono color={C.textD} size={9}>{t("meetings.field.case.type")}</Mono>
                <input value={metaDraft.caseType || ""}
                  onChange={e => setMetaDraft(p => ({...p, caseType: e.target.value}))}
                  style={{ ...css.input, marginTop:5, fontSize:12 }}/>
              </div>
              <div>
                <Mono color={C.textD} size={9}>{t("meetings.field.case.riskLevel")}</Mono>
                <input value={metaDraft.caseRiskLevel || ""}
                  onChange={e => setMetaDraft(p => ({...p, caseRiskLevel: e.target.value}))}
                  style={{ ...css.input, marginTop:5, fontSize:12 }}/>
              </div>
              <div>
                <Mono color={C.textD} size={9}>{t("meetings.field.case.nextFollowUp")}</Mono>
                <input value={metaDraft.caseNextFollowUp || ""}
                  onChange={e => setMetaDraft(p => ({...p, caseNextFollowUp: e.target.value}))}
                  style={{ ...css.input, marginTop:5, fontSize:12 }}/>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:10 }}>
              <div>
                <Mono color={C.textD} size={9}>{t("meetings.field.case.situation")}</Mono>
                <textarea value={metaDraft.caseSituation || ""}
                  onChange={e => setMetaDraft(p => ({...p, caseSituation: e.target.value}))}
                  rows={2} style={{ ...css.textarea, marginTop:5, fontSize:12 }}/>
              </div>
              <div>
                <Mono color={C.textD} size={9}>{t("meetings.field.case.interventions")}</Mono>
                <textarea value={metaDraft.caseInterventions || ""}
                  onChange={e => setMetaDraft(p => ({...p, caseInterventions: e.target.value}))}
                  rows={2} style={{ ...css.textarea, marginTop:5, fontSize:12 }}/>
              </div>
              <div>
                <Mono color={C.textD} size={9}>{t("meetings.field.case.hrPosition")}</Mono>
                <textarea value={metaDraft.caseHrPosition || ""}
                  onChange={e => setMetaDraft(p => ({...p, caseHrPosition: e.target.value}))}
                  rows={2} style={{ ...css.textarea, marginTop:5, fontSize:12 }}/>
              </div>
              <div>
                <Mono color={C.textD} size={9}>{t("meetings.field.case.notes")}</Mono>
                <textarea value={metaDraft.caseNotes || ""}
                  onChange={e => setMetaDraft(p => ({...p, caseNotes: e.target.value}))}
                  rows={2} style={{ ...css.textarea, marginTop:5, fontSize:12 }}/>
              </div>
            </div>
          </div>

          {/* ── Section: Notes (HRBP) ── */}
          <div style={{ marginTop:14, paddingTop:12, borderTop:`1px solid ${C.amber}30` }}>
            <Mono color={C.amber} size={9}>{t("meetings.editSection.notes")}</Mono>
            <textarea value={metaDraft.notes || ""}
              onChange={e => setMetaDraft(p => ({...p, notes: e.target.value}))}
              rows={3} style={{ ...css.textarea, marginTop:8, fontSize:12 }}/>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:14, justifyContent:"flex-end" }}>
            <button onClick={() => setEditingMeta(false)}
              style={{ ...css.btn(C.textM, true), padding:"8px 16px", fontSize:12 }}>
              {t("meetings.editMeta.cancel")}
            </button>
            <button onClick={saveMeta}
              style={{ ...css.btn(C.amber), padding:"8px 18px", fontSize:12 }}>
              {t("meetings.save")}
            </button>
          </div>
        </div>
      )}

      {/* Risk + meta bar */}
      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
        <RiskBadge level={result.overallRisk} />
        {result.director && <Badge label={result.director} color={C.blue} />}
        {result.director && (
          <button onClick={() => { sessionStorage.setItem("hrbpos:pendingLeader", result.director.trim()); onNavigate("leaders"); }}
            style={{ display:"flex", alignItems:"center", gap:4,
              background:C.purple+"18", border:`1px solid ${C.purple}44`, borderRadius:5,
              padding:"3px 9px", fontSize:10, color:C.purple, cursor:"pointer",
              fontFamily:"'DM Sans',sans-serif", fontWeight:600 }}>
            👤 Fiche
          </button>
        )}
        {result.meetingDate && <Badge label={result.meetingDate} color={C.textD} />}
        <ProvinceBadge province={getProvince(activeSession, data.profile)}/>
        {result.overallRiskRationale && (
          <span style={{ fontSize:11, color:C.textM, fontStyle:"italic" }}>{result.overallRiskRationale}</span>
        )}
      </div>

      {/* Tab nav */}
      <div style={{ display:"flex", gap:4, marginBottom:16, flexWrap:"wrap" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 14px",
              borderRadius:7, fontSize:12, cursor:"pointer",
              fontFamily:"'DM Sans',sans-serif",
              background: tab===t.id ? C.em+"22" : "none",
              border:`1px solid ${tab===t.id ? C.em+"66" : C.border}`,
              color: tab===t.id ? C.em : C.textM,
              fontWeight: tab===t.id ? 600 : 400 }}>
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {t.badge != null && (
              <span style={{ background:C.em+"33", color:C.em, borderRadius:10,
                padding:"1px 6px", fontSize:9, fontWeight:700 }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── INITIATIVES TABS ── */}
      {isInitMeeting && tab==="summary" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <Card style={{ borderLeft:`3px solid ${C.em}` }}>
            <SecHead icon="📋" label={t("meetings.section.summaryPortfolio")} color={C.em}/>
            <BulletList items={result.summary} color={C.em}/>
          </Card>
          {result.metriques && (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
              {[
                {label:t("meetings.metric.total"),     val:result.metriques.total,     color:C.blue},
                {label:t("meetings.metric.inProgress"),  val:result.metriques.enCours,   color:C.em},
                {label:t("meetings.metric.blocked"),  val:result.metriques.bloquees,  color:C.red},
                {label:t("meetings.metric.completed"),val:result.metriques.completees,color:C.teal},
                {label:t("meetings.metric.atRisk"),  val:result.metriques.aRisque,   color:C.amber},
              ].map((m,i) => (
                <div key={i} style={{ background:m.color+"12", border:`1px solid ${m.color}30`,
                  borderRadius:9, padding:"12px 14px", textAlign:"center" }}>
                  <div style={{ fontSize:22, fontWeight:800, color:m.color }}>{m.val ?? "—"}</div>
                  <div style={{ fontSize:9, color:C.textD, marginTop:4, fontFamily:"'DM Mono',monospace", letterSpacing:0.5 }}>{m.label.toUpperCase()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isInitMeeting && tab==="initiatives" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(!result.initiatives || result.initiatives.length === 0) && (
            <Card><div style={{ color:C.textD, fontSize:13 }}>{t("meetings.empty.initiatives")}</div></Card>
          )}
          {(result.initiatives||[]).map((p, i) => {
            const AVANC_STEPS = ["0-25%","25-50%","50-75%","75-100%","Complète"];
            const STATUT_C = {
              "En cours":C.em,"Planifiée":C.blue,"En attente":C.amber,
              "Bloquée":C.red,"Completée":C.teal,"Complétée":C.teal,"Annulée":C.textD,
            };
            const statutColor = STATUT_C[p.statut] || C.blue;
            const avancIdx = AVANC_STEPS.indexOf(p.avancement);
            const isBlocked = p.statut === "Bloquée";
            const riskBorder = (p.risque==="Eleve"||p.risque==="Élevé") ? C.red : (p.risque==="Modere"||p.risque==="Modéré") ? C.amber : C.border;
            return (
              <Card key={i} style={{ borderLeft:`3px solid ${statutColor}` }}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:10, gap:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>{p.nom}</div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {p.categorie && <Badge label={p.categorie} color={C.blue} size={10}/>}
                      {p.responsable && <Badge label={p.responsable} color={C.purple} size={10}/>}
                    </div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:5, alignItems:"flex-end", flexShrink:0 }}>
                    <div style={{ background:statutColor+"22", border:`1px solid ${statutColor}55`, borderRadius:6, padding:"4px 10px", fontSize:11, color:statutColor, fontWeight:700 }}>{p.statut}</div>
                    {p.risque && <Badge label={`⚠ ${p.risque}`} color={riskBorder} size={10}/>}
                  </div>
                </div>

                {/* Progress bar */}
                {!isBlocked && avancIdx >= 0 && (
                  <div style={{ display:"flex", gap:3, marginBottom:10 }}>
                    {AVANC_STEPS.slice(0,4).map((e,j) => (
                      <div key={j} style={{ flex:1, height:4, borderRadius:2,
                        background: j <= avancIdx ? statutColor : C.surfLL }}/>
                    ))}
                  </div>
                )}
                {isBlocked && (
                  <div style={{ height:4, borderRadius:2, background:C.red+"40", marginBottom:10,
                    backgroundImage:`repeating-linear-gradient(45deg,${C.red}40 0,${C.red}40 4px,transparent 4px,transparent 8px)` }}/>
                )}

                <div style={{ fontSize:12, color:C.textM, lineHeight:1.6, marginBottom:p.changementSemaine||p.risqueDetail||p.blocages?.length ? 10 : 0 }}>
                  {p.statutDetail}
                </div>

                {p.changementSemaine && (
                  <div style={{ display:"flex", gap:8, padding:"7px 10px", background:C.em+"10", borderRadius:7, marginBottom:8 }}>
                    <span style={{ color:C.em, fontSize:11, flexShrink:0 }}>↺</span>
                    <span style={{ fontSize:11, color:C.em }}><strong>Cette semaine :</strong> {p.changementSemaine}</span>
                  </div>
                )}

                {p.blocages?.length > 0 && (
                  <div style={{ marginBottom:8 }}>
                    {p.blocages.map((b,bi) => (
                      <div key={bi} style={{ display:"flex", gap:8, padding:"6px 10px", background:C.red+"10", border:`1px solid ${C.red}25`, borderRadius:7, marginBottom:4 }}>
                        <span style={{ color:C.red, fontSize:11, flexShrink:0 }}>🚧</span>
                        <span style={{ fontSize:11, color:C.textM }}>{b}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                  {p.dateCible && <Mono color={C.textD} size={9}>Cible: {p.dateCible}</Mono>}
                  {p.dateDebut && <Mono color={C.textD} size={9}>Début: {p.dateDebut}</Mono>}
                  {p.avancement && <Mono color={statutColor} size={9}>{p.avancement}</Mono>}
                </div>

                {p.prochainePriorite && (
                  <div style={{ marginTop:10, padding:"6px 10px", background:C.surfLL, borderRadius:7, display:"flex", gap:8 }}>
                    <span style={{ fontSize:10, color:C.em, flexShrink:0 }}>→</span>
                    <span style={{ fontSize:12, color:C.textM }}>{p.prochainePriorite}</span>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {isInitMeeting && tab==="blocages" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(!result.blocagesGlobaux || result.blocagesGlobaux.length === 0) && (
            <Card><div style={{ color:C.textD, fontSize:13 }}>{t("meetings.empty.blocagesGlobaux")}</div></Card>
          )}
          {(result.blocagesGlobaux||[]).map((b,i) => (
            <Card key={i} style={{ borderLeft:`3px solid ${C.red}` }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{b.blocage}</div>
                <Badge label={b.owner} color={C.blue} size={10}/>
              </div>
              {b.initiativesConcernees?.length > 0 && (
                <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:8 }}>
                  {b.initiativesConcernees.map((n,j) => <Badge key={j} label={n} color={C.purple} size={9}/>)}
                </div>
              )}
              {b.actionRequise && <div style={{ fontSize:12, color:C.em }}>→ {b.actionRequise}</div>}
            </Card>
          ))}
        </div>
      )}

      {isInitMeeting && tab==="decisions" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(!result.decisions || result.decisions.length === 0) && (
            <Card><div style={{ color:C.textD, fontSize:13 }}>{t("meetings.empty.decisions")}</div></Card>
          )}
          {(result.decisions||[]).map((d,i) => (
            <Card key={i} style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
              <span style={{ color:C.em, fontSize:16, flexShrink:0 }}>✓</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, color:C.text, lineHeight:1.65, marginBottom:4 }}>{d.decision}</div>
                <div style={{ display:"flex", gap:8 }}>
                  {d.initiative && <Mono color={C.purple} size={9}>INITIATIVE · {d.initiative}</Mono>}
                  {d.echeance && <Mono color={C.amber} size={9}>ÉCHÉANCE · {d.echeance}</Mono>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {isInitMeeting && tab==="actions" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(result.actions||[]).map((a,i) => {
            const dc = DELAY_C[a.delay] || C.blue;
            return (
              <Card key={i} style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                <Badge label={a.delay} color={dc} size={10}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, color:C.text, lineHeight:1.65, marginBottom:4 }}>{a.action}</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <Mono color={C.textD} size={9}>OWNER · {a.owner}</Mono>
                    {a.initiative && <Mono color={C.purple} size={9}>INITIATIVE · {a.initiative}</Mono>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {isInitMeeting && tab==="questions" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(result.questions||[]).map((q,i) => (
            <Card key={i}>
              <div style={{ fontSize:13, color:C.text, lineHeight:1.7, marginBottom:8, fontStyle:"italic" }}>"{q.question}"</div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <div style={{ fontSize:12, color:C.textM }}><span style={{ color:C.em }}>💡 </span>{q.why}</div>
                {q.initiative && <Badge label={q.initiative} color={C.purple} size={9}/>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── DISCIPLINAIRE TABS ── */}

      {isDiscMeeting && tab==="summary" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <Card style={{ borderLeft:`3px solid ${C.red}` }}>
            <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:12 }}>
              {result.typeRencontre && <div style={{ background:C.red+"22", border:`1px solid ${C.red}55`, borderRadius:6, padding:"4px 12px", fontSize:12, color:C.red, fontWeight:700 }}>{result.typeRencontre}</div>}
              <RiskBadge level={result.overallRisk}/>
            </div>
            <SecHead icon="📋" label={t("meetings.section.summary")} color={C.blue}/>
            <BulletList items={result.summary} color={C.blue}/>
            {result.overallRiskRationale && <div style={{ marginTop:10, fontSize:12, color:C.textM }}><span style={{ color:C.red }}>Risque → </span>{result.overallRiskRationale}</div>}
          </Card>
          {result.pointsVigilance?.length > 0 && (
            <Card style={{ borderLeft:`3px solid ${C.amber}` }}>
              <SecHead icon="👁" label={t("meetings.section.points")} color={C.amber}/>
              <BulletList items={result.pointsVigilance} color={C.amber}/>
            </Card>
          )}
          {result.prochaineSanction && (
            <Card style={{ background:C.red+"08" }}>
              <Mono color={C.red} size={9}>{t("meetings.section.nextSanction")}</Mono>
              <div style={{ fontSize:13, color:C.text, marginTop:8, lineHeight:1.65 }}>{result.prochaineSanction}</div>
            </Card>
          )}
          {result.notes && (
            <Card>
              <Mono color={C.textD} size={9}>{t("meetings.section.notesHrbp")}</Mono>
              <div style={{ fontSize:13, color:C.textM, marginTop:8, fontStyle:"italic", lineHeight:1.65 }}>{result.notes}</div>
            </Card>
          )}
        </div>
      )}

      {isDiscMeeting && tab==="faits" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {[
            {key:"reproches",       label:t("meetings.section.facts.reproches"),  color:C.red,    icon:"🔴"},
            {key:"positionEE",      label:t("meetings.section.facts.position"), color:C.blue,   icon:"💬"},
            {key:"reconnaissances", label:t("meetings.section.facts.recognized"),        color:C.em,     icon:"✓"},
            {key:"contestations",   label:t("meetings.section.facts.contested"),       color:C.amber,  icon:"⚠"},
          ].map(({key,label,color,icon}) => result.faits?.[key]?.length > 0 && (
            <Card key={key} style={{ borderLeft:`3px solid ${color}` }}>
              <SecHead icon={icon} label={label} color={color}/>
              <BulletList items={result.faits[key]} color={color}/>
            </Card>
          ))}
        </div>
      )}

      {isDiscMeeting && tab==="juridique" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <Card>
            <SecHead icon="📜" label={t("meetings.section.policies")} color={C.blue}/>
            <BulletList items={result.cadreJuridique?.politiquesVisees} color={C.blue}/>
          </Card>
          <Card>
            <SecHead icon="⚖" label={t("meetings.section.laws")} color={C.purple}/>
            <BulletList items={result.cadreJuridique?.loisApplicables} color={C.purple}/>
          </Card>
          {result.cadreJuridique?.progressiviteSanction && (
            <Card style={{ borderLeft:`3px solid ${result.cadreJuridique.progressiviteSanction === "respectee" ? C.em : C.amber}` }}>
              <Mono color={C.textD} size={9}>{t("meetings.section.progressivity")}</Mono>
              <div style={{ marginTop:8, display:"flex", gap:8, alignItems:"center" }}>
                <div style={{ background:(result.cadreJuridique.progressiviteSanction === "respectee" ? C.em : C.amber)+"22", border:`1px solid ${(result.cadreJuridique.progressiviteSanction === "respectee" ? C.em : C.amber)}55`, borderRadius:6, padding:"3px 10px", fontSize:11, color:(result.cadreJuridique.progressiviteSanction === "respectee" ? C.em : C.amber), fontWeight:700, textTransform:"uppercase" }}>
                  {result.cadreJuridique.progressiviteSanction}
                </div>
              </div>
              {result.cadreJuridique.progressiviteNote && <div style={{ fontSize:12, color:C.textM, marginTop:8 }}>{result.cadreJuridique.progressiviteNote}</div>}
            </Card>
          )}
          {result.risquesLegaux?.length > 0 && (
            <Card style={{ borderLeft:`3px solid ${C.red}` }}>
              <SecHead icon="🚨" label={t("meetings.section.legalRisks")} color={C.red}/>
              {result.risquesLegaux.map((r,i) => (
                <div key={i} style={{ marginBottom:10, paddingBottom:8, borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ display:"flex", gap:8, marginBottom:6 }}><RiskBadge level={r.niveau}/></div>
                  <div style={{ fontSize:13, color:C.text, marginBottom:4 }}>{r.risque}</div>
                  {r.mitigation && <div style={{ fontSize:12, color:C.em }}>→ {r.mitigation}</div>}
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {isDiscMeeting && tab==="sanction" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {result.sanctionImposee?.type ? (
            <Card style={{ borderLeft:`3px solid ${C.red}` }}>
              <SecHead icon="🔴" label={t("meetings.section.sanctionImposed")} color={C.red}/>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:12 }}>
                <div style={{ background:C.red+"18", border:`1px solid ${C.red}40`, borderRadius:7, padding:"6px 14px", fontSize:13, color:C.red, fontWeight:700 }}>{result.sanctionImposee.type}</div>
                {result.sanctionImposee.duree && <Badge label={result.sanctionImposee.duree} color={C.amber}/>}
                {result.sanctionImposee.periodeSuivi && <Badge label={`Suivi : ${result.sanctionImposee.periodeSuivi}`} color={C.purple}/>}
              </div>
              {result.sanctionImposee.conditionsRetour?.length > 0 && (
                <div>
                  <Mono color={C.textD} size={9}>{t("meetings.section.conditions")}</Mono>
                  <BulletList items={result.sanctionImposee.conditionsRetour} color={C.amber}/>
                </div>
              )}
            </Card>
          ) : (
            <Card><div style={{ color:C.textD, fontSize:13 }}>{t("meetings.section.noSanction")}</div></Card>
          )}
        </div>
      )}

      {isDiscMeeting && tab==="actions" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {result.documentationRequise?.length > 0 && (
            <Card style={{ borderLeft:`3px solid ${C.blue}` }}>
              <SecHead icon="📄" label={t("meetings.section.docsNeeded")} color={C.blue}/>
              {result.documentationRequise.map((d,i) => (
                <div key={i} style={{ display:"flex", gap:12, marginBottom:8, paddingBottom:8, borderBottom:`1px solid ${C.border}` }}>
                  <Badge label={d.delai} color={C.amber} size={10}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, color:C.text }}>{d.document}</div>
                    <Mono color={C.textD} size={9}>RESPONSABLE · {d.responsable}</Mono>
                  </div>
                </div>
              ))}
            </Card>
          )}
          {result.actions?.length > 0 && (
            <Card>
              <SecHead icon="✅" label={t("meetings.section.actions")} color={C.em}/>
              {result.actions.map((a,i) => {
                const dc = DELAY_C[a.delay] || C.blue;
                return (
                  <div key={i} style={{ display:"flex", gap:12, marginBottom:8 }}>
                    <Badge label={a.delay} color={dc} size={10}/>
                    <div>
                      <div style={{ fontSize:13, color:C.text }}>{a.action}</div>
                      <Mono color={C.textD} size={9}>OWNER · {a.owner}</Mono>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      )}

      {/* ── TA-SPECIFIC TABS ── */}
      {isTAMeeting && tab==="summary" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <Card><SecHead icon="📋" label={t("meetings.section.summaryPipeline")} color={C.blue}/><BulletList items={result.summary} color={C.blue}/></Card>
          {result.metriques && (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
              {[
                {label:t("meetings.metric.activePos"),    val:result.metriques.postesActifs,   color:C.em},
                {label:t("meetings.metric.inOffer"),         val:result.metriques.enOffre,        color:C.amber},
                {label:t("meetings.metric.closed"), val:result.metriques.fermes,         color:C.teal},
                {label:t("meetings.metric.avgDays"),      val:result.metriques.joursOuvertureMoyen ? result.metriques.joursOuvertureMoyen+"j" : "N/D", color:C.blue},
              ].map((m,i) => (
                <div key={i} style={{ background:m.color+"12", border:`1px solid ${m.color}30`, borderRadius:9, padding:"12px 14px", textAlign:"center" }}>
                  <div style={{ fontSize:22, fontWeight:800, color:m.color }}>{m.val ?? "—"}</div>
                  <div style={{ fontSize:10, color:C.textD, marginTop:4, fontFamily:"'DM Mono',monospace", letterSpacing:0.5 }}>{m.label.toUpperCase()}</div>
                </div>
              ))}
            </div>
          )}
          {result.metriques?.risquesPipeline?.length > 0 && (
            <Card style={{ borderLeft:`3px solid ${C.red}` }}>
              <SecHead icon="⚠" label={t("meetings.section.pipelineRisks")} color={C.red}/>
              <BulletList items={result.metriques.risquesPipeline} color={C.red}/>
            </Card>
          )}
        </div>
      )}

      {isTAMeeting && tab==="postes" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(!result.postes || result.postes.length === 0) && (
            <Card><div style={{ color:C.textD, fontSize:13 }}>{t("meetings.empty.postes")}</div></Card>
          )}
          {(result.postes||[]).map((p, i) => {
            const ETAPE_C = {
              "Sourcing":C.textD,"Entrevues RH":C.blue,"Entrevues techniques":C.purple,
              "Debrief":C.amber,"Offre":C.teal,"Acceptee":C.em,"Acceptée":C.em,
              "En attente":C.amber,"Fermee":C.textD,"Fermée":C.textD,"Annulee":C.textD,"Annulée":C.textD,
            };
            const ETAPE_STEPS = ["Sourcing","Entrevues RH","Entrevues techniques","Debrief","Offre","Acceptée"];
            const etapeColor = ETAPE_C[p.etape] || C.blue;
            const riskBorder = (p.risque==="Eleve"||p.risque==="Élevé") ? C.red : (p.risque==="Modere"||p.risque==="Modéré") ? C.amber : C.border;
            const currentStep = ETAPE_STEPS.indexOf(p.etape) >= 0 ? ETAPE_STEPS.indexOf(p.etape) : -1;
            const isClosed = ["Fermee","Fermée","Annulee","Annulée"].includes(p.etape);
            return (
              <Card key={i} style={{ borderLeft:`3px solid ${etapeColor}` }}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:10, gap:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>{p.titre}</div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {p.equipe && <Badge label={p.equipe} color={C.blue} size={10}/>}
                      {p.responsable && <Badge label={p.responsable} color={C.purple} size={10}/>}
                      {p.candidats && <Badge label={`${p.candidats} candidat(s)`} color={C.textD} size={10}/>}
                    </div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:5, alignItems:"flex-end", flexShrink:0 }}>
                    <div style={{ background:etapeColor+"22", border:`1px solid ${etapeColor}55`, borderRadius:6, padding:"4px 10px", fontSize:11, color:etapeColor, fontWeight:700 }}>{p.etape}</div>
                    {p.priorite && <Badge label={"⚑ "+p.priorite} color={p.priorite==="Critique"?C.red:(p.priorite==="Elevee"||p.priorite==="Élevée")?C.amber:C.textD} size={10}/>}
                  </div>
                </div>
                {!isClosed && (
                  <div style={{ display:"flex", gap:3, marginBottom:10 }}>
                    {ETAPE_STEPS.map((e,j) => (
                      <div key={j} style={{ flex:1, height:4, borderRadius:2,
                        background: j < currentStep ? etapeColor+"55" : j === currentStep ? etapeColor : C.surfLL }}/>
                    ))}
                  </div>
                )}
                <div style={{ fontSize:12, color:C.textM, lineHeight:1.6, marginBottom:(p.changementSemaine||p.risqueDetail)?10:0 }}>
                  {p.statutDetail}
                </div>
                {p.changementSemaine && (
                  <div style={{ display:"flex", gap:8, padding:"7px 10px", background:C.em+"10", borderRadius:7, marginBottom:8 }}>
                    <span style={{ color:C.em, fontSize:11, flexShrink:0 }}>↺</span>
                    <span style={{ fontSize:11, color:C.em }}><strong>Cette semaine :</strong> {p.changementSemaine}</span>
                  </div>
                )}
                {p.risqueDetail && (
                  <div style={{ display:"flex", gap:8, padding:"7px 10px", background:riskBorder+"10", border:`1px solid ${riskBorder}25`, borderRadius:7, marginBottom:8 }}>
                    <span style={{ color:riskBorder, fontSize:11, flexShrink:0 }}>⚠</span>
                    <span style={{ fontSize:11, color:C.textM }}>{p.risqueDetail}</span>
                  </div>
                )}
                <div style={{ display:"flex", gap:12, marginTop:4, flexWrap:"wrap" }}>
                  {p.dateCible && <Mono color={C.textD} size={9}>Cible: {p.dateCible}</Mono>}
                  {p.dateOuverture && <Mono color={C.textD} size={9}>Ouvert: {p.dateOuverture}</Mono>}
                </div>
                {p.prochainePriorite && (
                  <div style={{ marginTop:10, padding:"6px 10px", background:C.surfLL, borderRadius:7, display:"flex", gap:8 }}>
                    <span style={{ fontSize:10, color:C.em, flexShrink:0 }}>→</span>
                    <span style={{ fontSize:12, color:C.textM }}>{p.prochainePriorite}</span>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {isTAMeeting && tab==="blocages" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(!result.blocages || result.blocages.length === 0) && (
            <Card><div style={{ color:C.textD, fontSize:13 }}>{t("meetings.empty.blocages")}</div></Card>
          )}
          {(result.blocages||[]).map((b,i) => (
            <Card key={i} style={{ borderLeft:`3px solid ${C.red}` }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{b.blocage}</div>
                <Badge label={b.owner} color={C.blue} size={10}/>
              </div>
              {b.postesConcernes?.length > 0 && (
                <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:8 }}>
                  {b.postesConcernes.map((pc,j) => <Badge key={j} label={pc} color={C.purple} size={9}/>)}
                </div>
              )}
              {b.actionRequise && <div style={{ fontSize:12, color:C.em }}>→ {b.actionRequise}</div>}
            </Card>
          ))}
        </div>
      )}

      {isTAMeeting && tab==="actions" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(result.actions||[]).map((a,i) => {
            const dc = DELAY_C[a.delay] || C.blue;
            return (
              <Card key={i} style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                <Badge label={a.delay} color={dc} size={10}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, color:C.text, lineHeight:1.65, marginBottom:4 }}>{a.action}</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <Mono color={C.textD} size={9}>OWNER · {a.owner}</Mono>
                    {a.poste && <Mono color={C.purple} size={9}>POSTE · {a.poste}</Mono>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {isTAMeeting && tab==="questions" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(result.questions||[]).map((q,i) => (
            <Card key={i}>
              <div style={{ fontSize:13, color:C.text, lineHeight:1.7, marginBottom:8, fontStyle:"italic" }}>"{q.question}"</div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <div style={{ fontSize:12, color:C.textM }}><span style={{ color:C.em }}>💡 </span>{q.why}</div>
                {q.poste && <Badge label={q.poste} color={C.purple} size={9}/>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── STANDARD TABS (non-TA) ── */}
      {!isTAMeeting && !isDiscMeeting && !isInitMeeting && tab==="summary" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {(result.hrbpKeyMessage || result.overallRiskRationale) && (
            <Card style={{ borderLeft:`3px solid ${C.em}` }}>
              {result.hrbpKeyMessage && <>
                <Mono color={C.em} size={9}>{t("meetings.section.keyMessage")}</Mono>
                <div style={{ fontSize:14, color:C.text, fontWeight:600, marginTop:8, lineHeight:1.6 }}>{result.hrbpKeyMessage}</div>
              </>}
              {result.overallRiskRationale && (
                <div style={{ fontSize:12, color:C.textM, marginTop: result.hrbpKeyMessage ? 8 : 0 }}>
                  <span style={{ color:(RISK[result.overallRisk]||RISK["Modéré"]).color }}>Risque → </span>{result.overallRiskRationale}
                </div>
              )}
            </Card>
          )}
          <Card><SecHead icon="📋" label={t("meetings.section.summaryExec")} color={C.blue}/><BulletList items={result.summary} color={C.blue}/></Card>
        </div>
      )}
      {!isTAMeeting && !isDiscMeeting && !isInitMeeting && tab==="people" && (() => {
        const people = result?.people || {};
        const perf = people.performance || [];
        const lead = people.leadership || [];
        const engg = people.engagement || [];
        if (!perf.length && !lead.length && !engg.length) {
          return <Card><div style={{ fontSize:13, color:C.textM, textAlign:"center", padding:"16px 8px" }}>{t("meetings.empty.people")}</div></Card>;
        }
        return <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <Card><SecHead icon="📈" label={t("meetings.section.performance")} color={C.amber}/><BulletList items={perf} color={C.amber}/></Card>
          <Card><SecHead icon="🎙️" label={t("meetings.section.leadership")} color={C.purple}/><BulletList items={lead} color={C.purple}/></Card>
          <Card><SecHead icon="💡" label={t("meetings.section.engagement")} color={C.em}/><BulletList items={engg} color={C.em}/></Card>
        </div>;
      })()}
      {!isTAMeeting && !isDiscMeeting && !isInitMeeting && tab==="signals" && <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {result.signals?.map((s,i) => {
          const BREADTH_C = {"Isolé":C.teal,"Isole":C.teal,"Récurrent":C.amber,"Recurrent":C.amber,"Systémique":C.red,"Systemique":C.red};
          const bc = BREADTH_C[s.breadth] || C.textD;
          return <Card key={i}>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
              <Badge label={s.category} color={C.purple} size={10}/>
              {s.breadth && <Badge label={s.breadth} color={bc} size={10}/>}
            </div>
            <div style={{ fontSize:13, color:C.text, lineHeight:1.65, marginBottom:6 }}>{s.signal}</div>
            <div style={{ fontSize:12, color:C.textM, marginBottom:s.ifUnaddressed?6:0 }}><span style={{ color:C.em }}>→ </span>{s.interpretation}</div>
            {s.ifUnaddressed && <div style={{ fontSize:11, color:C.textD, fontStyle:"italic", padding:"5px 10px", background:C.surfLL, borderRadius:6 }}>⚠ Si non adressé : {s.ifUnaddressed}</div>}
          </Card>;
        })}
      </div>}
      {!isTAMeeting && !isDiscMeeting && !isInitMeeting && tab==="risks" && <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {result.risks?.map((r,i) => {
          const rm = RISK[r.level]||RISK["Modéré"];
          const TREND_C = {"Nouveau":C.blue,"Persistant":C.amber,"Aggravé":C.red,"Aggrave":C.red,"En amélioration":C.teal,"En amelioration":C.teal};
          const tc = TREND_C[r.trend] || C.textD;
          return <Card key={i} style={{ borderLeft:`3px solid ${rm.color}` }}>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
              <RiskBadge level={r.level}/>
              {r.trend && <Badge label={r.trend} color={tc} size={10}/>}
            </div>
            <div style={{ fontSize:13, color:C.text, fontWeight:500, marginBottom:6 }}>{r.risk}</div>
            <div style={{ fontSize:12, color:C.textM }}><span style={{ color:rm.color }}>→ </span>{r.rationale}</div>
          </Card>;
        })}
      </div>}
      {!isTAMeeting && !isDiscMeeting && !isInitMeeting && tab==="actions" && <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {result.actions?.map((a,i) => {
          const dc = DELAY_C[a.delay]||C.blue;
          const IMPACT_C = {"Élevé":C.red,"Eleve":C.red,"Modéré":C.amber,"Modere":C.amber,"Faible":C.teal};
          const ic = a.impact ? (IMPACT_C[a.impact]||C.textD) : null;
          return <Card key={i} style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
            <div style={{ display:"flex", flexDirection:"column", gap:4, flexShrink:0 }}>
              <Badge label={a.delay} color={dc} size={10}/>
              {ic && <Badge label={a.impact} color={ic} size={9}/>}
            </div>
            <div>
              <div style={{ fontSize:13, color:C.text, lineHeight:1.65, marginBottom:4 }}>{a.action}</div>
              <Mono color={C.textD} size={9}>OWNER · {a.owner}</Mono>
            </div>
          </Card>;
        })}
      </div>}
      {!isTAMeeting && !isDiscMeeting && !isInitMeeting && tab==="questions" && (() => {
        const hasCross = result.crossQuestions?.length > 0;
        return <div>
          {hasCross && <div style={{ display:"flex", gap:6, marginBottom:12 }}>
            {[["meeting",t("meetings.q.thisMeeting"),""],
              ["cross",t("meetings.q.cross"),""]
            ].map(([id,label,hint]) => (
              <button key={id} onClick={()=>setQsub(id)} style={{
                padding:"7px 14px", borderRadius:7, fontSize:12, cursor:"pointer", fontFamily:"inherit",
                background: qsub===id ? C.purple+"22" : "none",
                border:`1px solid ${qsub===id ? C.purple+"66" : C.border}`,
                color: qsub===id ? C.purple : C.textM, fontWeight: qsub===id ? 600 : 400,
              }}>
                {label}
                {id==="cross" && hasCross && <span style={{ marginLeft:6, background:C.purple+"33",
                  color:C.purple, borderRadius:10, padding:"1px 6px", fontSize:10 }}>
                  {result.crossQuestions.reduce((n,p)=>n+(p.questions?.length||0),0)}
                </span>}
              </button>
            ))}
          </div>}

          {(!hasCross || qsub==="meeting") && <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {result.questions?.map((q,i) => <Card key={i}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                <Badge label={`→ ${q.target}`} color={C.purple} size={10}/>
              </div>
              <div style={{ fontSize:13, color:C.text, lineHeight:1.7, marginBottom:8, fontStyle:"italic" }}>"{q.question}"</div>
              <div style={{ fontSize:12, color:C.textM }}><span style={{ color:C.em }}>💡 </span>{q.why}</div>
            </Card>)}
          </div>}

          {qsub==="cross" && hasCross && <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {result.crossQuestions.map((person, pi) => (
              <Card key={pi} style={{ borderLeft:`3px solid ${C.purple}` }}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{person.person}</div>
                    <div style={{ fontSize:11, color:C.purple, marginTop:2 }}>{person.role}</div>
                  </div>
                  <Badge label={person.relationship} color={C.blue} size={9}/>
                </div>
                <div style={{ fontSize:11, color:C.textM, background:C.surfLL, borderRadius:6,
                  padding:"7px 10px", marginBottom:10, lineHeight:1.6 }}>
                  <span style={{ color:C.amber }}>Contexte → </span>{person.context}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {person.questions?.map((q,qi) => (
                    <div key={qi} style={{ paddingLeft:10, borderLeft:`2px solid ${C.purple}33` }}>
                      <div style={{ fontSize:13, color:C.text, fontStyle:"italic", lineHeight:1.65, marginBottom:4 }}>
                        "{q.question}"
                      </div>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <Badge label={q.angle} color={C.purple} size={9}/>
                        <span style={{ fontSize:11, color:C.textM }}>{q.objective}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>}
        </div>;
      })()}
      {!isTAMeeting && !isDiscMeeting && !isInitMeeting && tab==="case" && result.caseEntry && <Card style={{ borderLeft:`3px solid ${C.em}` }}>
        <SecHead icon="📂" label={t("meetings.section.caseEntry")} color={C.em}/>
        {[["Titre",result.caseEntry.title],["Type",result.caseEntry.type],["Risque",result.caseEntry.riskLevel],
          ["Situation",result.caseEntry.situation],["Interventions",result.caseEntry.interventionsDone],
          ["Position RH",result.caseEntry.hrPosition],["Prochain suivi",result.caseEntry.nextFollowUp],
          ["Notes",result.caseEntry.notes]].map(([l,v],i) => v ? <div key={i} style={{ marginBottom:12 }}>
          <Mono color={C.textD} size={9}>{l}</Mono>
          <div style={{ fontSize:13, color:C.text, lineHeight:1.65, marginTop:4 }}>{v}</div>
          {i<7 && <Divider my={8}/>}
        </div> : null)}
        {view==="result" && <button onClick={saveResult} disabled={saved}
          style={{ ...css.btn(C.em), width:"100%", marginTop:8 }}>
          {saved ? t("meetings.saved") : t("meetings.case.save")}
        </button>}
      </Card>}

      {view==="result" && !saved && <div style={{ textAlign:"center", marginTop:16 }}>
        <button onClick={() => { setView("new"); setResult(null); setTranscript(""); setContext(""); }}
          style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:7,
            padding:"8px 20px", fontSize:12, color:C.textD, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
          {t("meetings.newAnalysis")}
        </button>
      </div>}
    </div>
  );

  if (view === "director") {
    const dm = meetings.filter(m => m.director===activeDir).reverse();
    return <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button onClick={() => setView("list")} style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>{t("meetings.back")}</button>
        <div style={{ fontSize:17, fontWeight:700, color:C.text }}>{activeDir}</div>
        <Badge label={`${dm.length} meetings`} color={C.blue}/>
        {activeDir && (
          <button onClick={() => { sessionStorage.setItem("hrbpos:pendingLeader", activeDir.trim()); onNavigate("leaders"); }}
            style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:6,
              background:C.purple+"18", border:`1px solid ${C.purple}44`, borderRadius:7,
              padding:"6px 13px", fontSize:11, color:C.purple, cursor:"pointer",
              fontFamily:"'DM Sans',sans-serif", fontWeight:600 }}>
            {t("meetings.dirView.leaderCard")}
          </button>
        )}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {dm.map((m,i) => { const r=RISK[m.analysis?.overallRisk]||RISK["Faible"]; return (
          <button key={i} onClick={() => { setActiveSession(m); setResult(normalizeMeetingOutput(m.analysis)); setTab("summary"); setView("session"); }}
            style={{ ...css.card, cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
              <span style={{ fontSize:13, fontWeight:500, color:C.text }}>{m.analysis?.meetingTitle}</span>
              <RiskBadge level={m.analysis?.overallRisk}/>
            </div>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <Mono color={C.textD} size={8}>{m.savedAt}</Mono>
              <span style={{ fontSize:11, color:C.textM }}>· {toArray(m.analysis?.actions).length} actions · {toArray(m.analysis?.questions).length} questions</span>
            </div>
          </button>
        );})}
      </div>
    </div>;
  }

  return null;
}

// ── 8 MEETING TYPES — content ────────────────────────────────────────────────
// ── ENGINE TAB — renders MeetingEngine inline ──────────────────────────────
function EngineTab(props) {
  return <MeetingEngine data={props.data} onSave={props.onSave} onNavigate={props.onNavigate} />;
}

// ── SHELL: 2 tabs (Meetings / 1:1 Engine) ───────────────────────────────────
export default function ModuleMeetings(props) {
  const { t } = useT();
  const [tab, setTab] = useState(() => {
    // B-25: Switch to engine tab if a meeting context is pending (do not clear — MeetingEngine consumes it)
    try {
      if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("hrbpos:pendingMeetingContext")) {
        return "engine";
      }
    } catch {}
    return "transcripts";
  });
  // Force "transcripts" tab when navigating from another module with focusMeetingId
  useEffect(() => {
    if (props.focusMeetingId) setTab("transcripts");
  }, [props.focusMeetingId]);
  const tabs = [
    { id:"transcripts", label:t("meetings.shell.transcripts"),     icon:"🎙️", color:C.blue },
    { id:"engine",      label:t("meetings.shell.engine"), color:C.em, icon:"⚡" },
  ];
  return (
    <div>
      <div style={{ display:"flex", gap:6, marginBottom:16, borderBottom:`1px solid ${C.border}` }}>
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding:"10px 16px", background:"none",
              border:"none", borderBottom:`2px solid ${active ? t.color : "transparent"}`,
              cursor:"pointer", fontFamily:"'DM Mono',monospace",
              fontSize:11, letterSpacing:1,
              color: active ? t.color : C.textM, fontWeight: active ? 600 : 400,
            }}>
              <span style={{ marginRight:6 }}>{t.icon}</span>{t.label.toUpperCase()}
            </button>
          );
        })}
      </div>
      {tab === "transcripts" && <MeetingsTranscripts {...props} onSwitchTab={setTab} />}
      {tab === "engine" && <EngineTab data={props.data} onSave={props.onSave} onNavigate={props.onNavigate} />}
    </div>
  );
}
