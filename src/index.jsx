// ── HRBP OS — Entry Point ────────────────────────────────────────────────────
// This file is the migration target for src/. It will replace public/HRBP_OS.jsx
// as the esbuild entry point at Bloc 8 (final switch).
//
// STATUS: Bloc 1 — infrastructure wired, all modules are stubs.
// Modules will be swapped in one by one as they are migrated (Blocs 4–7).

import { useState, useRef, useEffect, useCallback } from "react";

// ── Infrastructure imports (Bloc 1) ──────────────────────────────────────────
import { C, css, FONTS, DELAY_C, RISK, INV_RED } from './theme.js';
import { normalizeRisk, normalizeDelay, normalizeAIData } from './utils/normalize.js';
import { toISO, fmtDate, getProvince } from './utils/format.js';
import { SK, sGet, sSet } from './utils/storage.js';
import { PROVINCES, getLegalContext, LEGAL_GUARDRAIL, buildLegalPromptContext, isLegalSensitive } from './utils/legal.js';
import { _apiFetch, callAI, callAIJson, callAIText } from './api/index.js';

// ── Component imports ────────────────────────────────────────────────────────
import Mono          from './components/Mono.jsx';
import Divider       from './components/Divider.jsx';
import AILoader      from './components/AILoader.jsx';
import ProvinceSelect from './components/ProvinceSelect.jsx';
// import Card         from './components/Card.jsx';
// import Badge        from './components/Badge.jsx';
// import ProvinceBadge  from './components/ProvinceBadge.jsx';

// ── Module imports (filled in as each bloc is completed) ──────────────────────
// Bloc 4 — static modules
import ModuleWorkshop  from './modules/Workshop.jsx';
import ModuleConvKit   from './modules/ConvKit.jsx';
import ModuleKnowledge from './modules/Knowledge.jsx';
import ModuleDecisions from './modules/Decisions.jsx';
// Bloc 5 — simple AI modules
import ModuleSignals   from './modules/Signals.jsx';
import ModuleCoaching  from './modules/Coaching.jsx';
import ModuleExit      from './modules/Exit.jsx';
import Module306090    from './modules/Plan306090.jsx';
import ModuleRadar     from './modules/Radar.jsx';
// Bloc 6 — complex CRUD
import ModuleCases         from './modules/Cases.jsx';
import ModuleInvestigation from './modules/Investigation.jsx';
import ModuleAutoPrompt    from './modules/AutoPrompt.jsx';
// Bloc 7 — high-coupling
import ModuleMeetings  from './modules/Meetings.jsx';
import Module1on1Prep  from './modules/Prep1on1.jsx';
import ModuleBrief     from './modules/Brief.jsx';
import ModuleHome      from './modules/Home.jsx';
import ModuleLeader    from './modules/Leader.jsx';
import ModuleCopilot   from './modules/Copilot.jsx';

// ── Prompts (filled in at Bloc 2) — imported per module ───────────────────────
// (each module file imports its own prompts directly)

function SavedToast({ show }) {
  if (!show) return null;
  return <div style={{ position:"fixed", bottom:20, right:20, background:C.em, color:C.bg,
    borderRadius:8, padding:"8px 16px", fontSize:12, fontWeight:700, zIndex:9999,
    fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 20px #10b98140" }}>
    ✓ Sauvegardé
  </div>;
}

// ── NAV config (Source: HRBP_OS.jsx L.10661-10682) ────────────────────────────
const NAV_MAIN = [
  { id:"home",      icon:"🏠",  label:"Home",      color:C.em },
  { id:"copilot",   icon:"⚡",  label:"Copilot",   color:C.em },
  { id:"autoprompt",icon:"🧩",  label:"Prompt AI",  color:C.purple },
  { id:"meetings",  icon:"🎙️", label:"Meetings",   color:C.blue },
  { id:"leaders",   icon:"👤",  label:"Portfolio",  color:C.purple },
  { id:"cases",     icon:"📂",  label:"Case Log",   color:C.blue },
  { id:"signals",   icon:"📡",  label:"Signaux",    color:C.purple },
  { id:"brief",     icon:"📊",  label:"Weekly",     color:C.amber },
];
const NAV_MORE = [
  { id:"plans306090",  icon:"📅",  label:"30-60-90",   color:C.em },
  { id:"coaching",     icon:"🤝",  label:"Coaching",   color:C.teal },
  { id:"investigation",icon:"🔍",  label:"Enquêtes",   color:"#7a1e2e" },
  { id:"decisions",    icon:"⚖️", label:"Décisions",  color:C.red },
  { id:"exit",         icon:"🚪",  label:"Départs",    color:C.textM },
  { id:"workshop",     icon:"🛠️", label:"Workshop",   color:C.blue },
  { id:"convkit",      icon:"💬",  label:"Conv Kit",   color:C.em },
  { id:"knowledge",    icon:"🧠",  label:"Knowledge",  color:C.blue },
  { id:"radar",        icon:"🔭",  label:"Org Radar",  color:C.red },
];

// ── Auth (Source: HRBP_OS.jsx L.10684-10741) ──────────────────────────────────
const AUTH_KEY = "hrbpos_auth";

function LoginScreen({ onAuth }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [checking, setChecking] = useState(false);

  const attempt = async () => {
    if (!pw || checking) return;
    setChecking(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (data.ok) {
        localStorage.setItem(AUTH_KEY, "1");
        onAuth();
      } else {
        setError(true);
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setPw("");
      }
    } catch {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setPw("");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", background:C.bg, fontFamily:"'DM Sans',sans-serif" }}>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}`}</style>
      <div style={{ width:340, animation:shake?"shake .4s ease":undefined }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ width:44, height:44, background:C.em, borderRadius:10,
            display:"inline-flex", alignItems:"center", justifyContent:"center",
            fontSize:20, marginBottom:12 }}>⚡</div>
          <div style={{ fontWeight:700, fontSize:18, color:C.text }}>HRBP OS</div>
          <div style={{ fontSize:12, color:C.textM, marginTop:4 }}>Samuel Chartrand</div>
        </div>
        <div style={{ background:C.surf, border:`1px solid ${error?C.red+"66":C.border}`,
          borderRadius:12, padding:"24px 24px 20px", transition:"border-color .2s" }}>
          <label style={{ fontSize:11, fontWeight:600, color:C.textM,
            letterSpacing:.8, textTransform:"uppercase", display:"block", marginBottom:6 }}>
            Mot de passe
          </label>
          <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setError(false);}}
            onKeyDown={e=>e.key==="Enter"&&attempt()}
            autoFocus
            placeholder="••••••••••••"
            style={{ ...css.input, marginBottom: error?8:16,
              borderColor: error ? C.red+"66" : C.border }} />
          {error && (
            <div style={{ fontSize:11, color:C.red, marginBottom:12 }}>
              Mot de passe incorrect.
            </div>
          )}
          <button onClick={attempt} disabled={checking}
            style={{ ...css.btn(C.em), width:"100%", padding:"11px", fontSize:13, opacity:checking?.6:1 }}>
            {checking ? "Vérification…" : "Entrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Root component (Source: HRBP_OS.jsx L.10743-11097) ────────────────────────
export default function HRBPOS() {
  const [authed, setAuthed]   = useState(() => localStorage.getItem(AUTH_KEY) === "1");
  const [module, setModule]   = useState("home");
  const [showMore, setShowMore] = useState(false);
  const [data, setData]       = useState({ cases:[], meetings:[], signals:[], decisions:[], coaching:[], exits:[], investigations:[], briefs:[], prep1on1:[], sentRecaps:[], portfolio:[], leaders:{}, radars:[], nextWeekLocks:[], plans306090:[], profile:{ defaultProvince:"QC" } });
  const [toast, setToast]     = useState(false);
  const [loaded, setLoaded]   = useState(false);
  const [focusCaseId,    setFocusCaseId]    = useState(null); // inter-module focus bridge
  const [focusMeetingId, setFocusMeetingId] = useState(null); // inter-module focus bridge
  const [focusExitId,    setFocusExitId]    = useState(null); // inter-module focus bridge
  const [focusSignalId,  setFocusSignalId]  = useState(null); // inter-module focus bridge

  // Load all data on mount — always resolves even if storage fails
  useEffect(() => {
    const defaults = { cases:[], meetings:[], signals:[], decisions:[], coaching:[], exits:[], investigations:[], briefs:[], prep1on1:[], sentRecaps:[], portfolio:[], leaders:{}, radars:[], nextWeekLocks:[], plans306090:[], profile:{ defaultProvince:"QC" } };
    const timeout = setTimeout(() => setLoaded(true), 1500);
    Promise.allSettled(
      Object.entries(SK).map(async ([k, sk]) => {
        try { const v = await sGet(sk); return [k, v ?? defaults[k]]; }
        catch { return [k, defaults[k]]; }
      })
    ).then(results => {
      clearTimeout(timeout);
      const entries = results.map(r => r.status === "fulfilled" ? r.value : null).filter(Boolean);
      if (entries.length > 0) setData(d => ({ ...d, ...Object.fromEntries(entries) }));
      setLoaded(true);
    }).catch(() => { clearTimeout(timeout); setLoaded(true); });
  }, []);

  const showToast = () => { setToast(true); setTimeout(() => setToast(false), 2000); };

  const handleBackup = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString("fr-CA");
    const backup = {
      backup_date: dateStr,
      backup_time: now.toLocaleTimeString("fr-CA"),
      version: "HRBP_OS",
      counts: {
        cases:         (data.cases||[]).length,
        meetings:      (data.meetings||[]).length,
        signals:       (data.signals||[]).length,
        decisions:     (data.decisions||[]).length,
        coaching:      (data.coaching||[]).length,
        exits:         (data.exits||[]).length,
        investigations:(data.investigations||[]).length,
        briefs:        (data.briefs||[]).length,
        prep1on1:      (data.prep1on1||[]).length,
        sentRecaps:    (data.sentRecaps||[]).length,
      },
      data,
    };
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `HRBP_OS_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const [restoreStatus, setRestoreStatus] = useState(null);
  const [restoreMsg, setRestoreMsg]       = useState("");
  const fileInputRef = useRef(null);

  const handleRestoreClick = () => fileInputRef.current?.click();

  const handleRestoreFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setRestoreStatus("loading");
    setRestoreMsg("");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const restored = parsed.data || parsed;
      const keys = ["cases","meetings","signals","decisions","coaching","exits","investigations","briefs","prep1on1","sentRecaps","plans306090","profile","leaders"];
      const updates = {};
      for (const k of keys) {
        if (restored[k] !== undefined) {
          const skKey = SK[k];
          if (skKey) await sSet(skKey, restored[k]);
          updates[k] = restored[k];
        }
      }
      setData(d => ({ ...d, ...updates }));
      const total = Object.values(updates).reduce((acc, v) => acc + (Array.isArray(v) ? v.length : 0), 0);
      setRestoreStatus("success");
      setRestoreMsg(`${total} entrées restaurées${parsed.backup_date ? ` (backup du ${parsed.backup_date})` : ""}`);
      setTimeout(() => setRestoreStatus(null), 4000);
    } catch(err) {
      setRestoreStatus("error");
      setRestoreMsg("Fichier invalide — vérifie que c'est un backup HRBP OS.");
      setTimeout(() => setRestoreStatus(null), 4000);
    }
  };

  const handleSave = useCallback(async (key, value) => {
    const skKey = SK[key];
    if (!skKey) return;
    await sSet(skKey, value);
    setData(d => ({ ...d, [key]: value }));
    showToast();
  }, []);

  const handleSaveMeeting = useCallback(async (session, caseEntry) => {
    if ((data.meetings||[]).some(m => m.id === session.id)) return;
    const newMeetings = [...(data.meetings||[]), session];
    await sSet(SK.meetings, newMeetings);
    setData(d => ({ ...d, meetings: newMeetings }));
    if (caseEntry) {
      const newCase = {
        id: Date.now().toString(),
        title: caseEntry.title || session.analysis?.meetingTitle,
        type: "conflict_ee",
        riskLevel: caseEntry.riskLevel || session.analysis?.overallRisk,
        status: "active",
        director: session.director,
        employee: "",
        department: "",
        openDate: session.savedAt,
        situation: caseEntry.situation,
        interventionsDone: caseEntry.interventionsDone,
        hrPosition: caseEntry.hrPosition,
        nextFollowUp: caseEntry.nextFollowUp,
        notes: caseEntry.notes,
        actions: (session.analysis?.actions||[]).map(a => ({ ...a, done:false })),
        updatedAt: session.savedAt,
      };
      const newCases = [...(data.cases||[]), newCase];
      await sSet(SK.cases, newCases);
      setData(d => ({ ...d, cases: newCases }));
    }
    showToast();
  }, [data]);

  const handleUpdateMeeting = useCallback(async (updatedSession) => {
    const newMeetings = (data.meetings||[]).map(m =>
      m.id === updatedSession.id ? updatedSession : m
    );
    await sSet(SK.meetings, newMeetings);
    setData(d => ({ ...d, meetings: newMeetings }));
    showToast();
  }, [data]);

  const allNav  = [...NAV_MAIN, ...NAV_MORE];
  const activeNav = allNav.find(n => n.id === module);

  if (!authed) return <LoginScreen onAuth={() => setAuthed(true)} />;

  return (
    <div style={{ display:"flex", height:"100vh", background:C.bg, fontFamily:"'DM Sans',sans-serif", color:C.text, overflow:"hidden" }}>
      <style>{FONTS}</style>
      <style>{`*{box-sizing:border-box}textarea,input,select{outline:none}@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}.fadein{animation:fadeIn .2s ease both}::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.borderL};border-radius:4px}`}</style>

      {/* ── SIDEBAR ── */}
      <div style={{ width:200, background:C.surf, borderRight:`1px solid ${C.border}`,
        display:"flex", flexDirection:"column", flexShrink:0, padding:"16px 10px" }}>

        {/* Logo */}
        <div style={{ padding:"8px 10px", marginBottom:20 }}>
          <div style={{ display:"flex", alignItems:"center", gap:9 }}>
            <div style={{ width:26, height:26, background:C.em, borderRadius:6,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0 }}>⚡</div>
            <div>
              <div style={{ fontWeight:700, fontSize:13, color:C.text, lineHeight:1.1 }}>HRBP OS</div>
              <Mono color={C.textD} size={8}>Samuel Chartrand</Mono>
            </div>
          </div>
        </div>

        {/* Main nav */}
        <div style={{ display:"flex", flexDirection:"column", gap:2, flex:1 }}>
          {NAV_MAIN.map(n => (
            <button key={n.id} onClick={() => { setModule(n.id); setShowMore(false); }}
              style={{ display:"flex", alignItems:"center", gap:9, padding:"9px 12px",
                background:module===n.id ? n.color+"18" : "none",
                border:`1px solid ${module===n.id ? n.color+"44" : "transparent"}`,
                borderRadius:8, cursor:"pointer", textAlign:"left", width:"100%",
                fontFamily:"'DM Sans',sans-serif", transition:"all .15s" }}>
              <span style={{ fontSize:14, lineHeight:1 }}>{n.icon}</span>
              <span style={{ fontSize:13, fontWeight:module===n.id?600:400,
                color:module===n.id ? n.color : C.textM }}>{n.label}</span>
            </button>
          ))}

          <Divider my={8}/>

          {/* More toggle */}
          <button onClick={() => setShowMore(s=>!s)}
            style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px",
              background:"none", border:`1px solid ${C.border}`, borderRadius:8, cursor:"pointer",
              fontFamily:"'DM Sans',sans-serif", width:"100%", marginBottom:4 }}>
            <span style={{ fontSize:12, color:C.textM }}>Plus</span>
            <span style={{ fontSize:10, color:C.textD }}>{showMore?"▲":"▼"}</span>
          </button>

          {showMore && NAV_MORE.map(n => (
            <button key={n.id} onClick={() => setModule(n.id)}
              style={{ display:"flex", alignItems:"center", gap:9, padding:"8px 12px",
                background:module===n.id ? n.color+"18":"none",
                border:`1px solid ${module===n.id ? n.color+"44" : "transparent"}`,
                borderRadius:8, cursor:"pointer", textAlign:"left", width:"100%",
                fontFamily:"'DM Sans',sans-serif", transition:"all .15s" }}>
              <span style={{ fontSize:13 }}>{n.icon}</span>
              <span style={{ fontSize:12, fontWeight:module===n.id?600:400,
                color:module===n.id ? n.color : C.textM }}>{n.label}</span>
            </button>
          ))}
        </div>

        {/* Province par défaut */}
        <div style={{ display:"flex", alignItems:"center", gap:8,
          padding:"7px 12px", marginBottom:8,
          background:C.surfL, borderRadius:8, border:`1px solid ${C.border}` }}>
          <span style={{ fontSize:11, color:C.textM, flex:1, fontWeight:500 }}>Province</span>
          <ProvinceSelect
            value={data.profile?.defaultProvince||"QC"}
            onChange={e => {
              const updated = { ...(data.profile||{}), defaultProvince: e.target.value };
              handleSave("profile", updated);
            }}
            style={{ padding:"4px 6px", fontSize:11, borderRadius:5 }}/>
        </div>

        {/* Backup / Restore */}
        <button onClick={handleBackup}
          style={{ width:"100%", display:"flex", alignItems:"center", gap:8,
            padding:"8px 12px", background:"none",
            border:`1px solid ${C.border}`, borderRadius:8, cursor:"pointer",
            fontFamily:"'DM Sans',sans-serif", marginBottom:6, transition:"all .15s" }}
          onMouseEnter={e=>e.currentTarget.style.borderColor=C.em+"66"}
          onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
          <span style={{ fontSize:13 }}>💾</span>
          <span style={{ fontSize:12, color:C.textM, fontWeight:500 }}>Backup JSON</span>
        </button>

        <input ref={fileInputRef} type="file" accept=".json" onChange={handleRestoreFile}
          style={{ display:"none" }}/>
        <button onClick={handleRestoreClick}
          style={{ width:"100%", display:"flex", alignItems:"center", gap:8,
            padding:"8px 12px", background:"none",
            border:`1px solid ${C.border}`, borderRadius:8, cursor:"pointer",
            fontFamily:"'DM Sans',sans-serif", marginBottom:8, transition:"all .15s" }}
          onMouseEnter={e=>e.currentTarget.style.borderColor=C.blue+"66"}
          onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
          <span style={{ fontSize:13 }}>📂</span>
          <span style={{ fontSize:12, color:C.textM, fontWeight:500 }}>
            {restoreStatus === "loading" ? "Chargement…" : "Charger backup"}
          </span>
        </button>

        {restoreStatus && restoreStatus !== "loading" && (
          <div style={{ margin:"0 0 8px", padding:"7px 10px", borderRadius:7, fontSize:11,
            background: restoreStatus === "success" ? C.em+"15" : C.red+"15",
            border:`1px solid ${restoreStatus === "success" ? C.em+"40" : C.red+"40"}`,
            color: restoreStatus === "success" ? C.em : C.red,
            lineHeight:1.5 }}>
            {restoreStatus === "success" ? "✓ " : "⚠ "}{restoreMsg}
          </div>
        )}

        {/* Footer stats */}
        <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12, marginTop:8 }}>
          {[
            ["Cas actifs", (data.cases||[]).filter(c=>c.status==="active"||c.status==="open").length, C.em],
            ["Meetings",   (data.meetings||[]).length,       C.blue],
            ["Signaux",    (data.signals||[]).length,        C.purple],
            ["Stratégies", (data.decisions||[]).length,      C.red],
            ["Coaching",   (data.coaching||[]).length,       C.teal],
            ["Départs",    (data.exits||[]).length,          C.textM],
            ["Enquêtes",   (data.investigations||[]).length, INV_RED],
            ["Briefs",     (data.briefs||[]).length,         C.amber],
          ].map(([l,v,col],i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
              <Mono color={C.textD} size={8}>{l}</Mono>
              <Mono color={col} size={8}>{v}</Mono>
            </div>
          ))}
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Top bar */}
        <div style={{ background:C.surf, borderBottom:`1px solid ${C.border}`,
          padding:"12px 24px", display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
          <span style={{ fontSize:16 }}>{activeNav?.icon}</span>
          <span style={{ fontSize:15, fontWeight:600, color:C.text }}>{activeNav?.label}</span>
          <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
            {(data.cases||[]).filter(c=>(c.riskLevel==="Critique"||c.riskLevel==="Élevé")&&(c.status==="active"||c.status==="open")).slice(0,3).map((c,i) => (
              <button key={i} onClick={()=>setModule("cases")}
                style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:5,
                  padding:"3px 10px", fontSize:10, color:C.red, cursor:"pointer",
                  fontFamily:"'DM Sans',sans-serif" }}>
                ⚠ {c.title?.substring(0,20)}{c.title?.length>20?"…":""}
              </button>
            ))}
          </div>
        </div>

        {/* Module area — stubs until migration complete */}
        <div style={{ flex:1, overflowY:"auto", padding:"24px" }} className="fadein">
          {!loaded ? (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%" }}>
              <AILoader label="Chargement du système"/>
            </div>
          ) : module === "home"         ? <ModuleHome data={data} onNavigate={setModule}/>
          : module === "radar"          ? <ModuleRadar data={data} onSave={handleSave}/>
          : module === "copilot"        ? <ModuleCopilot data={data}/>
          : module === "meetings"       ? <ModuleMeetings data={data} onSave={handleSave} onSaveSession={handleSaveMeeting} onUpdateMeeting={handleUpdateMeeting} onNavigate={setModule} focusMeetingId={focusMeetingId} onClearFocus={() => setFocusMeetingId(null)}/>
          : module === "prep1on1"       ? <Module1on1Prep data={data} onSave={handleSave} onNavigate={setModule}/>
          : module === "cases"          ? <ModuleCases data={data} onSave={handleSave} focusCaseId={focusCaseId} onClearFocus={() => setFocusCaseId(null)}/>
          : module === "signals"        ? <ModuleSignals data={data} onSave={handleSave} focusSignalId={focusSignalId} onClearFocus={() => setFocusSignalId(null)}/>
          : module === "brief"          ? <ModuleBrief data={data} onSave={handleSave}/>
          : module === "decisions"      ? <ModuleDecisions data={data} onSave={handleSave}/>
          : module === "coaching"       ? <ModuleCoaching data={data} onSave={handleSave}/>
          : module === "investigation"  ? <ModuleInvestigation data={data} onSave={handleSave}/>
          : module === "exit"           ? <ModuleExit data={data} onSave={handleSave} focusExitId={focusExitId} onClearFocus={() => setFocusExitId(null)}/>
          : module === "workshop"       ? <ModuleWorkshop />
          : module === "autoprompt"     ? <ModuleAutoPrompt data={data}/>
          : module === "convkit"        ? <ModuleConvKit />
          : module === "plans306090"    ? <Module306090 data={data} onSave={handleSave}/>
          : module === "knowledge"      ? <ModuleKnowledge />
          : module === "leaders"        ? <ModuleLeader data={data} onSave={handleSave} onNavigate={(id, ctx) => { if (ctx?.focusCaseId) setFocusCaseId(ctx.focusCaseId); if (ctx?.focusMeetingId) setFocusMeetingId(ctx.focusMeetingId); if (ctx?.focusExitId) setFocusExitId(ctx.focusExitId); if (ctx?.focusSignalId) setFocusSignalId(ctx.focusSignalId); setModule(id); }}/>
          : null}
        </div>
      </div>

      <SavedToast show={toast}/>
    </div>
  );
}
