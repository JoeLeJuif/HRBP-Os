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
import { bestEffortAudit, AUDIT_ACTIONS } from './services/auditLog.js';
import { createCaseTask as supaCreateCaseTask } from './services/caseTasks.js';
import { signIn as supaSignIn, signOut as supaSignOut, getSession as supaGetSession, onAuthStateChange as supaOnAuthStateChange, exchangeCodeForSession as supaExchangeCodeForSession, isEmailAllowed as supaIsEmailAllowed } from './lib/auth.js';
import { fetchOrCreateProfile, fetchOrganization, isOrgStatusActive } from './lib/profile.js';
import { fetchSubscription, openBillingPortal, startStripeCheckout, isStripeConfigured } from './services/billing.js';
import { getBillingAccess } from './services/billingAccess.js';
import { checkUsage } from './services/planLimits.js';
import { hasSupabase } from './lib/supabase.js';
import { useT } from './lib/i18n.js';
import { isCaseActive } from './utils/caseStatus.js';

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
import ModuleAdmin     from './modules/Admin.jsx';

// ── Prompts (filled in at Bloc 2) — imported per module ───────────────────────
// (each module file imports its own prompts directly)

function SavedToast({ show }) {
  const { t } = useT();
  if (!show) return null;
  return <div style={{ position:"fixed", bottom:20, right:20, background:C.em, color:C.bg,
    borderRadius:8, padding:"8px 16px", fontSize:12, fontWeight:700, zIndex:9999,
    fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 20px #10b98140" }}>
    {t("common.savedToast")}
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

function PendingApprovalScreen({ email, onSignOut }) {
  const { t } = useT();
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", background:C.bg, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ width:360, textAlign:"center" }}>
        <div style={{ width:44, height:44, background:C.amber, borderRadius:10,
          display:"inline-flex", alignItems:"center", justifyContent:"center",
          fontSize:20, marginBottom:12 }}>⏳</div>
        <div style={{ fontWeight:700, fontSize:18, color:C.text, marginBottom:6 }}>
          {t("auth.pending.title")}
        </div>
        <div style={{ fontSize:12, color:C.textM, marginBottom:20, lineHeight:1.5 }}>
          {email ? <>{t("auth.pending.bodyEmailPrefix")}<b>{email}</b>{t("auth.pending.bodyEmailSuffix")}</>
                 : t("auth.pending.bodyAnon")}
        </div>
        <button onClick={onSignOut}
          style={{ ...css.btn(C.em, true), padding:"9px 16px", fontSize:12 }}>
          {t("auth.signOut")}
        </button>
      </div>
    </div>
  );
}

function OrgInactiveScreen({ email, onSignOut, orgName, orgStatus }) {
  const { t } = useT();
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", background:C.bg, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ width:400, textAlign:"center" }}>
        <div style={{ width:44, height:44, background:C.red, borderRadius:10,
          display:"inline-flex", alignItems:"center", justifyContent:"center",
          fontSize:20, marginBottom:12 }}>⛔</div>
        <div style={{ fontWeight:700, fontSize:18, color:C.text, marginBottom:6 }}>
          {t("auth.orgInactive.title")}
        </div>
        <div style={{ fontSize:12, color:C.textM, marginBottom:14, lineHeight:1.5 }}>
          {t("auth.orgInactive.body")}
        </div>
        {(orgName || orgStatus) && (
          <div style={{ fontSize:11, color:C.textD, marginBottom:18 }}>
            {orgName && <div>{orgName}</div>}
            {orgStatus && <div style={{ fontFamily:"'DM Mono',monospace" }}>status: {orgStatus}</div>}
            {email && <div style={{ marginTop:4 }}>{email}</div>}
          </div>
        )}
        <button onClick={onSignOut}
          style={{ ...css.btn(C.em, true), padding:"9px 16px", fontSize:12 }}>
          {t("auth.signOut")}
        </button>
      </div>
    </div>
  );
}

function LimitedAccessScreen({ subscription, isAdmin, onGoAdmin, onSignOut }) {
  const { t } = useT();
  const [busyKind, setBusyKind] = useState(null); // "portal" | "upgrade" | null
  const [errMsg, setErrMsg]     = useState("");
  const hasStripeCustomer = !!subscription?.stripe_customer_id;
  const stripeEnabled = isStripeConfigured();

  const onPortal = async () => {
    setBusyKind("portal");
    setErrMsg("");
    const res = await openBillingPortal();
    if (!res.ok) {
      setBusyKind(null);
      setErrMsg(res.message || res.reason || "error");
      return;
    }
    window.location.assign(res.url);
  };
  const onUpgrade = async () => {
    setBusyKind("upgrade");
    setErrMsg("");
    const res = await startStripeCheckout();
    if (!res.ok) {
      setBusyKind(null);
      setErrMsg(res.message || res.reason || "error");
      return;
    }
    window.location.assign(res.url);
  };

  const statusLabel = subscription?.status || "—";

  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      width:"100%", height:"100%", fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ width:440, textAlign:"center", padding:"24px" }}>
        <div style={{ width:48, height:48, background:C.amber, borderRadius:10,
          display:"inline-flex", alignItems:"center", justifyContent:"center",
          fontSize:22, marginBottom:14 }}>⚠️</div>
        <div style={{ fontWeight:700, fontSize:18, color:C.text, marginBottom:8 }}>
          {t("auth.billingLimited.title")}
        </div>
        <div style={{ fontSize:13, color:C.textM, marginBottom:10, lineHeight:1.5 }}>
          {t("auth.billingLimited.body")}
        </div>
        <div style={{ fontSize:11, color:C.textD, marginBottom:18,
          fontFamily:"'DM Mono',monospace" }}>
          status: {statusLabel}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8, alignItems:"center" }}>
          {hasStripeCustomer ? (
            <button onClick={onPortal} disabled={busyKind!==null}
              style={{ ...css.btn(C.blue), padding:"10px 18px", fontSize:13,
                opacity: busyKind ? .6 : 1, cursor: busyKind ? "not-allowed" : "pointer" }}>
              {busyKind==="portal" ? "…" : t("auth.billingLimited.portal")}
            </button>
          ) : stripeEnabled ? (
            <button onClick={onUpgrade} disabled={busyKind!==null}
              style={{ ...css.btn(C.em), padding:"10px 18px", fontSize:13,
                opacity: busyKind ? .6 : 1, cursor: busyKind ? "not-allowed" : "pointer" }}>
              {busyKind==="upgrade" ? "…" : t("auth.billingLimited.upgrade")}
            </button>
          ) : null}
          {isAdmin && (
            <button onClick={onGoAdmin}
              style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8,
                padding:"8px 14px", fontSize:12, color:C.textM, cursor:"pointer",
                fontFamily:"'DM Sans',sans-serif" }}>
              {t("auth.billingLimited.goAdmin")}
            </button>
          )}
          {!isAdmin && !hasStripeCustomer && !stripeEnabled && (
            <div style={{ fontSize:11, color:C.textD, marginTop:6, lineHeight:1.5 }}>
              {t("auth.billingLimited.noAdmin")}
            </div>
          )}
          {errMsg && (
            <div style={{ fontSize:11, color:C.red, marginTop:6 }}>{errMsg}</div>
          )}
          <div style={{ fontSize:11, color:C.textD, marginTop:14, lineHeight:1.5 }}>
            {t("auth.billingLimited.hint")}
          </div>
        </div>
      </div>
    </div>
  );
}

function DisabledAccessScreen({ email, onSignOut }) {
  const { t } = useT();
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", background:C.bg, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ width:380, textAlign:"center" }}>
        <div style={{ width:44, height:44, background:C.red, borderRadius:10,
          display:"inline-flex", alignItems:"center", justifyContent:"center",
          fontSize:20, marginBottom:12 }}>⛔</div>
        <div style={{ fontWeight:700, fontSize:18, color:C.text, marginBottom:6 }}>
          {t("auth.disabled.title")}
        </div>
        <div style={{ fontSize:12, color:C.textM, marginBottom:20, lineHeight:1.5 }}>
          {t("auth.disabled.body")}
          {email && <div style={{ marginTop:6, color:C.textD }}>{email}</div>}
        </div>
        <button onClick={onSignOut}
          style={{ ...css.btn(C.em, true), padding:"9px 16px", fontSize:12 }}>
          {t("auth.signOut")}
        </button>
      </div>
    </div>
  );
}

function AccessDeniedScreen({ email, onRetry }) {
  const { t } = useT();
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", background:C.bg, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ width:340, textAlign:"center" }}>
        <div style={{ width:44, height:44, background:C.red, borderRadius:10,
          display:"inline-flex", alignItems:"center", justifyContent:"center",
          fontSize:20, marginBottom:12 }}>⛔</div>
        <div style={{ fontWeight:700, fontSize:18, color:C.text, marginBottom:6 }}>{t("auth.denied.title")}</div>
        <div style={{ fontSize:12, color:C.textM, marginBottom:20, lineHeight:1.5 }}>
          {email ? <>{t("auth.denied.bodyEmailPrefix")}<b>{email}</b>{t("auth.denied.bodyEmailSuffix")}</> : t("auth.denied.bodyAnon")}
        </div>
        <button onClick={onRetry}
          style={{ ...css.btn(C.em), padding:"10px 18px", fontSize:13 }}>
          {t("auth.tryAnother")}
        </button>
      </div>
    </div>
  );
}

function LoginScreen() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [errorReason, setErrorReason] = useState("");

  const send = async () => {
    if (!email || status === "sending") return;
    setStatus("sending");
    setErrorReason("");
    const res = await supaSignIn(email);
    if (res.ok) {
      setStatus("sent");
    } else {
      setStatus("error");
      setErrorReason(res.reason || "send-failed");
    }
  };

  const errorMsg =
    errorReason === "invalid-email" ? t("auth.login.errInvalid")
    : errorReason === "no-client"   ? t("auth.login.errNoClient")
    : errorReason ? t("auth.login.errSendFailed")
    : "";

  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", background:C.bg, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ width:340 }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ width:44, height:44, background:C.em, borderRadius:10,
            display:"inline-flex", alignItems:"center", justifyContent:"center",
            fontSize:20, marginBottom:12 }}>⚡</div>
          <div style={{ fontWeight:700, fontSize:18, color:C.text }}>{t("auth.login.brand")}</div>
          <div style={{ fontSize:12, color:C.textM, marginTop:4 }}>{t("auth.login.subtitle")}</div>
        </div>
        <div style={{ background:C.surf, border:`1px solid ${C.border}`,
          borderRadius:12, padding:"24px 24px 20px" }}>
          <label style={{ fontSize:11, fontWeight:600, color:C.textM,
            letterSpacing:.8, textTransform:"uppercase", display:"block", marginBottom:6 }}>
            {t("auth.login.emailLabel")}
          </label>
          <input type="email" value={email} onChange={e=>{setEmail(e.target.value);if(status==="error")setStatus("idle");}}
            onKeyDown={e=>e.key==="Enter"&&send()}
            autoFocus
            placeholder={t("auth.login.emailPh")}
            disabled={status==="sending"||status==="sent"}
            style={{ ...css.input, marginBottom: 12 }} />
          <button onClick={send} disabled={status==="sending"||status==="sent"||!email}
            style={{ ...css.btn(C.em), width:"100%", padding:"11px", fontSize:13,
              opacity:(status==="sending"||status==="sent"||!email)?.6:1 }}>
            {status==="sending" ? t("auth.login.sending") : status==="sent" ? t("auth.login.sent") : t("auth.login.send")}
          </button>
          {status==="sent" && (
            <div style={{ fontSize:11, color:C.textM, marginTop:12, lineHeight:1.5 }}>
              {t("auth.login.checkInbox")}
            </div>
          )}
          {status==="error" && (
            <div style={{ fontSize:11, color:C.red, marginTop:10 }}>{errorMsg}</div>
          )}
        </div>
        <div style={{ marginTop:14, textAlign:"center", fontSize:12 }}>
          <a href="/signup" style={{ color:C.em, textDecoration:"none", fontWeight:600 }}>Create workspace</a>
        </div>
        <div style={{ marginTop:12, display:"flex", justifyContent:"center", gap:14,
          flexWrap:"wrap", fontSize:11 }}>
          <a href="/privacy" style={{ color:C.textM, textDecoration:"none" }}>Confidentialité</a>
          <a href="/terms" style={{ color:C.textM, textDecoration:"none" }}>Conditions</a>
          <a href="/subprocessors" style={{ color:C.textM, textDecoration:"none" }}>Sous-traitants</a>
          <a href="/support" style={{ color:C.textM, textDecoration:"none" }}>Support</a>
        </div>
      </div>
    </div>
  );
}

// ── Root component (Source: HRBP_OS.jsx L.10743-11097) ────────────────────────
export default function HRBPOS() {
  const { t, lang, setLang } = useT();
  const [supaSession, setSupaSession] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [denied, setDenied] = useState(null); // { email } when login email is not in allow-list
  const [userProfile, setUserProfile] = useState(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [userOrganization, setUserOrganization] = useState(null);
  const [orgChecked, setOrgChecked] = useState(false);
  const [userSubscription, setUserSubscription] = useState(null);
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);
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
      // Merge remote into local by id, preferring whichever side has the
      // newer updatedAt. Prevents the hydration race where edits made during
      // the localStorage→Supabase load window would be silently overwritten.
      const _ts = (x) => Date.parse(x?.updatedAt || x?.savedAt || x?.createdAt || 0) || 0;
      // Phase 3 Batch 3.2 — deletion-shadow logic is now active.
      // A remote row with status:"deleted" is a tombstone produced by
      // saveCases reconciliation on another device (or this one). When
      // such a shadow arrives:
      //   1. The shadow itself is NOT added to the merge output.
      //   2. The matching local row (if any) is dropped.
      // This propagates the deletion across devices without leaking any
      // row carrying status:"deleted" into the merged array. Defense in
      // depth: the consumer-side post-merge filter below also strips any
      // status:"deleted" survivor before setData.
      const _isRemoteDeletionShadow = (r) => r && r.status === "deleted";
      const mergeById = (local, remote) => {
        const out = new Map();
        const deletedIds = new Set();
        for (const r of remote) {
          if (!r || r.id == null) continue;
          const id = String(r.id);
          if (_isRemoteDeletionShadow(r)) { deletedIds.add(id); continue; }
          out.set(id, r);
        }
        for (const l of local) {
          if (!l || l.id == null) continue;
          const id = String(l.id);
          if (deletedIds.has(id)) continue; // remote deletion drops local
          const r = out.get(id);
          if (!r) { out.set(id, l); continue; }
          out.set(id, _ts(l) > _ts(r) ? l : r);
        }
        return Array.from(out.values());
      };
      // Defensive post-merge filter — if anything bypassed mergeById's
      // shadow handling, this still guarantees no `status:"deleted"` row
      // ever reaches `data.*`. Cheap O(n) per loader.
      const stripDeleted = (arr) => arr.filter(x => !x || x.status !== "deleted");
      try {
        const res = await supaLoadCases();
        if (res && res.ok && Array.isArray(res.data) && res.data.length > 0) {
          const normalized = res.data.map(normalizeCase).filter(Boolean);
          if (normalized.length > 0) setData(d => ({ ...d, cases: stripDeleted(mergeById(d.cases || [], normalized)) }));
        } else if (res && !res.ok && res.reason !== "no-client") {
          console.warn("[supabase] loadCases failed:", res.reason, res.error);
        }
      } catch (err) {
        console.warn("[supabase] loadCases threw:", err);
      }
      try {
        const res = await supaLoadMeetings();
        if (res && res.ok && Array.isArray(res.data) && res.data.length > 0) {
          setData(d => ({ ...d, meetings: stripDeleted(mergeById(d.meetings || [], res.data)) }));
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
          if (normalized.length > 0) setData(d => ({ ...d, investigations: stripDeleted(mergeById(d.investigations || [], normalized)) }));
        } else if (res && !res.ok && res.reason !== "no-client") {
          console.warn("[supabase] loadInvestigations failed:", res.reason, res.error);
        }
      } catch (err) {
        console.warn("[supabase] loadInvestigations threw:", err);
      }
      try {
        const res = await supaLoadBriefs();
        if (res && res.ok && Array.isArray(res.data) && res.data.length > 0) {
          setData(d => ({ ...d, briefs: stripDeleted(mergeById(d.briefs || [], res.data)) }));
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
    // Dev-only console helpers — stripped from prod builds via the
    // `import.meta.env.DEV` define in build.js (esbuild dead-code elimination).
    if (import.meta.env.DEV && typeof window !== "undefined") {
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

  // Fetch the current user's profile after session is established. If no row
  // exists in public.profiles, fetchOrCreateProfile inserts one with defaults
  // (status:"pending", role:"hrbp"). Falls back to in-memory pending if the
  // insert fails so the UI never gets stuck.
  useEffect(() => {
    if (!hasSupabase) { setProfileChecked(true); return; }
    if (!supaSession) {
      setUserProfile(null);
      setProfileChecked(false);
      setUserOrganization(null);
      setOrgChecked(false);
      setUserSubscription(null);
      setSubscriptionChecked(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetchOrCreateProfile(supaSession.user);
      if (cancelled) return;
      if (res.ok) {
        setUserProfile(res.profile);
      } else {
        console.warn("[profile] fetchOrCreateProfile failed:", res.reason, res.error);
        setUserProfile({
          id: supaSession.user?.id ?? null,
          email: supaSession.user?.email ?? null,
          status: "pending",
          role: "hrbp",
          organization_id: null,
        });
      }
      setProfileChecked(true);
    })();
    return () => { cancelled = true; };
  }, [supaSession]);

  // Fetch the user's organization row (just the status field matters for the
  // gate). Only runs for approved users with an org_id assigned — other
  // statuses are already blocked by the pending/disabled screens, and a missing
  // org_id means there is no org subscription to check.
  useEffect(() => {
    if (!hasSupabase) { setOrgChecked(true); return; }
    if (!profileChecked) return;
    if (!userProfile || userProfile.status !== "approved" || !userProfile.organization_id) {
      setUserOrganization(null);
      setOrgChecked(true);
      return;
    }
    let cancelled = false;
    setOrgChecked(false);
    (async () => {
      const res = await fetchOrganization(userProfile.organization_id);
      if (cancelled) return;
      if (res.ok) {
        setUserOrganization(res.organization);
      } else {
        // Fail-open: if we can't read the org row (RLS hiccup, network), don't
        // lock the user out. RLS still gates every downstream read/write.
        if (res.reason !== "no-client") {
          console.warn("[org] fetchOrganization failed:", res.reason, res.error);
        }
        setUserOrganization(null);
      }
      setOrgChecked(true);
    })();
    return () => { cancelled = true; };
  }, [profileChecked, userProfile]);

  // Fetch the org's subscription row so we can gate operational modules behind
  // billing status. Re-runs whenever the profile/org changes so a webhook-driven
  // recovery (past_due → active) shows up on next refresh/state update.
  useEffect(() => {
    if (!hasSupabase) { setSubscriptionChecked(true); return; }
    if (!profileChecked) return;
    if (!userProfile || userProfile.status !== "approved" || !userProfile.organization_id) {
      setUserSubscription(null);
      setSubscriptionChecked(true);
      return;
    }
    let cancelled = false;
    setSubscriptionChecked(false);
    (async () => {
      const res = await fetchSubscription(userProfile.organization_id);
      if (cancelled) return;
      if (res.ok) {
        setUserSubscription(res.subscription || null);
      } else {
        // Fail-closed: unable to verify billing → treat as limited. Surfaces
        // the same screen as a real past_due, with a status of null so the
        // header reads "—".
        if (res.reason !== "no-client") {
          console.warn("[billing] fetchSubscription failed:", res.reason, res.error);
        }
        setUserSubscription(null);
      }
      setSubscriptionChecked(true);
    })();
    return () => { cancelled = true; };
  }, [profileChecked, userProfile]);

  const showToast = () => { setToast(true); setTimeout(() => setToast(false), 2000); };

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
    // Sprint 3 — Étape 4: enforce per-plan quota on new meetings.
    const meetingCheck = checkUsage(userSubscription, "meetings", (data.meetings||[]).length, userProfile?.email);
    if (!meetingCheck.allowed) {
      if (typeof window !== "undefined" && typeof window.alert === "function") window.alert(meetingCheck.message);
      return;
    }
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
      // Sprint 3 — Étape 4: skip the chained case auto-create when the case
      // quota is reached. The meeting itself was already saved above.
      const caseCheck = checkUsage(userSubscription, "cases", (data.cases||[]).length, userProfile?.email);
      if (!caseCheck.allowed) {
        if (typeof window !== "undefined" && typeof window.alert === "function") window.alert(caseCheck.message);
        return;
      }
      const newCase = {
        id: Date.now().toString(),
        title: caseEntry.title || session.analysis?.meetingTitle,
        type: "conflict_ee",
        riskLevel: caseEntry.riskLevel || session.analysis?.overallRisk,
        status: "open",
        director: session.director,
        employee: "",
        department: "",
        openDate: session.savedAt,
        situation: caseEntry.situation,
        interventionsDone: caseEntry.interventionsDone,
        hrPosition: caseEntry.hrPosition,
        // Phase 3 Batch 2.12: nextFollowUp no longer stamped on the new
        // case row. The AI-extracted follow-up is captured as a case_task
        // below. normalizeCase still defaults missing values to "" on save.
        notes: caseEntry.notes,
        actions: (session.analysis?.actions||[]).map(a => ({ ...a, done:false })),
        updatedAt: session.savedAt,
      };
      const normalizedNewCase = normalizeCase(newCase);
      const newCases = normalizedNewCase ? [...(data.cases||[]), normalizedNewCase] : (data.cases||[]);
      await sSet(SK.cases, newCases);
      setData(d => ({ ...d, cases: newCases }));
      supaSaveCases(newCases).then(res => {
        if (res && !res.ok && res.reason !== "no-client") {
          console.warn("[supabase] saveCases failed:", res.reason, res.error);
          return;
        }
        // Phase 3 Batch 2.9 + 2.12: the AI-extracted `caseEntry.nextFollowUp`
        // is captured as a case_task linked to the new case (not as a field
        // on the case row anymore — Batch 2.12 stopped stamping it).
        // Chained after the case row commits so the task's RLS-protected
        // parent SELECT inside createCaseTask can see it.
        const followUpText = (caseEntry.nextFollowUp || "").trim();
        if (followUpText && res && res.ok && normalizedNewCase) {
          supaCreateCaseTask({
            case_id: normalizedNewCase.id,
            title: followUpText,
            due_date: caseEntry.dueDate || null,
          }).then(taskRes => {
            if (taskRes && !taskRes.ok && taskRes.reason !== "no-client") {
              console.warn("[case_tasks] auto-create from meeting failed:", taskRes.reason);
            }
          }).catch(err => {
            console.warn("[case_tasks] auto-create from meeting threw:", err);
          });
        }
      }).catch(err => {
        console.warn("[supabase] saveCases threw:", err);
      });
    }
    showToast();
  }, [data, userSubscription]);

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

  // Phase 2: single entry point for case status changes. The legacy `closure`
  // field is no longer written (Phase 3 Batch 1) — UI reads were swapped to
  // `c.status` in Phase 2.6, and existing rows still carry the old field for
  // back-compat. Optional `extraPatch` lets callers stamp co-located metadata
  // (archive flags, form-edit fields) atomically with the status change. The
  // status field itself is always written by this function and cannot be
  // overridden by extraPatch.
  const transitionCase = useCallback(async (caseId, newStatus, extraPatch) => {
    const allCases = data.cases || [];
    const target = allCases.find(c => c.id === caseId);
    if (!target) {
      console.warn("[transition] case not found:", caseId);
      return { ok: false, reason: "not-found" };
    }
    const VALID = ["open", "in_progress", "waiting", "closed", "archived"];
    if (!VALID.includes(newStatus)) {
      console.warn("[transition] invalid status:", newStatus);
      return { ok: false, reason: "invalid-status" };
    }
    // Phase 3 Batch 3.1: deletion enters the system only via saveCases
    // reconciliation (an entire row removed from the local cases array
    // produces a status="deleted" tombstone). transitionCase explicitly
    // rejects "deleted" so no UI path can flip a case to that state.
    if (newStatus === "deleted") {
      console.warn("[transition] refusing direct transition to 'deleted' — delete via reconciliation only");
      return { ok: false, reason: "deleted-via-reconciliation-only" };
    }
    const prevStatus = target.status;
    const isNoOp = prevStatus === newStatus && !extraPatch;
    if (isNoOp) {
      return { ok: true, reason: "no-op", case: target };
    }
    const now = new Date().toISOString();
    const today = now.split("T")[0];
    const patched = { ...target, ...(extraPatch || {}), status: newStatus, updatedAt: today };
    if (newStatus === "closed") {
      patched.closedDate = target.closedDate || patched.closedDate || today;
      patched.closedAtTs = now;
    } else if (newStatus === "open" && prevStatus === "closed") {
      patched.reopenedAt = now;
    }
    const updated = allCases.map(c => c.id === caseId ? patched : c);
    await sSet(SK.cases, updated);
    setData(d => ({ ...d, cases: updated }));
    console.log(`[transition] case ${caseId}: ${prevStatus} → ${newStatus}`);
    // Audit emission for state changes is owned by this function (Phase 3
    // Batch 1). emitCaseAudit's status branch is suppressed downstream so
    // a single transition produces exactly one audit row, not two.
    if (prevStatus !== newStatus) {
      void bestEffortAudit({
        action: AUDIT_ACTIONS.CASE_STATE_CHANGED,
        entity_type: "case",
        entity_id: String(caseId),
        metadata: { prior_state: prevStatus, new_state: newStatus },
      });
    }
    supaSaveCases(updated).then(res => {
      if (res && !res.ok && res.reason !== "no-client") {
        console.warn("[supabase] saveCases failed:", res.reason, res.error);
      }
    }).catch(err => {
      console.warn("[supabase] saveCases threw:", err);
    });
    return { ok: true, prevStatus, newStatus, case: patched };
  }, [data]);

  if (hasSupabase && denied) return <AccessDeniedScreen email={denied.email} onRetry={() => setDenied(null)} />;
  if (hasSupabase && !sessionChecked) {
    return <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", background:C.bg }}><AILoader label="Chargement"/></div>;
  }
  if (hasSupabase && !supaSession) return <LoginScreen />;
  if (hasSupabase && supaSession && !profileChecked) {
    return <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", background:C.bg }}><AILoader label="Chargement"/></div>;
  }
  if (hasSupabase && supaSession && userProfile && userProfile.status === "disabled") {
    return <DisabledAccessScreen
      email={userProfile.email || supaSession.user?.email}
      onSignOut={async () => { await supaSignOut(); }} />;
  }
  if (hasSupabase && supaSession && userProfile && userProfile.status !== "approved") {
    return <PendingApprovalScreen
      email={userProfile.email || supaSession.user?.email}
      onSignOut={async () => { await supaSignOut(); }} />;
  }
  if (hasSupabase && supaSession && userProfile?.status === "approved"
      && userProfile.organization_id && !orgChecked) {
    return <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", background:C.bg }}><AILoader label="Chargement"/></div>;
  }
  if (hasSupabase && supaSession && userProfile?.status === "approved"
      && userOrganization && !isOrgStatusActive(userOrganization.status)) {
    return <OrgInactiveScreen
      email={userProfile.email || supaSession.user?.email}
      orgName={userOrganization.name}
      orgStatus={userOrganization.status}
      onSignOut={async () => { await supaSignOut(); }} />;
  }
  // Wait for the subscription probe before deciding whether to gate operational
  // modules. Avoids a one-frame flash of normal UI for past_due/canceled orgs.
  if (hasSupabase && supaSession && userProfile?.status === "approved"
      && userProfile.organization_id && !subscriptionChecked) {
    return <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", background:C.bg }}><AILoader label="Chargement"/></div>;
  }

  const isAdmin = !!(userProfile && userProfile.status === "approved"
    && (userProfile.role === "admin" || userProfile.role === "super_admin"));
  // Admin is no longer surfaced in the "Plus" sidebar — it now lives as a
  // ⚙️ button in the top bar (right side). Kept in allNav for top-bar label
  // resolution and safeModule routing.
  const ADMIN_NAV_ENTRY = { id:"admin", icon:"⚙️", label:"Admin", color:C.amber };
  const navMore = NAV_MORE;
  const allNav  = isAdmin ? [...NAV_MAIN, ...navMore, ADMIN_NAV_ENTRY] : [...NAV_MAIN, ...navMore];
  const activeNav = allNav.find(n => n.id === module);
  // Falls back to the nav entry's literal label when no translation exists for that id.
  const navLabel = (n) => { const k = `nav.${n.id}`; const v = t(k); return v === k ? n.label : v; };
  // Defense-in-depth: if a non-admin somehow lands on the admin route, bounce home.
  const safeModule = (module === "admin" && !isAdmin) ? "home" : module;
  // Billing gate — single source of truth via services/billingAccess.js. When
  // hasFullAccess is false (past_due, unpaid, canceled, incomplete, missing
  // row, …), operational modules render the LimitedAccessScreen instead. Only
  // the Admin route stays reachable so admins can manage the subscription
  // (and the BillingPanel inside it). The sidebar (with logout) is unaffected.
  // Skip the gate entirely for orgs with no_id (no subscription possible) —
  // those flows are still pre-org-onboarding.
  const billingAccess = (hasSupabase && userProfile?.organization_id)
    ? getBillingAccess(userSubscription, userProfile?.email)
    : { hasFullAccess: true, isLimited: false, status: null, reason: "billing_active" };
  const isLimited = billingAccess.isLimited;
  const gateModule = isLimited && safeModule !== "admin";

  return (
    <div style={{ display:"flex", height:"100vh", background:C.bg, fontFamily:"'DM Sans',sans-serif", color:C.text, overflow:"hidden" }}>
      <style>{FONTS}</style>
      <style>{`*{box-sizing:border-box}textarea,input,select{outline:none}@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}.fadein{animation:fadeIn .2s ease both}::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.borderL};border-radius:4px}`}</style>

      {/* ── SIDEBAR ── */}
      <div style={{ width:200, background:C.surf, borderRight:`1px solid ${C.border}`,
        display:"flex", flexDirection:"column", flexShrink:0, padding:"16px 10px",
        height:"100vh", overflowY:"auto" }}>

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
                color:module===n.id ? n.color : C.textM }}>{navLabel(n)}</span>
            </button>
          ))}

          <Divider my={8}/>

          {/* More toggle */}
          <button onClick={() => setShowMore(s=>!s)}
            style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px",
              background:"none", border:`1px solid ${C.border}`, borderRadius:8, cursor:"pointer",
              fontFamily:"'DM Sans',sans-serif", width:"100%", marginBottom:4 }}>
            <span style={{ fontSize:12, color:C.textM }}>{t("common.more")}</span>
            <span style={{ fontSize:10, color:C.textD }}>{showMore?"▲":"▼"}</span>
          </button>

          {showMore && navMore.map(n => (
            <button key={n.id} onClick={() => setModule(n.id)}
              style={{ display:"flex", alignItems:"center", gap:9, padding:"8px 12px",
                background:module===n.id ? n.color+"18":"none",
                border:`1px solid ${module===n.id ? n.color+"44" : "transparent"}`,
                borderRadius:8, cursor:"pointer", textAlign:"left", width:"100%",
                fontFamily:"'DM Sans',sans-serif", transition:"all .15s" }}>
              <span style={{ fontSize:13 }}>{n.icon}</span>
              <span style={{ fontSize:12, fontWeight:module===n.id?600:400,
                color:module===n.id ? n.color : C.textM }}>{navLabel(n)}</span>
            </button>
          ))}
        </div>

        {/* Province par défaut */}
        <div style={{ display:"flex", alignItems:"center", gap:8,
          padding:"7px 12px", marginBottom:8,
          background:C.surfL, borderRadius:8, border:`1px solid ${C.border}` }}>
          <span style={{ fontSize:11, color:C.textM, flex:1, fontWeight:500 }}>{t("common.province")}</span>
          <ProvinceSelect
            value={data.profile?.defaultProvince||"QC"}
            onChange={e => {
              const updated = { ...(data.profile||{}), defaultProvince: e.target.value };
              handleSave("profile", updated);
            }}
            style={{ padding:"4px 6px", fontSize:11, borderRadius:5 }}/>
        </div>

        {/* Footer stats */}
        <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12, marginTop:8 }}>
          {[
            [t("sidebar.stat.activeCases"),    (data.cases||[]).filter(isCaseActive).length, C.em],
            [t("sidebar.stat.meetings"),       (data.meetings||[]).length,       C.blue],
            [t("sidebar.stat.signals"),        (data.signals||[]).length,        C.purple],
            [t("sidebar.stat.decisions"),      (data.decisions||[]).length,      C.red],
            [t("sidebar.stat.coaching"),       (data.coaching||[]).length,       C.teal],
            [t("sidebar.stat.exits"),          (data.exits||[]).length,          C.textM],
            [t("sidebar.stat.investigations"), (data.investigations||[]).length, INV_RED],
            [t("sidebar.stat.briefs"),         (data.briefs||[]).length,         C.amber],
          ].map(([l,v,col],i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
              <Mono color={C.textD} size={8}>{l}</Mono>
              <Mono color={col} size={8}>{v}</Mono>
            </div>
          ))}
        </div>

        {supaSession && (
          <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}` }}>
            <span style={{ fontSize:10, color:C.textD, overflow:"hidden",
              textOverflow:"ellipsis", whiteSpace:"nowrap", display:"block" }}>
              {supaSession.user?.email || "session"}
            </span>
          </div>
        )}
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Top bar */}
        <div style={{ background:C.surf, borderBottom:`1px solid ${C.border}`,
          padding:"12px 24px", display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
          <span style={{ fontSize:16 }}>{activeNav?.icon}</span>
          <span style={{ fontSize:15, fontWeight:600, color:C.text }}>{activeNav ? navLabel(activeNav) : ""}</span>
          <div style={{ flex:1 }}/>
          {isAdmin && (
            <button onClick={() => setModule("admin")}
              title={t("nav.admin")}
              style={{ display:"flex", alignItems:"center", gap:6,
                background: module==="admin" ? C.amber+"22" : "none",
                border:`1px solid ${module==="admin" ? C.amber+"55" : C.border}`,
                borderRadius:8, padding:"6px 12px", cursor:"pointer",
                fontFamily:"'DM Sans',sans-serif",
                color: module==="admin" ? C.amber : C.textM,
                fontSize:12, fontWeight:600 }}>
              <span style={{ fontSize:14, lineHeight:1 }}>⚙️</span>
              <span>{t("nav.admin")}</span>
            </button>
          )}
        </div>

        {/* Module area — stubs until migration complete */}
        <div style={{ flex:1, overflowY:"auto", padding:"24px" }} className="fadein">
          {!loaded ? (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%" }}>
              <AILoader label="Chargement du système"/>
            </div>
          ) : gateModule ? (
            <LimitedAccessScreen
              subscription={userSubscription}
              isAdmin={isAdmin}
              onGoAdmin={() => setModule("admin")}
              onSignOut={async () => { await supaSignOut(); }} />
          ) : safeModule === "home"         ? <ModuleHome data={data} onNavigate={handleNavigate}/>
          : safeModule === "radar"          ? <ModuleRadar data={data} onSave={handleSave} subscription={userSubscription} userEmail={userProfile?.email}/>
          : safeModule === "copilot"        ? <ModuleCopilot data={data}/>
          : safeModule === "meetings"       ? <ModuleMeetings data={data} onSave={handleSave} onSaveSession={handleSaveMeeting} onUpdateMeeting={handleUpdateMeeting} onNavigate={handleNavigate} focusMeetingId={focusMeetingId} onClearFocus={() => setFocusMeetingId(null)} subscription={userSubscription} userEmail={userProfile?.email}/>
          : safeModule === "prep1on1"       ? <Module1on1Prep data={data} onSave={handleSave} onNavigate={handleNavigate}/>
          : safeModule === "cases"          ? <ModuleCases data={data} onSave={handleSave} onTransitionCase={transitionCase} onNavigate={handleNavigate} focusCaseId={focusCaseId} onClearFocus={() => setFocusCaseId(null)} subscription={userSubscription} userEmail={userProfile?.email}/>
          : safeModule === "signals"        ? <ModuleSignals data={data} onSave={handleSave} focusSignalId={focusSignalId} onClearFocus={() => setFocusSignalId(null)}/>
          : safeModule === "brief"          ? <ModuleBrief data={data} onSave={handleSave}/>
          : safeModule === "decisions"      ? <ModuleDecisions data={data} onSave={handleSave} onNavigate={handleNavigate} focusDecisionId={focusDecisionId} onClearFocus={() => setFocusDecisionId(null)}/>
          : safeModule === "coaching"       ? <ModuleCoaching data={data} onSave={handleSave}/>
          : safeModule === "investigation"  ? <ModuleInvestigation data={data} onSave={handleSave} onNavigate={handleNavigate} focusInvestigationId={focusInvestigationId} onClearFocus={() => setFocusInvestigationId(null)} subscription={userSubscription} userEmail={userProfile?.email}/>
          : safeModule === "exit"           ? <ModuleExit data={data} onSave={handleSave} focusExitId={focusExitId} onClearFocus={() => setFocusExitId(null)}/>
          : safeModule === "workshop"       ? <ModuleWorkshop />
          : safeModule === "autoprompt"     ? <ModuleAutoPrompt data={data}/>
          : safeModule === "convkit"        ? <ModuleConvKit />
          : safeModule === "plans306090"    ? <Module306090 data={data} onSave={handleSave}/>
          : safeModule === "knowledge"      ? <ModuleKnowledge />
          : safeModule === "leaders"        ? <ModuleLeader data={data} onSave={handleSave} onNavigate={handleNavigate}/>
          : safeModule === "admin"          ? (isAdmin ? <ModuleAdmin currentProfile={userProfile} currentOrganization={userOrganization} onOrganizationUpdated={setUserOrganization} subscription={userSubscription}/> : null)
          : null}
        </div>
      </div>

      <SavedToast show={toast}/>
      <Spotlight data={data} onNavigate={handleNavigate}/>
    </div>
  );
}
