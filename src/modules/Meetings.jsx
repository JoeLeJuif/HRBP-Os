// ── Module: Meetings ─────────────────────────────────────────────────────────
// Source: HRBP_OS.jsx L.570–1737
// Extraction fidèle — aucune modification de logique

import { useState, useEffect } from "react";
import { C, css, DELAY_C, RISK } from '../theme.js';
import { fmtDate, getProvince } from '../utils/format.js';
import { buildLegalPromptContext } from '../utils/legal.js';
import { callAI } from '../api/index.js';
import { MEETING_SP, DISC_SP, TA_SP, INIT_SP } from '../prompts/meetings.js';
import Mono         from '../components/Mono.jsx';
import Badge        from '../components/Badge.jsx';
import Card         from '../components/Card.jsx';
import Divider      from '../components/Divider.jsx';
import ProvinceBadge  from '../components/ProvinceBadge.jsx';
import ProvinceSelect from '../components/ProvinceSelect.jsx';
import Module1on1Prep from './Prep1on1.jsx';

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
  const [secs, setSecs] = React.useState(0);
  React.useEffect(() => {
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

function MeetingsTranscripts({ data, onSaveSession, onUpdateMeeting, onNavigate, focusMeetingId, onClearFocus }) {
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
    const target = (data.meetings || []).find(m => m.id === focusMeetingId);
    if (target) {
      setActiveSession(target);
      setResult(target.analysis);
      setTab("summary");
      setView("session");
    }
    if (onClearFocus) onClearFocus();
  }, [focusMeetingId]); // eslint-disable-line

  const meetings = data.meetings || [];
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
      setResult(parsed);
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
    {id:"summary",   icon:"📋", label:"Résumé"},
    {id:"faits",     icon:"📄", label:"Faits"},
    {id:"juridique", icon:"⚖",  label:"Cadre juridique"},
    {id:"sanction",  icon:"🔴", label:"Sanction"},
    {id:"actions",   icon:"✅", label:"Actions & Docs"},
  ] : isInitMeeting ? [
    {id:"summary",    icon:"📋", label:"Résumé"},
    {id:"initiatives",icon:"🚀", label:"Initiatives", badge: result?.initiatives?.length > 0 ? result.initiatives.length : null},
    {id:"blocages",   icon:"🚧", label:"Blocages",    badge: result?.blocagesGlobaux?.length > 0 ? result.blocagesGlobaux.length : null},
    {id:"decisions",  icon:"✅", label:"Décisions"},
    {id:"actions",    icon:"🎯", label:"Actions"},
    {id:"questions",  icon:"💬", label:"Prochain meeting"},
  ] : isTAMeeting ? [
    {id:"summary",   icon:"📋", label:"Résumé"},
    {id:"postes",    icon:"🎯", label:"Postes", badge: result?.postes?.length > 0 ? result.postes.length : null},
    {id:"blocages",  icon:"🚧", label:"Blocages", badge: result?.blocages?.length > 0 ? result.blocages.length : null},
    {id:"actions",   icon:"✅", label:"Actions"},
    {id:"questions", icon:"💬", label:"Prochain meeting"},
  ] : [
    {id:"summary",icon:"📋",label:"Résumé"},
    {id:"people",icon:"👥",label:"People"},
    {id:"signals",icon:"📡",label:"Signaux"},
    {id:"risks",icon:"⚠",label:"Risques"},
    {id:"actions",icon:"🎯",label:"Actions"},
    {id:"questions",icon:"💬",label:"Questions", badge: result?.crossQuestions?.length > 0 ? `+${result.crossQuestions.length}` : null},
    {id:"case",icon:"📂",label:"Case Log"},
  ];
  const [tab, setTab] = useState("summary");
  const [qsub, setQsub] = useState("meeting");
  const [groupBy, setGroupBy] = useState("director");
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaDraft, setMetaDraft] = useState({});

  if (view === "list") {
    const TYPE_META = {
      executif:      { label:"Exécutif",            icon:"🏛", color:C.purple },
      vp:            { label:"VP",                  icon:"📊", color:C.blue },
      director:      { label:"Directeur",          icon:"🏢", color:C.blue },
      manager:       { label:"Manager",             icon:"👤", color:C.blue },
      talent:        { label:"Talent / Perf",       icon:"⭐", color:C.amber },
      org:           { label:"Org & Changement",    icon:"🔄", color:C.purple },
      ta:            { label:"Talent Acquisition",  icon:"🎯", color:C.teal },
      hrbpteam:      { label:"HRBP Team",           icon:"🤝", color:C.em },
      disciplinaire: { label:"Disciplinaire",       icon:"⚖",  color:C.red },
      initiatives:   { label:"Initiatives",         icon:"🚀", color:C.em },
    };
    return (
    <div style={{ maxWidth:860, margin:"0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>Meetings</div>
          <div style={{ fontSize:12, color:C.textM }}>{meetings.length} meeting(s) enregistré(s)</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={() => onNavigate("prep1on1")} style={{ ...css.btn(C.blue,true), padding:"8px 14px", fontSize:12 }}>🗂️ Préparation Meeting</button>
          <button onClick={() => setView("new")} style={{ ...css.btn(C.em) }}>⚡ Analyser un meeting</button>
        </div>
      </div>

      {/* Group by toggle */}
      <div style={{ display:"flex", gap:2, marginBottom:20, background:C.surfL, borderRadius:8, padding:4, width:"fit-content" }}>
        {[{id:"director",label:"Par directeur"},{id:"type",label:"Par type"}].map(g => (
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
          executif:  { label:"Exécutif",    icon:"🏛", color:C.purple, order:0 },
          vp:        { label:"VP",          icon:"📊", color:C.blue,   order:1 },
          director:  { label:"Directeur",   icon:"🏢", color:C.blue,   order:2 },
          manager:   { label:"Gestionnaire",icon:"👤", color:C.teal,   order:3 },
        };
        const OTHER_LVL = { label:"Autre", icon:"📋", color:C.textD, order:4 };
        // Determine dominant level per director name (lowest order wins)
        const dirLevel = {};
        meetings.forEach(m => {
          if (!m.director) return;
          const lvl = LEVEL_MAP[m.meetingType];
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
              <div style={{ fontSize:13, color:C.textM, marginBottom:6 }}>Aucun meeting enregistré</div>
              <div style={{ fontSize:12, color:C.textD }}>Analyse ton premier transcript pour commencer.</div>
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
                      onClick={() => { setActiveSession(m); setResult(m.analysis); setTab("summary"); setView("session"); }}
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
              <div style={{ fontSize:13, color:C.textM, marginBottom:6 }}>Aucun meeting enregistré</div>
              <div style={{ fontSize:12, color:C.textD }}>Analyse ton premier transcript pour commencer.</div>
            </div>
          )}
        </>;
      })()}

      {/* Recent meetings footer */}
      {meetings.length > 0 && (
        <div style={{ marginTop:20 }}>
          <Mono color={C.textD} size={9}>Sessions récentes</Mono>
          <div style={{ display:"flex", flexDirection:"column", gap:5, marginTop:8 }}>
            {meetings.slice().reverse().slice(0,5).map((m,i) => (
              <button key={i}
                onClick={() => { setActiveSession(m); setResult(m.analysis); setTab("summary"); setView("session"); }}
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

  if (view === "new") return (
    <div style={{ maxWidth:720, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button onClick={() => setView("list")} style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>← Retour</button>
        <div style={{ fontSize:16, fontWeight:700, color:C.text }}>Analyser un transcript</div>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div>
          <Mono color={C.textD}>Type de meeting</Mono>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:8 }}>
            {[
              {id:"director",    label:"🏢 Directeur"},
              {id:"executif",    label:"🏛 Exécutif"},
              {id:"vp",          label:"📊 VP"},
              {id:"manager",     label:"👤 Manager"},
              {id:"talent",      label:"⭐ Talent/Perf"},
              {id:"org",         label:"🔄 Org & Changement"},
              {id:"ta",          label:"🎯 Talent Acquisition"},
              {id:"hrbpteam",    label:"🤝 HRBP Team"},
              {id:"disciplinaire",label:"⚖ Disciplinaire"},
              {id:"initiatives", label:"🚀 Initiatives"},
            ].map(t => (
              <button key={t.id} onClick={() => setMeetingType(t.id)}
                style={{ padding:"6px 14px", borderRadius:6, fontSize:12, cursor:"pointer",
                  fontFamily:"'DM Sans',sans-serif",
                  background: meetingType===t.id ? C.em+"22" : C.surfL,
                  border:`1px solid ${meetingType===t.id ? C.em+"66" : C.border}`,
                  color: meetingType===t.id ? C.em : C.textM,
                  fontWeight: meetingType===t.id ? 600 : 400 }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Mono color={C.textD}>Portée du meeting</Mono>
          <select value={meetingScope} onChange={e => setMeetingScope(e.target.value)}
            style={{ ...css.input, marginTop:6 }}>
            <option value="leader">Leader / Gestionnaire</option>
            <option value="team">Équipe</option>
            <option value="individual">Employé / Individuel</option>
            <option value="org">Organisation / Projet</option>
          </select>
        </div>

        <div>
          <Mono color={C.textD}>Nom</Mono>
          <input value={dirName} onChange={e => setDirName(e.target.value)}
            placeholder="Ex: Marie Tremblay"
            style={{ ...css.input, marginTop:6 }}
            onFocus={e=>e.target.style.borderColor=C.em+"60"}
            onBlur={e=>e.target.style.borderColor=C.border}/>
        </div>

        <div>
          <Mono color={C.textD}>Contexte additionnel</Mono>
          <input value={context} onChange={e => setContext(e.target.value)}
            placeholder="Ex: Directeur sous-pression, équipe en restructuration"
            style={{ ...css.input, marginTop:6 }}
            onFocus={e=>e.target.style.borderColor=C.em+"60"}
            onBlur={e=>e.target.style.borderColor=C.border}/>
        </div>

        <div style={{ display:"flex", gap:12, alignItems:"flex-end" }}>
          <div>
            <Mono color={C.textD}>Prov.</Mono>
            <ProvinceSelect value={meetingProvince}
              onChange={e => setMeetingProvince(e.target.value)}
              style={{ marginTop:6 }}/>
          </div>
          <div>
            <Mono color={C.textD}>Date du meeting</Mono>
            <input type="date" value={meetingDate}
              onChange={e => setMeetingDate(e.target.value)}
              style={{ ...css.input, marginTop:6, width:160 }}
              onFocus={e=>e.target.style.borderColor=C.em+"60"}
              onBlur={e=>e.target.style.borderColor=C.border}/>
          </div>
        </div>

        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
            <Mono color={C.textD}>Notes du meeting</Mono>
            <Mono color={C.textD} size={9}>{transcript.length.toLocaleString()} car.</Mono>
          </div>
          <textarea value={transcript} onChange={e => setTranscript(e.target.value)}
            placeholder="Colle les notes ici..."
            style={{ ...css.input, height:200, resize:"vertical", lineHeight:1.6, fontSize:12 }}
            onFocus={e=>e.target.style.borderColor=C.em+"60"}
            onBlur={e=>e.target.style.borderColor=C.border}/>
        </div>
      </div>

      {error && <div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7,
        padding:"10px 14px", marginBottom:12, fontSize:12, color:C.red, whiteSpace:"pre-wrap" }}>⚠ {error}</div>}

      {loading ? (
        <MeetingLoader chars={transcript.length}/>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <button onClick={analyze} disabled={transcript.trim().length < 80}
            style={{ ...css.btn(C.em), width:"100%", padding:"13px", fontSize:14,
              opacity:transcript.trim().length < 80 ? .4:1,
              boxShadow:transcript.trim().length>=80?`0 4px 20px ${C.em}30`:"none" }}>
            ⚡ Analyser le meeting
          </button>
          {transcript.length > 20000 && (
            <div style={{ fontSize:11, color:C.textD, textAlign:"center", lineHeight:1.6 }}>
              Transcript long détecté — la compression automatique sera appliquée avant l'analyse.
              Ou clique <span style={{ color:C.amber, cursor:"pointer", fontWeight:600 }}
                onClick={handleCompress}>✂ Compresser</span> d'abord pour voir le résultat.
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Session / result view
  const MEETING_TYPES = [
    {id:"executif",    label:"🏛 Exécutif"},
    {id:"vp",          label:"📊 VP"},
    {id:"director",    label:"🏢 Directeur"},
    {id:"manager",     label:"👤 Manager"},
    {id:"talent",      label:"⭐ Talent/Perf"},
    {id:"org",         label:"🔄 Org & Changement"},
    {id:"ta",          label:"🎯 Talent Acquisition"},
    {id:"hrbpteam",    label:"🤝 HRBP Team"},
    {id:"disciplinaire",label:"⚖ Disciplinaire"},
    {id:"initiatives", label:"🚀 Initiatives"},
  ];

  const saveMeta = () => {
    if (!activeSession) return;
    const updated = {
      ...activeSession,
      meetingType: metaDraft.meetingType || activeSession.meetingType,
      scope:       metaDraft.scope       || activeSession.scope || "leader",
      director:    metaDraft.director !== undefined ? metaDraft.director : activeSession.director,
      analysis: {
        ...activeSession.analysis,
        meetingTitle: metaDraft.meetingTitle || activeSession.analysis?.meetingTitle,
        director:     metaDraft.director !== undefined ? metaDraft.director : activeSession.analysis?.director,
      },
    };
    onUpdateMeeting(updated);
    setActiveSession(updated);
    setResult(updated.analysis);
    setEditingMeta(false);
  };

  if ((view === "result" || view === "session") && result) return (
    <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <button onClick={() => { setView("list"); setResult(null); setTranscript(""); setContext(""); setEditingMeta(false); }}
          style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>← Retour</button>
        <div style={{ flex:1, fontSize:16, fontWeight:700, color:C.text }}>{result.meetingTitle}</div>
        {view === "session" && (
          <button onClick={() => {
            setEditingMeta(v => !v);
            setMetaDraft({
              meetingType: activeSession?.meetingType || meetingType,
              scope:       activeSession?.scope || "leader",
              director:    activeSession?.director || result.director || dirName,
              meetingTitle: result.meetingTitle || "",
            });
          }}
            style={{ ...css.btn(editingMeta ? C.amber : C.textM, true), padding:"6px 12px", fontSize:11 }}>
            {editingMeta ? "✕ Annuler" : "✏ Modifier"}
          </button>
        )}
        {view === "result" && <button onClick={saveResult} disabled={saved}
          style={{ ...css.btn(saved?C.textD:C.em), padding:"8px 16px", fontSize:12 }}>
          {saved ? "✓ Sauvegardé" : "💾 Sauvegarder"}
        </button>}
      </div>

      {/* Inline meta editor */}
      {editingMeta && view === "session" && (
        <div style={{ background:C.amber+"10", border:`1px solid ${C.amber}40`,
          borderRadius:10, padding:"14px 16px", marginBottom:14 }}>
          <Mono color={C.amber} size={9}>MODIFIER LES MÉTADONNÉES</Mono>
          <div style={{ display:"flex", gap:12, marginTop:12, flexWrap:"wrap", alignItems:"flex-end" }}>
            <div style={{ flex:"1 1 160px" }}>
              <Mono color={C.textD} size={9}>Titre du meeting</Mono>
              <input value={metaDraft.meetingTitle || ""}
                onChange={e => setMetaDraft(p => ({...p, meetingTitle: e.target.value}))}
                style={{ ...css.input, marginTop:5, fontSize:12 }}
                onFocus={e=>e.target.style.borderColor=C.amber+"60"}
                onBlur={e=>e.target.style.borderColor=C.border}/>
            </div>
            <div style={{ flex:"1 1 140px" }}>
              <Mono color={C.textD} size={9}>Nom</Mono>
              <input value={metaDraft.director || ""}
                onChange={e => setMetaDraft(p => ({...p, director: e.target.value}))}
                style={{ ...css.input, marginTop:5, fontSize:12 }}
                onFocus={e=>e.target.style.borderColor=C.amber+"60"}
                onBlur={e=>e.target.style.borderColor=C.border}/>
            </div>
            <div style={{ flex:"1 1 160px" }}>
              <Mono color={C.textD} size={9}>Type de meeting</Mono>
              <select value={metaDraft.meetingType || ""}
                onChange={e => setMetaDraft(p => ({...p, meetingType: e.target.value}))}
                style={{ ...css.input, marginTop:5, fontSize:12 }}>
                {MEETING_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div style={{ flex:"1 1 130px" }}>
              <Mono color={C.textD} size={9}>Portée</Mono>
              <select value={metaDraft.scope || "leader"}
                onChange={e => setMetaDraft(p => ({...p, scope: e.target.value}))}
                style={{ ...css.input, marginTop:5, fontSize:12 }}>
                <option value="leader">Leader / Gestionnaire</option>
                <option value="team">Équipe</option>
                <option value="individual">Employé / Individuel</option>
                <option value="org">Organisation / Projet</option>
              </select>
            </div>
            <button onClick={saveMeta}
              style={{ ...css.btn(C.amber), padding:"9px 18px", fontSize:12 }}>
              ✓ Sauvegarder
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
            <SecHead icon="📋" label="Résumé portefeuille" color={C.em}/>
            <BulletList items={result.summary} color={C.em}/>
          </Card>
          {result.metriques && (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
              {[
                {label:"Total",     val:result.metriques.total,     color:C.blue},
                {label:"En cours",  val:result.metriques.enCours,   color:C.em},
                {label:"Bloquées",  val:result.metriques.bloquees,  color:C.red},
                {label:"Complétées",val:result.metriques.completees,color:C.teal},
                {label:"À risque",  val:result.metriques.aRisque,   color:C.amber},
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
            <Card><div style={{ color:C.textD, fontSize:13 }}>Aucune initiative identifiée.</div></Card>
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
            <Card><div style={{ color:C.textD, fontSize:13 }}>Aucun blocage global identifié.</div></Card>
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
            <Card><div style={{ color:C.textD, fontSize:13 }}>Aucune décision enregistrée.</div></Card>
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
            <SecHead icon="📋" label="Résumé" color={C.blue}/>
            <BulletList items={result.summary} color={C.blue}/>
            {result.overallRiskRationale && <div style={{ marginTop:10, fontSize:12, color:C.textM }}><span style={{ color:C.red }}>Risque → </span>{result.overallRiskRationale}</div>}
          </Card>
          {result.pointsVigilance?.length > 0 && (
            <Card style={{ borderLeft:`3px solid ${C.amber}` }}>
              <SecHead icon="👁" label="Points de vigilance" color={C.amber}/>
              <BulletList items={result.pointsVigilance} color={C.amber}/>
            </Card>
          )}
          {result.prochaineSanction && (
            <Card style={{ background:C.red+"08" }}>
              <Mono color={C.red} size={9}>SI RÉCIDIVE — PROCHAINE ÉTAPE</Mono>
              <div style={{ fontSize:13, color:C.text, marginTop:8, lineHeight:1.65 }}>{result.prochaineSanction}</div>
            </Card>
          )}
          {result.notes && (
            <Card>
              <Mono color={C.textD} size={9}>NOTES HRBP</Mono>
              <div style={{ fontSize:13, color:C.textM, marginTop:8, fontStyle:"italic", lineHeight:1.65 }}>{result.notes}</div>
            </Card>
          )}
        </div>
      )}

      {isDiscMeeting && tab==="faits" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {[
            {key:"reproches",       label:"Reproches / Manquements",  color:C.red,    icon:"🔴"},
            {key:"positionEE",      label:"Position de l'employé(e)", color:C.blue,   icon:"💬"},
            {key:"reconnaissances", label:"Éléments reconnus",        color:C.em,     icon:"✓"},
            {key:"contestations",   label:"Éléments contestés",       color:C.amber,  icon:"⚠"},
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
            <SecHead icon="📜" label="Politiques visées" color={C.blue}/>
            <BulletList items={result.cadreJuridique?.politiquesVisees} color={C.blue}/>
          </Card>
          <Card>
            <SecHead icon="⚖" label="Lois applicables" color={C.purple}/>
            <BulletList items={result.cadreJuridique?.loisApplicables} color={C.purple}/>
          </Card>
          {result.cadreJuridique?.progressiviteSanction && (
            <Card style={{ borderLeft:`3px solid ${result.cadreJuridique.progressiviteSanction === "respectee" ? C.em : C.amber}` }}>
              <Mono color={C.textD} size={9}>PROGRESSIVITÉ DES SANCTIONS</Mono>
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
              <SecHead icon="🚨" label="Risques légaux" color={C.red}/>
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
              <SecHead icon="🔴" label="Sanction imposée" color={C.red}/>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:12 }}>
                <div style={{ background:C.red+"18", border:`1px solid ${C.red}40`, borderRadius:7, padding:"6px 14px", fontSize:13, color:C.red, fontWeight:700 }}>{result.sanctionImposee.type}</div>
                {result.sanctionImposee.duree && <Badge label={result.sanctionImposee.duree} color={C.amber}/>}
                {result.sanctionImposee.periodeSuivi && <Badge label={`Suivi : ${result.sanctionImposee.periodeSuivi}`} color={C.purple}/>}
              </div>
              {result.sanctionImposee.conditionsRetour?.length > 0 && (
                <div>
                  <Mono color={C.textD} size={9}>CONDITIONS / ATTENTES</Mono>
                  <BulletList items={result.sanctionImposee.conditionsRetour} color={C.amber}/>
                </div>
              )}
            </Card>
          ) : (
            <Card><div style={{ color:C.textD, fontSize:13 }}>Aucune sanction formelle — rencontre préliminaire ou investigatoire.</div></Card>
          )}
        </div>
      )}

      {isDiscMeeting && tab==="actions" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {result.documentationRequise?.length > 0 && (
            <Card style={{ borderLeft:`3px solid ${C.blue}` }}>
              <SecHead icon="📄" label="Documents à produire" color={C.blue}/>
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
              <SecHead icon="✅" label="Actions" color={C.em}/>
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
          <Card><SecHead icon="📋" label="Résumé pipeline" color={C.blue}/><BulletList items={result.summary} color={C.blue}/></Card>
          {result.metriques && (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
              {[
                {label:"Postes actifs",    val:result.metriques.postesActifs,   color:C.em},
                {label:"En offre",         val:result.metriques.enOffre,        color:C.amber},
                {label:"Fermés / Comblés", val:result.metriques.fermes,         color:C.teal},
                {label:"Délai moyen",      val:result.metriques.joursOuvertureMoyen ? result.metriques.joursOuvertureMoyen+"j" : "N/D", color:C.blue},
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
              <SecHead icon="⚠" label="Risques pipeline globaux" color={C.red}/>
              <BulletList items={result.metriques.risquesPipeline} color={C.red}/>
            </Card>
          )}
        </div>
      )}

      {isTAMeeting && tab==="postes" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {(!result.postes || result.postes.length === 0) && (
            <Card><div style={{ color:C.textD, fontSize:13 }}>Aucun poste identifié dans le transcript.</div></Card>
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
            <Card><div style={{ color:C.textD, fontSize:13 }}>Aucun blocage identifié.</div></Card>
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
                <Mono color={C.em} size={9}>MESSAGE CLÉ HRBP</Mono>
                <div style={{ fontSize:14, color:C.text, fontWeight:600, marginTop:8, lineHeight:1.6 }}>{result.hrbpKeyMessage}</div>
              </>}
              {result.overallRiskRationale && (
                <div style={{ fontSize:12, color:C.textM, marginTop: result.hrbpKeyMessage ? 8 : 0 }}>
                  <span style={{ color:(RISK[result.overallRisk]||RISK["Modéré"]).color }}>Risque → </span>{result.overallRiskRationale}
                </div>
              )}
            </Card>
          )}
          <Card><SecHead icon="📋" label="Résumé exécutif" color={C.blue}/><BulletList items={result.summary} color={C.blue}/></Card>
        </div>
      )}
      {!isTAMeeting && !isDiscMeeting && !isInitMeeting && tab==="people" && <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <Card><SecHead icon="📈" label="Performance" color={C.amber}/><BulletList items={result.people?.performance} color={C.amber}/></Card>
        <Card><SecHead icon="🎙️" label="Leadership" color={C.purple}/><BulletList items={result.people?.leadership} color={C.purple}/></Card>
        <Card><SecHead icon="💡" label="Engagement" color={C.em}/><BulletList items={result.people?.engagement} color={C.em}/></Card>
      </div>}
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
            {[["meeting","💬 Ce meeting","Questions pour le prochain meeting avec ce directeur"],
              ["cross","🔀 Cross-questions",`Questions pour ${result.crossQuestions?.length} autre(s) personne(s) mentionnée(s)`]
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
        <SecHead icon="📂" label="Entrée Case Log" color={C.em}/>
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
          {saved ? "✓ Sauvegardé" : "💾 Sauvegarder au Case Log"}
        </button>}
      </Card>}

      {view==="result" && !saved && <div style={{ textAlign:"center", marginTop:16 }}>
        <button onClick={() => { setView("new"); setResult(null); setTranscript(""); setContext(""); }}
          style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:7,
            padding:"8px 20px", fontSize:12, color:C.textD, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
          ↺ Nouvelle analyse
        </button>
      </div>}
    </div>
  );

  if (view === "director") {
    const dm = meetings.filter(m => m.director===activeDir).reverse();
    return <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button onClick={() => setView("list")} style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>← Retour</button>
        <div style={{ fontSize:17, fontWeight:700, color:C.text }}>{activeDir}</div>
        <Badge label={`${dm.length} meetings`} color={C.blue}/>
        {activeDir && (
          <button onClick={() => { sessionStorage.setItem("hrbpos:pendingLeader", activeDir.trim()); onNavigate("leaders"); }}
            style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:6,
              background:C.purple+"18", border:`1px solid ${C.purple}44`, borderRadius:7,
              padding:"6px 13px", fontSize:11, color:C.purple, cursor:"pointer",
              fontFamily:"'DM Sans',sans-serif", fontWeight:600 }}>
            👤 Fiche leader
          </button>
        )}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {dm.map((m,i) => { const r=RISK[m.analysis?.overallRisk]||RISK["Faible"]; return (
          <button key={i} onClick={() => { setActiveSession(m); setResult(m.analysis); setTab("summary"); setView("session"); }}
            style={{ ...css.card, cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
              <span style={{ fontSize:13, fontWeight:500, color:C.text }}>{m.analysis?.meetingTitle}</span>
              <RiskBadge level={m.analysis?.overallRisk}/>
            </div>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <Mono color={C.textD} size={8}>{m.savedAt}</Mono>
              <span style={{ fontSize:11, color:C.textM }}>· {m.analysis?.actions?.length||0} actions · {m.analysis?.questions?.length||0} questions</span>
            </div>
          </button>
        );})}
      </div>
    </div>;
  }

  return null;
}

// ── 8 MEETING TYPES — content ────────────────────────────────────────────────
const MEETING_TYPES = [
  {
    id:"disciplinary", label:"Disciplinaire", icon:"⚖️", color:C.red, sensitive:true,
    objective:"Notifier formellement un manquement, documenter les faits et signifier les conséquences applicables.",
    checklist:[
      "Faits documentés (dates, lieux, témoins)",
      "Politique applicable identifiée et citée",
      "Historique disciplinaire de l'employé revu",
      "Mesure envisagée (avis écrit / suspension / etc.)",
      "Avis légal obtenu si requis selon la province",
      "Représentant syndical avisé si applicable",
    ],
    flow:["Ouverture neutre","Faits reprochés","Politique enfreinte","Réponse de l'employé","Mesure appliquée","Prochaines étapes et droit d'appel"],
  },
  {
    id:"performance", label:"Performance", icon:"📈", color:C.amber, sensitive:true,
    objective:"Discuter d'écarts de performance objectifs et convenir d'un plan de soutien mesurable.",
    checklist:[
      "Données objectives (KPIs, exemples concrets)",
      "Attentes communiquées antérieurement",
      "Historique des feedbacks donnés",
      "Plan de soutien proposé (PIP si requis)",
      "Échéancier réaliste des mesures",
    ],
    flow:["Ouverture","Constat objectif","Écart vs attentes","Discussion ouverte","Plan de soutien","Suivi convenu"],
  },
  {
    id:"coaching", label:"Coaching / Développement", icon:"🌱", color:C.teal, sensitive:false,
    objective:"Renforcer les forces, identifier les zones de croissance et co-construire un plan de développement.",
    checklist:[
      "Forces observées récemment",
      "Zones de développement prioritaires",
      "Aspirations de carrière de l'employé",
      "Objectifs SMART à proposer",
      "Engagement du gestionnaire (temps, ressources)",
    ],
    flow:["Ouverture positive","Forces reconnues","Zones de croissance","Aspirations","Objectifs co-construits","Engagement mutuel"],
  },
  {
    id:"reframing", label:"Recadrage / Clarification", icon:"🎯", color:C.purple, sensitive:false,
    objective:"Recadrer un comportement précis sans escalade disciplinaire — clarifier l'attente et les conséquences.",
    checklist:[
      "Comportement précis et observable",
      "Impact concret sur l'équipe / le travail",
      "Attentes claires pour l'avenir",
      "Conséquences si récidive",
      "Soutien offert pour réussir",
    ],
    flow:["Ouverture","Comportement observé","Impact","Attente claire","Engagement","Conséquence si récidive"],
  },
  {
    id:"mediation", label:"Médiation / Conflit", icon:"🤝", color:C.blue, sensitive:false,
    objective:"Faciliter une conversation entre deux parties en conflit pour trouver un terrain commun.",
    checklist:[
      "Position de chaque partie écoutée séparément",
      "Faits neutres documentés",
      "Émotions reconnues sans jugement",
      "Terrain commun identifié",
      "Objectif de résolution mutuellement accepté",
    ],
    flow:["Cadre et règles","Position partie A","Position partie B","Faits neutres","Terrain commun","Engagements mutuels"],
  },
  {
    id:"investigation", label:"Enquête / Investigation", icon:"🔍", color:"#7a1e2e", sensitive:true,
    objective:"Recueillir des faits dans le cadre d'une enquête formelle — confidentialité stricte.",
    checklist:[
      "Allégations documentées par écrit",
      "Parties impliquées identifiées",
      "Confidentialité expliquée et garantie",
      "Questions ouvertes préparées",
      "Avis légal obtenu sur le processus",
      "Prochaines étapes définies",
    ],
    flow:["Cadre et confidentialité","Récit du témoin","Questions de précision","Documents cités","Engagements de confidentialité","Prochaines étapes"],
  },
  {
    id:"followup", label:"Suivi", icon:"🔄", color:C.em, sensitive:false,
    objective:"Faire le suivi d'une décision ou d'un engagement pris lors d'une rencontre antérieure.",
    checklist:[
      "Décisions et engagements précédents revus",
      "Écarts observés depuis la dernière rencontre",
      "Obstacles rencontrés",
      "Ajustements requis au plan initial",
      "Prochaine étape claire",
    ],
    flow:["Rappel du contexte","Engagements pris","Écarts observés","Obstacles","Ajustements","Prochaine étape"],
  },
  {
    id:"transition", label:"Transition", icon:"🚪", color:C.textM, sensitive:false,
    objective:"Annoncer ou accompagner un changement (rôle, équipe, structure) avec clarté et soutien.",
    checklist:[
      "Contexte du changement clair",
      "Impacts concrets sur l'employé",
      "Calendrier et étapes documentés",
      "Soutien disponible (formation, mentorat)",
      "Questions anticipées préparées",
    ],
    flow:["Contexte","Annonce claire","Impacts","Calendrier","Soutien offert","Questions et engagement"],
  },
];

function PreparationTab({ data, onSave }) {
  const [selectedId, setSelectedId] = useState(null);
  const [province, setProvince] = useState(data.profile?.defaultProvince || "QC");
  const [notes, setNotes] = useState("");
  const [decision, setDecision] = useState("");
  const [followup, setFollowup] = useState("");
  const [aiPrep, setAiPrep] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const type = MEETING_TYPES.find(t => t.id === selectedId);

  const reset = () => { setSelectedId(null); setNotes(""); setDecision(""); setFollowup(""); setAiPrep(""); };

  const generateAIPrep = async () => {
    if (!type) return;
    setAiLoading(true);
    const legal = type.sensitive ? `\n${buildLegalPromptContext(province)}\n` : "";
    const sp = `Tu es un HRBP senior. Prépare une rencontre de type "${type.label}" pour un gestionnaire. Réponds en français professionnel, structuré en sections courtes : Objectif spécifique, Points clés à aborder, Phrases d'ouverture suggérées, Pièges à éviter. Sois concret et actionnable. Maximum 250 mots.`;
    const up = `Type de rencontre: ${type.label}\nObjectif générique: ${type.objective}\nProvince: ${province}${legal}\nNotes contextuelles: ${notes || "Aucune"}`;
    try {
      const txt = await callAI(sp, up);
      setAiPrep(typeof txt === "string" ? txt : JSON.stringify(txt, null, 2));
    } catch { setAiPrep("⚠ Génération IA indisponible — utilise la checklist ci-dessus."); }
    finally { setAiLoading(false); }
  };

  const savePreparation = () => {
    if (!type) return;
    const session = {
      id: Date.now().toString(),
      savedAt: new Date().toISOString().split("T")[0],
      kind: "preparation",
      meetingType: type.id,
      meetingTypeLabel: type.label,
      province,
      notes, decision, followup,
      aiPrep,
    };
    const next = [...(data.meetings || []), session];
    onSave("meetings", next);
    reset();
  };

  if (!type) {
    return (
      <div>
        <Mono size={11} color={C.textM} style={{ marginBottom:12, display:"block" }}>SÉLECTIONNE UN TYPE DE RENCONTRE</Mono>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap:10 }}>
          {MEETING_TYPES.map(t => (
            <button key={t.id} onClick={() => setSelectedId(t.id)} style={{
              ...css.card, cursor:"pointer", textAlign:"left",
              borderLeft:`3px solid ${t.color}`, padding:"14px 14px",
              background:C.surfL, transition:"transform .15s",
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                <span style={{ fontSize:18 }}>{t.icon}</span>
                <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{t.label}</span>
                {t.sensitive && <Badge label="⚠ Légal" color={C.red} />}
              </div>
              <div style={{ fontSize:11, color:C.textM, lineHeight:1.5 }}>{t.objective}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button onClick={reset} style={{ ...css.btn, marginBottom:14, background:"none", border:`1px solid ${C.border}`, color:C.textM }}>← Retour aux types</button>
      <Card style={{ marginBottom:14, borderLeft:`3px solid ${type.color}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
          <span style={{ fontSize:22 }}>{type.icon}</span>
          <div style={{ fontSize:16, fontWeight:600, color:C.text }}>{type.label}</div>
          {type.sensitive && <Badge label="⚠ Sensible" color={C.red} />}
        </div>
        <div style={{ fontSize:13, color:C.textM, lineHeight:1.6 }}>{type.objective}</div>
        <div style={{ marginTop:12, display:"flex", alignItems:"center", gap:8 }}>
          <Mono size={10} color={C.textM}>PROVINCE</Mono>
          <ProvinceSelect value={province} onChange={e => setProvince(e.target.value)} />
        </div>
      </Card>

      <Card style={{ marginBottom:14 }}>
        <SecHead icon="✓" label="CHECKLIST DE PRÉPARATION" color={type.color} />
        <BulletList items={type.checklist} color={type.color} />
      </Card>

      <Card style={{ marginBottom:14 }}>
        <SecHead icon="🗺" label="DÉROULEMENT SUGGÉRÉ" color={type.color} />
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {type.flow.map((step, i) => (
            <div key={i} style={{ padding:"6px 10px", background:C.surfL, borderRadius:6, fontSize:12, color:C.text, border:`1px solid ${type.color}28` }}>
              <span style={{ color:type.color, fontWeight:600, marginRight:6 }}>{i+1}.</span>{step}
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom:14 }}>
        <SecHead icon="🤖" label="PRÉPARATION IA" color={C.blue} />
        <button onClick={generateAIPrep} disabled={aiLoading} style={{ ...css.btn, background:C.blue, color:"#fff", marginBottom:10 }}>
          {aiLoading ? "Génération…" : "Préparer avec l'IA"}
        </button>
        {aiPrep && <div style={{ padding:12, background:C.surfL, borderRadius:8, fontSize:13, color:C.text, lineHeight:1.6, whiteSpace:"pre-wrap" }}>{aiPrep}</div>}
      </Card>

      <Card style={{ marginBottom:14 }}>
        <SecHead icon="📝" label="OUTPUT POST-RENCONTRE" color={C.em} />
        <Mono size={10} color={C.textM} style={{ marginBottom:4, display:"block" }}>NOTES</Mono>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ ...css.textarea, minHeight:70, marginBottom:10 }} placeholder="Notes prises pendant la rencontre…" />
        <Mono size={10} color={C.textM} style={{ marginBottom:4, display:"block" }}>DÉCISION PRISE</Mono>
        <textarea value={decision} onChange={e => setDecision(e.target.value)} style={{ ...css.textarea, minHeight:50, marginBottom:10 }} placeholder="Décision retenue…" />
        <Mono size={10} color={C.textM} style={{ marginBottom:4, display:"block" }}>SUIVI REQUIS</Mono>
        <textarea value={followup} onChange={e => setFollowup(e.target.value)} style={{ ...css.textarea, minHeight:50, marginBottom:10 }} placeholder="Actions à faire après la rencontre…" />
        <button onClick={savePreparation} style={{ ...css.btn, background:C.em, color:"#fff" }}>💾 Sauvegarder</button>
      </Card>
    </div>
  );
}

// ── SHELL: 3 tabs (Préparation / Transcripts / 1:1 Engine) ──────────────────
export default function ModuleMeetings(props) {
  const [tab, setTab] = useState("transcripts");
  const tabs = [
    { id:"transcripts", label:"Meetings",     icon:"🎙️", color:C.blue },
    { id:"engine",      label:"1:1 Engine",   color:C.teal, icon:"⚡" },
    { id:"prep",        label:"Préparation",  icon:"📋", color:C.purple },
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
      {tab === "prep" && <PreparationTab data={props.data} onSave={props.onSave} />}
      {tab === "transcripts" && <MeetingsTranscripts {...props} />}
      {tab === "engine" && <Module1on1Prep data={props.data} onSave={props.onSave} onNavigate={props.onNavigate} />}
    </div>
  );
}
