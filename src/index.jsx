// ── HRBP OS — Entry Point ────────────────────────────────────────────────────
// This file is the migration target for src/. It will replace public/HRBP_OS.jsx
// as the esbuild entry point at Bloc 8 (final switch).
//
// STATUS: Bloc 1 — infrastructure wired, all modules are stubs.
// Modules will be swapped in one by one as they are migrated (Blocs 4–7).

import { useState, useRef, useEffect, useCallback } from "react";

// ── Infrastructure imports (Bloc 1) ──────────────────────────────────────────
import { C, css, FONTS, DELAY_C, RISK, INV_RED } from './theme.js';
import { normalizeRisk, normalizeDelay, normalizeAIData, normalizeCase, normalizeInvestigation } from './utils/normalize.js';
import { toISO, fmtDate, getProvince } from './utils/format.js';
import { SK, sGet, sSet } from './utils/storage.js';
import { PROVINCES, getLegalContext, LEGAL_GUARDRAIL, buildLegalPromptContext, isLegalSensitive } from './utils/legal.js';
import { _apiFetch, callAI, callAIJson, callAIText } from './api/index.js';
import { loadCases as supaLoadCases, saveCases as supaSaveCases, loadMeetings as supaLoadMeetings, saveMeetings as supaSaveMeetings, loadInvestigations as supaLoadInvestigations, saveInvestigations as supaSaveInvestigations, loadBriefs as supaLoadBriefs, saveBriefs as supaSaveBriefs } from './services/supabaseStore.js';
import { signIn as supaSignIn, signOut as supaSignOut, getSession as supaGetSession, onAuthStateChange as supaOnAuthStateChange, exchangeCodeForSession as supaExchangeCodeForSession, isEmailAllowed as supaIsEmailAllowed } from './lib/auth.js';
import { hasSupabase } from './lib/supabase.js';

// ── Component imports ────────────────────────────────────────────────────────
import Mono          from './components/Mono.jsx';
import Divider       from './components/Divider.jsx';
import AILoader      from './components/AILoader.jsx';
import ProvinceSelect from './components/ProvinceSelect.jsx';
import Spotlight     from './components/Spotlight.jsx';
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
import MeetingEngine   from './modules/MeetingEngine.jsx';
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
  { id:"meetings",  icon:"🎙️", label:"Meetings Hub",   color:C.blue },
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
  // Déprioritisé — Copilot est maintenant l'entrée principale (situations détectées + templates intégrés).
  { id:"autoprompt",   icon:"🧩",  label:"Prompt AI",  color:C.purple },
];

// ── Auth — Supabase magic-link login ─────────────────────────────────────────
// Allow-list lives in Supabase (public.allowed_users) and is enforced via RLS:
// authenticated users can only read their own email row. See src/lib/auth.js.

function AccessDeniedScreen({ email, onRetry }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", background:C.bg, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ width:340, textAlign:"center" }}>
        <div style={{ width:44, height:44, background:C.red, borderRadius:10,
          display:"inline-flex", alignItems:"center", justifyContent:"center",
          fontSize:20, marginBottom:12 }}>⛔</div>
        <div style={{ fontWeight:700, fontSize:18, color:C.text, marginBottom:6 }}>Access denied</div>
        <div style={{ fontSize:12, color:C.textM, marginBottom:20, lineHeight:1.5 }}>
          {email ? <>L'adresse <b>{email}</b> n'est pas autorisée.</> : "Cette adresse n'est pas autorisée."}
        </div>
        <button onClick={onRetry}
          style={{ ...css.btn(C.em), padding:"10px 18px", fontSize:13 }}>
          Essayer une autre adresse
        </button>
      </div>
    </div>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState("");

  const send = async () => {
    if (!email || status === "sending") return;
    setStatus("sending");
    setErrorMsg("");
    const res = await supaSignIn(email);
    if (res.ok) {
      setStatus("sent");
    } else {
      setStatus("error");
      setErrorMsg(
        res.reason === "invalid-email" ? "Email invalide."
        : res.reason === "no-client"   ? "Supabase non configuré."
        : "Échec de l'envoi du lien."
      );
    }
  };

  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", background:C.bg, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ width:340 }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ width:44, height:44, background:C.em, borderRadius:10,
            display:"inline-flex", alignItems:"center", justifyContent:"center",
            fontSize:20, marginBottom:12 }}>⚡</div>
          <div style={{ fontWeight:700, fontSize:18, color:C.text }}>HRBP OS</div>
          <div style={{ fontSize:12, color:C.textM, marginTop:4 }}>Samuel Chartrand</div>
        </div>
        <div style={{ background:C.surf, border:`1px solid ${C.border}`,
          borderRadius:12, padding:"24px 24px 20px" }}>
          <label style={{ fontSize:11, fontWeight:600, color:C.textM,
            letterSpacing:.8, textTransform:"uppercase", display:"block", marginBottom:6 }}>
            Email
          </label>
          <input type="email" value={email} onChange={e=>{setEmail(e.target.value);if(status==="error")setStatus("idle");}}
            onKeyDown={e=>e.key==="Enter"&&send()}
            autoFocus
            placeholder="you@example.com"
            disabled={status==="sending"||status==="sent"}
            style={{ ...css.input, marginBottom: 12 }} />
          <button onClick={send} disabled={status==="sending"||status==="sent"||!email}
            style={{ ...css.btn(C.em), width:"100%", padding:"11px", fontSize:13,
              opacity:(status==="sending"||status==="sent"||!email)?.6:1 }}>
            {status==="sending" ? "Envoi…" : status==="sent" ? "Lien envoyé ✓" : "Send magic link"}
          </button>
          {status==="sent" && (
            <div style={{ fontSize:11, color:C.textM, marginTop:12, lineHeight:1.5 }}>
              Vérifie ta boîte courriel et clique le lien pour te connecter.
            </div>
          )}
          {status==="error" && (
            <div style={{ fontSize:11, color:C.red, marginTop:10 }}>{errorMsg}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Root component (Source: HRBP_OS.jsx L.10743-11097) ────────────────────────
export default function HRBPOS() {
  const [supaSession, setSupaSession] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [denied, setDenied] = useState(null); // { email } when login email is not in allow-list
  const [module, setModule]   = useState("home");
  const [showMore, setShowMore] = useState(false);
  const [data, setData]       = useState({ cases:[], meetings:[], signals:[], decisions:[], coaching:[], exits:[], investigations:[], briefs:[], prep1on1:[], sentRecaps:[], portfolio:[], leaders:{}, radars:[], nextWeekLocks:[], plans306090:[], profile:{ defaultProvince:"QC" } });
  const [toast, setToast]     = useState(false);
  const [loaded, setLoaded]   = useState(false);
  const [focusCaseId,          setFocusCaseId]          = useState(null); // inter-module focus bridge
  const [focusMeetingId,       setFocusMeetingId]       = useState(null); // inter-module focus bridge
  const [focusExitId,          setFocusExitId]          = useState(null); // inter-module focus bridge
  const [focusSignalId,        setFocusSignalId]        = useState(null); // inter-module focus bridge
  const [focusDecisionId,      setFocusDecisionId]      = useState(null); // inter-module focus bridge
  const [focusInvestigationId, setFocusInvestigationId] = useState(null); // inter-module focus bridge

  // Unified navigation handler — propagates focus IDs from ctx to root state, then switches module.
  const handleNavigate = useCallback((id, ctx) => {
    if (ctx?.focusCaseId)          setFocusCaseId(ctx.focusCaseId);
    if (ctx?.focusMeetingId)       setFocusMeetingId(ctx.focusMeetingId);
    if (ctx?.focusExitId)          setFocusExitId(ctx.focusExitId);
    if (ctx?.focusSignalId)        setFocusSignalId(ctx.focusSignalId);
    if (ctx?.focusDecisionId)      setFocusDecisionId(ctx.focusDecisionId);
    if (ctx?.focusInvestigationId) setFocusInvestigationId(ctx.focusInvestigationId);
    setModule(id);
  }, []);

  // Load all data on mount — always resolves even if storage fails
  useEffect(() => {
    const defaults = { cases:[], meetings:[], signals:[], decisions:[], coaching:[], exits:[], investigations:[], briefs:[], prep1on1:[], sentRecaps:[], portfolio:[], leaders:{}, radars:[], nextWeekLocks:[], plans306090:[], profile:{ defaultProvince:"QC" } };
    const timeout = setTimeout(() => setLoaded(true), 1500);
    Promise.allSettled(
      Object.entries(SK).map(async ([k, sk]) => {
        try {
          let v = await sGet(sk);
          if (k === "cases" && Array.isArray(v)) v = v.map(normalizeCase).filter(Boolean);
          else if (k === "investigations" && Array.isArray(v)) v = v.map(normalizeInvestigation).filter(Boolean);
          return [k, v ?? defaults[k]];
        }
        catch { return [k, defaults[k]]; }
      })
    ).then(async results => {
      clearTimeout(timeout);
      const entries = results.map(r => r.status === "fulfilled" ? r.value : null).filter(Boolean);
      if (entries.length > 0) setData(d => ({ ...d, ...Object.fromEntries(entries) }));
      setLoaded(true);
      try {
        const res = await supaLoadCases();
        if (res && res.ok && Array.isArray(res.data) && res.data.length > 0) {
          const normalized = res.data.map(normalizeCase).filter(Boolean);
          if (normalized.length > 0) setData(d => ({ ...d, cases: normalized }));
        } else if (res && !res.ok && res.reason !== "no-client") {
          console.warn("[supabase] loadCases failed:", res.reason, res.error);
        }
      } catch (err) {
        console.warn("[supabase] loadCases threw:", err);
      }
      try {
        const res = await supaLoadMeetings();
        if (res && res.ok && Array.isArray(res.data) && res.data.length > 0) {
          setData(d => ({ ...d, meetings: res.data }));
        } else if (res && !res.ok && res.reason !== "no-client") {
          console.warn("[supabase] loadMeetings failed:", res.reason, res.error);
        }
      } catch (err) {
        console.warn("[supabase] loadMeetings threw:", err);
      }
      try {
        const res = await supaLoadInvestigations();
        if (res && res.ok && Array.isArray(res.data) && res.data.length > 0) {
          const normalized = res.data.map(normalizeInvestigation).filter(Boolean);
          if (normalized.length > 0) setData(d => ({ ...d, investigations: normalized }));
        } else if (res && !res.ok && res.reason !== "no-client") {
          console.warn("[supabase] loadInvestigations failed:", res.reason, res.error);
        }
      } catch (err) {
        console.warn("[supabase] loadInvestigations threw:", err);
      }
      try {
        const res = await supaLoadBriefs();
        if (res && res.ok && Array.isArray(res.data) && res.data.length > 0) {
          setData(d => ({ ...d, briefs: res.data }));
        } else if (res && !res.ok && res.reason !== "no-client") {
          console.warn("[supabase] loadBriefs failed:", res.reason, res.error);
        }
      } catch (err) {
        console.warn("[supabase] loadBriefs threw:", err);
      }
    }).catch(() => { clearTimeout(timeout); setLoaded(true); });
  }, []);

  // Supabase session detection — non-blocking. Logs auth state, exposes
  // window.login(email)/window.logout() as console-only triggers until UI lands.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Magic-link callback: if URL carries Supabase auth params, exchange them
      // for a session, log it, then strip the params from the address bar.
      if (typeof window !== "undefined") {
        const href = window.location.href;
        const search = window.location.search || "";
        const hash = window.location.hash || "";
        const hasAuthParams =
          /[?&]code=/.test(search) ||
          /[?&]access_token=/.test(search) ||
          /[#&]access_token=/.test(hash);
        if (hasAuthParams) {
          const ex = await supaExchangeCodeForSession(href);
          if (cancelled) return;
          if (!ex.ok && ex.reason !== "no-client") {
            console.warn("[auth] exchangeCodeForSession failed:", ex.reason, ex.error);
          }
          try {
            window.history.replaceState({}, document.title, window.location.pathname);
          } catch (err) {
            console.warn("[auth] URL cleanup failed:", err);
          }
        }
      }
      const res = await supaGetSession();
      if (cancelled) return;
      if (res.ok && res.session) {
        const email = res.session.user?.email;
        const check = await supaIsEmailAllowed(email);
        if (cancelled) return;
        if (check.ok && check.allowed) {
          setSupaSession(res.session);
        } else {
          if (!check.ok && check.reason !== "no-client") {
            console.warn("[auth] allow-list check failed:", check.reason, check.error);
          }
          setDenied({ email });
          await supaSignOut();
        }
      } else if (!res.ok && res.reason !== "no-client") {
        console.warn("[auth] getSession failed:", res.reason, res.error);
      }
      setSessionChecked(true);
    })();
    const unsubscribe = supaOnAuthStateChange(async (_event, session) => {
      if (session) {
        const email = session.user?.email;
        const check = await supaIsEmailAllowed(email);
        if (!(check.ok && check.allowed)) {
          if (!check.ok && check.reason !== "no-client") {
            console.warn("[auth] allow-list check failed:", check.reason, check.error);
          }
          setDenied({ email });
          setSupaSession(null);
          supaSignOut();
          return;
        }
      }
      setSupaSession(session ?? null);
    });
    if (typeof window !== "undefined") {
      window.login = async (email) => {
        const res = await supaSignIn(email);
        if (!res.ok) console.warn("[auth] signIn failed:", res.reason, res.error);
        return res;
      };
      window.logout = async () => {
        const res = await supaSignOut();
        if (!res.ok) console.warn("[auth] signOut failed:", res.reason, res.error);
        return res;
      };
    }
    return () => { cancelled = true; unsubscribe(); };
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
          let value = restored[k];
          if (k === "cases" && Array.isArray(value)) value = value.map(normalizeCase).filter(Boolean);
          else if (k === "investigations" && Array.isArray(value)) value = value.map(normalizeInvestigation).filter(Boolean);
          if (skKey) await sSet(skKey, value);
          updates[k] = value;
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
    let toSave = value;
    if (key === "cases" && Array.isArray(value)) toSave = value.map(normalizeCase).filter(Boolean);
    else if (key === "investigations" && Array.isArray(value)) toSave = value.map(normalizeInvestigation).filter(Boolean);
    await sSet(skKey, toSave);
    setData(d => ({ ...d, [key]: toSave }));
    showToast();
    if (key === "cases") {
      supaSaveCases(toSave).then(res => {
        if (res && !res.ok && res.reason !== "no-client") {
          console.warn("[supabase] saveCases failed:", res.reason, res.error);
        }
      }).catch(err => {
        console.warn("[supabase] saveCases threw:", err);
      });
    } else if (key === "meetings") {
      supaSaveMeetings(toSave).then(res => {
        if (res && !res.ok && res.reason !== "no-client") {
          console.warn("[supabase] saveMeetings failed:", res.reason, res.error);
        }
      }).catch(err => {
        console.warn("[supabase] saveMeetings threw:", err);
      });
    } else if (key === "investigations") {
      supaSaveInvestigations(toSave).then(res => {
        if (res && !res.ok && res.reason !== "no-client") {
          console.warn("[supabase] saveInvestigations failed:", res.reason, res.error);
        }
      }).catch(err => {
        console.warn("[supabase] saveInvestigations threw:", err);
      });
    } else if (key === "briefs") {
      supaSaveBriefs(toSave).then(res => {
        if (res && !res.ok && res.reason !== "no-client") {
          console.warn("[supabase] saveBriefs failed:", res.reason, res.error);
        }
      }).catch(err => {
        console.warn("[supabase] saveBriefs threw:", err);
      });
    }
  }, []);

  const handleSaveMeeting = useCallback(async (session, caseEntry) => {
    if ((data.meetings||[]).some(m => m.id === session.id)) return;
    const newMeetings = [...(data.meetings||[]), session];
    await sSet(SK.meetings, newMeetings);
    setData(d => ({ ...d, meetings: newMeetings }));
    supaSaveMeetings(newMeetings).then(res => {
      if (res && !res.ok && res.reason !== "no-client") {
        console.warn("[supabase] saveMeetings failed:", res.reason, res.error);
      }
    }).catch(err => {
      console.warn("[supabase] saveMeetings threw:", err);
    });
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
      const normalizedNewCase = normalizeCase(newCase);
      const newCases = normalizedNewCase ? [...(data.cases||[]), normalizedNewCase] : (data.cases||[]);
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
    supaSaveMeetings(newMeetings).then(res => {
      if (res && !res.ok && res.reason !== "no-client") {
        console.warn("[supabase] saveMeetings failed:", res.reason, res.error);
      }
    }).catch(err => {
      console.warn("[supabase] saveMeetings threw:", err);
    });
    showToast();
  }, [data]);

  const allNav  = [...NAV_MAIN, ...NAV_MORE];
  const activeNav = allNav.find(n => n.id === module);

  if (hasSupabase && denied) return <AccessDeniedScreen email={denied.email} onRetry={() => setDenied(null)} />;
  if (hasSupabase && !sessionChecked) {
    return <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", background:C.bg }}><AILoader label="Chargement"/></div>;
  }
  if (hasSupabase && !supaSession) return <LoginScreen />;

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

        {supaSession && (
          <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}`,
            display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
            <span style={{ fontSize:10, color:C.textD, overflow:"hidden",
              textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>
              {supaSession.user?.email || "session"}
            </span>
            <button onClick={async () => { await supaSignOut(); }}
              style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6,
                padding:"4px 8px", fontSize:10, color:C.textM, cursor:"pointer",
                fontFamily:"'DM Sans',sans-serif", flexShrink:0 }}>
              Logout
            </button>
          </div>
        )}
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
          ) : module === "home"         ? <ModuleHome data={data} onNavigate={handleNavigate}/>
          : module === "radar"          ? <ModuleRadar data={data} onSave={handleSave}/>
          : module === "copilot"        ? <ModuleCopilot data={data}/>
          : module === "meetings"       ? <ModuleMeetings data={data} onSave={handleSave} onSaveSession={handleSaveMeeting} onUpdateMeeting={handleUpdateMeeting} onNavigate={handleNavigate} focusMeetingId={focusMeetingId} onClearFocus={() => setFocusMeetingId(null)}/>
          : module === "prep1on1"       ? <Module1on1Prep data={data} onSave={handleSave} onNavigate={handleNavigate}/>
          : module === "cases"          ? <ModuleCases data={data} onSave={handleSave} onNavigate={handleNavigate} focusCaseId={focusCaseId} onClearFocus={() => setFocusCaseId(null)}/>
          : module === "signals"        ? <ModuleSignals data={data} onSave={handleSave} focusSignalId={focusSignalId} onClearFocus={() => setFocusSignalId(null)}/>
          : module === "brief"          ? <ModuleBrief data={data} onSave={handleSave}/>
          : module === "decisions"      ? <ModuleDecisions data={data} onSave={handleSave} onNavigate={handleNavigate} focusDecisionId={focusDecisionId} onClearFocus={() => setFocusDecisionId(null)}/>
          : module === "coaching"       ? <ModuleCoaching data={data} onSave={handleSave}/>
          : module === "investigation"  ? <ModuleInvestigation data={data} onSave={handleSave} onNavigate={handleNavigate} focusInvestigationId={focusInvestigationId} onClearFocus={() => setFocusInvestigationId(null)}/>
          : module === "exit"           ? <ModuleExit data={data} onSave={handleSave} focusExitId={focusExitId} onClearFocus={() => setFocusExitId(null)}/>
          : module === "workshop"       ? <ModuleWorkshop />
          : module === "autoprompt"     ? <ModuleAutoPrompt data={data}/>
          : module === "convkit"        ? <ModuleConvKit />
          : module === "plans306090"    ? <Module306090 data={data} onSave={handleSave}/>
          : module === "knowledge"      ? <ModuleKnowledge />
          : module === "leaders"        ? <ModuleLeader data={data} onSave={handleSave} onNavigate={handleNavigate}/>
          : null}
        </div>
      </div>

      <SavedToast show={toast}/>
      <Spotlight data={data} onNavigate={handleNavigate}/>
    </div>
  );
}
