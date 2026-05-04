// ── MODULE: FICHES LEADERS ────────────────────────────────────────────────────
// Couche d'agrégation en lecture seule.
// Consolide meetings, cases, prep1on1 par gestionnaire.
// Ne remplace aucun module existant — les événements RH restent dans leurs modules.

import { useState, useMemo, useEffect } from "react";
import Badge from '../components/Badge.jsx';
import Card  from '../components/Card.jsx';
import Mono  from '../components/Mono.jsx';
import { C, css, RISK, DELAY_C } from '../theme.js';
import { normalizeRisk } from '../utils/normalize.js';
import { toArray } from '../utils/meetingModel.js';
import { normKey } from '../utils/format.js';
import { callAIJson } from '../api/index.js';
import { PORTFOLIO_ASSESS_SP } from '../prompts/portfolio.js';
import { getLeadersMap, getMeta, setMeta, topFocusLeaders, computeFocusScore, getLastEngineOutput,
         MANAGER_TYPES, PRESSURE_LEVELS, RISK_LEVELS, TYPE_ICON, PRESSURE_EMOJI } from '../utils/leaderStore.js';
import { isCaseActive } from '../utils/caseStatus.js';
import IdentityRenameForm from '../components/IdentityRenameForm.jsx';

// ── Inline helpers ─────────────────────────────────────────────────────────────
function RiskBadge({ level }) {
  const r = RISK[normalizeRisk(level)] || RISK["Modéré"];
  return <Badge label={level||"—"} color={r.color}/>;
}
function SH({ icon, label, color, sub }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10,
      paddingBottom:7, borderBottom:`1px solid ${(color||C.textD)+"28"}` }}>
      <span style={{ fontSize:13 }}>{icon}</span>
      <Mono size={10} color={color||C.textD}>{label}</Mono>
      {sub && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9,
        color:C.textD, letterSpacing:1.5, textTransform:"uppercase" }}> · {sub}</span>}
    </div>
  );
}
function HR() {
  return <div style={{ height:1, background:C.border, margin:"14px 0" }}/>;
}
function InfoRow({ label, children }) {
  return (
    <div style={{ marginBottom:10 }}>
      <Mono size={8} color={C.textD}>{label}</Mono>
      <div style={{ marginTop:4 }}>{children}</div>
    </div>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────────
const RISK_ORDER  = { "Critique":0, "Élevé":1, "Eleve":1, "Modéré":2, "Modere":2, "Faible":3 };
const RISK_LABELS = ["Critique","Élevé","Modéré","Faible"];

const LEVEL_ORDER = { employe:0, gestionnaire:1, manager:1, director:2, directeur:2, vp:3, executif:4, hrbp_team:5, ta_team:6, autres:7 };
const LEVEL_META  = {
  employe:       { label:"Employé",      icon:"🧑", color:C.em     },
  gestionnaire:  { label:"Gestionnaire", icon:"👤", color:C.teal   },
  manager:       { label:"Gestionnaire", icon:"👤", color:C.teal   },
  directeur:     { label:"Directeur",    icon:"🏢", color:C.blue   },
  director:      { label:"Directeur",    icon:"🏢", color:C.blue   },
  vp:            { label:"VP",           icon:"📊", color:C.blue   },
  executif:      { label:"Exécutif",     icon:"🏛", color:C.purple },
  hrbp_team:     { label:"HRBP Team",    icon:"🤝", color:C.purple },
  ta_team:       { label:"TA Team",      icon:"🎯", color:C.teal   },
  autres:        { label:"Autres",       icon:"📋", color:C.textD  },
};
const DEFAULT_LEVEL = { label:"Autres", icon:"📋", color:C.textD };

const CASE_TYPE_LABEL = {
  performance:"Performance", pip:"PIP / Correctif",
  conflict_ee:"Conflit EE/EE", conflict_em:"Conflit EE/Mgr",
  complaint:"Plainte", immigration:"Immigration",
  retention:"Rétention", promotion:"Promotion",
  return:"Retour d'absence", reorg:"Restructuration",
  exit:"Départ", investigation:"Enquête",
};
const URGENCY_C = { "Immediat":C.red, "Cette semaine":C.amber, "Ce mois":C.blue, "En veille":C.textD };
const EVO_C     = {
  "Nouveau":C.blue, "En cours":C.amber, "Aggravé":C.red,
  "En amélioration":C.teal, "Bloqué":C.red, "Résolu":C.textD,
};
const POSTURE_MODE_C = { "Coach":C.em, "Challenge":C.amber, "Directif":C.red, "Escalader":"#7a1e2e" };
const SANTE_C = {
  "Forte":C.em, "Correcte":C.blue, "À risque":C.amber, "Critique":C.red,
  "Élevé":C.em, "Modéré":C.blue, "Fragile":C.amber,
};
const EXIT_DC = { "Volontaire regrettable":C.red, "Volontaire non regrettable":C.em, "Inconnu":C.textM };
const EXIT_SC = { "Positif":C.em, "Neutre":C.blue, "Mitigé":C.amber, "Négatif":C.red, "Critique":C.red };

// 30-60-90 constants (mirrors Plan306090.jsx — no import to avoid coupling)
const PLAN_TYPE_ICON = {
  new_hire:           "🆕",
  promotion:          "⬆",
  internal_move:      "🔄",
  first_time_manager: "👤",
  critical_role:      "⚡",
};
const PHASE_META_306 = [
  { key:"days30", label:"30 jours", color:"#06b6d4" },
  { key:"days60", label:"60 jours", color:"#8b5cf6" },
  { key:"days90", label:"90 jours", color:C.em      },
];
const RISK_C_306 = (r) => (
  { "Critique":C.red, "Eleve":C.amber, "Élevé":C.amber,
    "Modere":C.blue,  "Modéré":C.blue, "Faible":C.em }[r] || C.blue
);

// ── Utilities ──────────────────────────────────────────────────────────────────
const normName  = normKey; // alias — uses shared normKey (accent-safe)
const worstRisk = (arr) => {
  const filtered = arr.filter(Boolean).map(r => RISK_ORDER[r] ?? 3);
  if (filtered.length === 0) return "Faible";
  return RISK_LABELS[Math.min(...filtered)] || "Faible";
};
const sortByDate = (arr, field) =>
  [...arr].sort((a,b) => (b[field]||"").localeCompare(a[field]||""));

// ── Leader 360 — rule-based strategic reading (no AI) ─────────────────────────
// Returns { globalRisk, score, patterns[], why[], actions[] }
// Called in detail view after todayISO + leader data are available.
function buildLeader360(l, todayISO) {
  const activeCases   = l.cases.filter(isCaseActive);
  const exits         = l.exits   || [];
  const linkedSignals = l.signals || [];
  const meetings      = sortByDate(l.meetings || [], "savedAt");

  let score = 0;
  const why      = [];
  const patterns = new Set();

  // ── Active cases ──────────────────────────────────────────────────────────
  activeCases.forEach(c => {
    const rl = normalizeRisk(c.riskLevel || "");
    if (rl === "Critique")      score += 3;
    else if (rl === "Élevé")    score += 2;
    else if (rl === "Modéré")   score += 1;
  });
  if (activeCases.length >= 2)
    patterns.add("Dossiers actifs multiples");
  if (activeCases.length > 0)
    why.push(`${activeCases.length} dossier${activeCases.length > 1 ? "s" : ""} actif${activeCases.length > 1 ? "s" : ""}`);

  // ── Exits ─────────────────────────────────────────────────────────────────
  const recentRegrettable = exits.filter(e => {
    if (e.result?.summary?.regrettable !== "Oui") return false;
    if (!e.savedAt || !todayISO) return true;
    const diff = (new Date(todayISO) - new Date(e.savedAt)) / 86400000;
    return diff <= 90;
  });
  score += Math.min(recentRegrettable.length * 2, 4);
  if (recentRegrettable.length > 0) {
    patterns.add("Risque de rétention");
    why.push(`${recentRegrettable.length} départ${recentRegrettable.length > 1 ? "s" : ""} regrettable${recentRegrettable.length > 1 ? "s" : ""} (90 j)`);
  }
  if (exits.length >= 2) patterns.add("Flux de départs");

  const negSentiment = exits.filter(e => {
    const s = e.result?.management?.overallSentiment;
    return s === "Négatif" || s === "Critique";
  });
  if (negSentiment.length > 0) {
    score += negSentiment.length;
    patterns.add("Pression managériale");
    why.push("Sentiment négatif envers la gestion (sortants)");
  }

  // ── Linked signals (Signal Detector) ─────────────────────────────────────
  const critSigs = linkedSignals.filter(s => normalizeRisk(s.analysis?.severity || "") === "Critique");
  const elevSigs = linkedSignals.filter(s => normalizeRisk(s.analysis?.severity || "") === "Élevé");
  score += critSigs.length * 3 + elevSigs.length * 2;
  if (critSigs.length > 0) {
    patterns.add("Signaux critiques");
    why.push(`${critSigs.length} signal${critSigs.length > 1 ? "s" : ""} critique${critSigs.length > 1 ? "s" : ""}`);
  } else if (elevSigs.length > 0) {
    why.push(`${elevSigs.length} signal${elevSigs.length > 1 ? "s" : ""} à risque élevé`);
  }

  // ── Meeting risk (last 3) ─────────────────────────────────────────────────
  const recentMtgs = meetings.slice(0, 3);
  const critMtgs   = recentMtgs.filter(m => normalizeRisk(m.analysis?.overallRisk || "") === "Critique");
  const elevMtgs   = recentMtgs.filter(m => normalizeRisk(m.analysis?.overallRisk || "") === "Élevé");
  score += critMtgs.length * 2 + elevMtgs.length;
  if (critMtgs.length > 0) {
    patterns.add("Risque contextuel élevé");
    why.push(`${critMtgs.length} meeting${critMtgs.length > 1 ? "s" : ""} à risque critique`);
  } else if (elevMtgs.length >= 2) {
    patterns.add("Risque contextuel élevé");
    why.push(`${elevMtgs.length} meetings récents à risque élevé`);
  }

  // ── Active 30-60-90 transitions ───────────────────────────────────────────
  const activePlans = (l.plans || []).filter(p => getCurrentPhase(p.startDate).phaseKey !== null);
  if (activePlans.length > 0) patterns.add("Transition(s) en cours");

  // ── Global risk level ─────────────────────────────────────────────────────
  let globalRisk;
  if (score >= 7)       globalRisk = "Critique";
  else if (score >= 4)  globalRisk = "Élevé";
  else if (score >= 2)  globalRisk = "Modéré";
  else                  globalRisk = "Faible";

  // ── Recommended actions ───────────────────────────────────────────────────
  const actions = [];
  if (globalRisk === "Critique")
    actions.push({ delay:"Immédiat",      action:"Déclencher un plan d'action RH — rencontrer le leader cette semaine" });
  if (patterns.has("Risque de rétention") || patterns.has("Flux de départs"))
    actions.push({ delay:"Cette semaine", action:"Sonder le climat d'équipe et identifier les talents à risque de départ" });
  if (patterns.has("Pression managériale"))
    actions.push({ delay:"Court terme",   action:"Planifier un coaching ciblé sur le style de gestion" });
  if (patterns.has("Dossiers actifs multiples"))
    actions.push({ delay:"Ce mois",       action:"Revisiter la posture HRBP — prioriser et alléger le portfolio de dossiers" });
  if (patterns.has("Signaux critiques"))
    actions.push({ delay:"Cette semaine", action:"Valider les signaux critiques et définir un plan de suivi avec le leader" });
  if (patterns.has("Transition(s) en cours"))
    actions.push({ delay:"En veille",     action:`Assurer le suivi des ${activePlans.length} collaborateur${activePlans.length > 1 ? "s" : ""} en phase de transition` });
  if (globalRisk === "Faible" && actions.length === 0)
    actions.push({ delay:"En veille",     action:"Maintenir le contact régulier — situation stable, aucune urgence détectée" });

  return {
    globalRisk,
    score,
    patterns: [...patterns],
    why: why.filter(Boolean),
    actions: actions.slice(0, 3),
  };
}

// Compute current 30-60-90 phase from startDate.
// Returns { label, color, daysLeft, phaseKey } — all safe, daysLeft clamped ≥ 0.
function getCurrentPhase(startDate) {
  if (!startDate) return { label:"—", color:C.textD, daysLeft:null, phaseKey:null };
  const start   = new Date(startDate + "T00:00:00");
  if (isNaN(start.getTime())) return { label:"—", color:C.textD, daysLeft:null, phaseKey:null };
  const today   = new Date();
  const daysIn  = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  if (daysIn < 0)  return { label:"Pas commencé", color:C.textD, daysLeft:null,                         phaseKey:null  };
  if (daysIn <= 30) return { label:"30 jours",     color:"#06b6d4", daysLeft:Math.max(0, 30-daysIn), phaseKey:"days30" };
  if (daysIn <= 60) return { label:"60 jours",     color:"#8b5cf6", daysLeft:Math.max(0, 60-daysIn), phaseKey:"days60" };
  if (daysIn <= 90) return { label:"90 jours",     color:C.em,      daysLeft:Math.max(0, 90-daysIn), phaseKey:"days90" };
  return { label:"Terminé", color:C.textD, daysLeft:0, phaseKey:null };
}

// ── Build leader index ─────────────────────────────────────────────────────────
// Aggregates meetings, cases, prep1on1, plans306090, exits keyed by normalized name.
// Each source keeps its original data intact — no modification.
function buildLeaderIndex(data) {
  const leaders = {};
  const ensure = (rawName) => {
    if (!rawName) return null;
    const key = normName(rawName);
    if (!key) return null;
    if (!leaders[key]) leaders[key] = { key, name:rawName.trim(), level:null, meetings:[], cases:[], preps:[], plans:[], exits:[], signals:[] };
    return leaders[key];
  };

  (data.meetings||[]).forEach(m => {
    // Scope filter: only "leader"-scope meetings feed the Leader fiche / 360 / Timeline.
    // Retrocompat rule: meetings saved before the scope field existed have no `scope` →
    // treated as "leader" (safe default — all pre-existing meetings were strategic).
    if ((m.scope || "leader") !== "leader") return;
    const l = ensure(m.director);
    if (!l) return;
    l.meetings.push(m);
    // Infer level from meetingType — keep highest (lowest order number wins)
    const ord = LEVEL_ORDER[m.meetingType];
    if (ord !== undefined && (l.level === null || ord < LEVEL_ORDER[l.level])) {
      l.level = m.meetingType;
    }
  });

  (data.cases||[]).forEach(c => {
    if (c.status === "archived") return;
    // Scope filter: only "leader"-scope cases feed the Leader fiche / 360 / Timeline.
    // Retrocompat: cases saved before the scope field existed have no `scope` →
    // treated as "leader" (safe default — all pre-existing cases were strategic director dossiers).
    if ((c.scope || "leader") !== "leader") return;
    const l = ensure(c.director);
    if (l) l.cases.push(c);
  });

  (data.prep1on1||[]).forEach(p => {
    const l = ensure(p.managerName);
    if (!l) return;
    // kind:"1:1-meeting" → count as meeting (Meeting Engine sessions)
    if (p.kind === "1:1-meeting") {
      l.meetings.push(p);
    } else {
      l.preps.push(p);
    }
    // Infer level from prep session — niveau or level field
    const pLevel = p.niveau || p.level || null;
    if (pLevel) {
      const ord = LEVEL_ORDER[pLevel];
      if (ord !== undefined && (l.level === null || ord < LEVEL_ORDER[l.level])) {
        l.level = pLevel;
      }
    }
  });

  // plans306090 — linked via plan.manager (free text, same convention)
  // Skips plans with empty or missing manager field
  (data.plans306090||[]).forEach(p => {
    const mgr = (p.manager||"").trim();
    if (!mgr) return;
    const l = ensure(mgr);
    if (l) l.plans.push(p);
  });

  // exits — linked via managerName (managerKey used for priority, fallback to normName)
  (data.exits||[]).forEach(e => {
    const rawName = (e.managerName||"").trim();
    if (!rawName) return;
    const l = ensure(rawName);
    if (l) l.exits.push(e);
  });

  // signals — SAFE: attach ONLY to already-known leaders, never create via ensure()
  // signal.director is ambiguous ("Directeur / Contexte") — may contain non-name text
  // Silently ignores signals whose director doesn't exactly match an existing leader key
  (data.signals||[]).forEach(s => {
    const key = normName(s.director || "");
    if (!key) return;
    if (leaders[key]) leaders[key].signals.push(s);
  });

  return leaders;
}

// ── Build leader timeline ──────────────────────────────────────────────────────
// Merges all events linked to a leader into a single descending-date list.
// Date fields: meetings / exits / signals → savedAt  |  cases → openDate
function buildLeaderTimeline(l) {
  const items = [];
  (l.cases    || []).forEach(c => items.push({
    type: "case",    date: c.openDate  || "", id: c.id,
    label: c.title  || CASE_TYPE_LABEL[c.type] || "Dossier",
    severity: c.riskLevel || null,
  }));
  (l.meetings || []).forEach(m => items.push({
    type: "meeting", date: m.savedAt   || "", id: m.id,
    label: m.analysis?.meetingTitle || m.output?.meetingTitle || m.meetingType || m.engineType || "Meeting",
    severity: m.analysis?.overallRisk || m.output?.overallRisk || null,
  }));
  (l.exits    || []).forEach(e => items.push({
    type: "exit",    date: e.savedAt   || "", id: e.id,
    label: e.result?.summary?.departure_type || e.employeeName || "Départ",
    severity: null,
  }));
  (l.signals  || []).forEach(s => items.push({
    type: "signal",  date: s.savedAt   || "", id: s.id,
    label: s.analysis?.title || s.analysis?.category || "Signal",
    severity: s.analysis?.severity || null,
  }));
  // Descending by date — undated items go last
  return items.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });
}

// ── Module ─────────────────────────────────────────────────────────────────────
export default function ModuleLeader({ data, onSave, onNavigate }) {
  const [selected,      setSelected]      = useState(null);
  const [tlExpanded,    setTlExpanded]    = useState(false);
  const [tlFilter,      setTlFilter]     = useState("all");
  const [editingMeta,   setEditingMeta]  = useState(false);
  const [metaForm,      setMetaForm]     = useState(null);
  const [aiAssessing,   setAiAssessing]  = useState(false);
  const [filterArchive, setFilterArchive] = useState("active"); // active | archived | all
  const [renamingName,  setRenamingName]  = useState(false);

  // Selects a leader and resets timeline state
  const selectLeader = (key) => { setSelected(key); setTlExpanded(false); setTlFilter("all"); setEditingMeta(false); setMetaForm(null); setRenamingName(false); };

  const leaders = useMemo(() => buildLeaderIndex(data), [data]);
  const leaderList = Object.values(leaders);
  const leadersMap = useMemo(() => getLeadersMap(data), [data]);
  const todayISO_top = new Date().toISOString().split("T")[0];
  const topFocus = useMemo(() => {
    const activeLeaders = leaderList.filter(l => !getMeta(l.name, leadersMap).archived);
    return topFocusLeaders(activeLeaders, leadersMap, todayISO_top, 3);
  }, [leaderList, leadersMap, todayISO_top]);

  const saveMeta = (name, patch) => {
    if (!onSave) return;
    const next = setMeta(leadersMap, name, patch);
    onSave("leaders", next);
  };

  const aiAssess = async (autoLeader) => {
    if (!onSave) return;
    const mData = (autoLeader.meetings||[]).slice(-5);
    const cData = (autoLeader.cases||[]).slice(-5);
    if (!mData.length && !cData.length) { alert("Aucune donnée trouvée pour ce gestionnaire."); return; }
    const ctx = [
      mData.length && `MEETINGS:\n${mData.map(x=>`- ${x.savedAt||""} Risk:${x.analysis?.overallRisk||""} ${x.analysis?.overallRiskRationale||""}`).join("\n")}`,
      cData.length && `CASES:\n${cData.map(x=>`- ${x.title||""} | ${x.riskLevel||""} | ${x.situation||""}`).join("\n")}`,
    ].filter(Boolean).join("\n\n");
    setAiAssessing(true);
    try {
      const p = await callAIJson(PORTFOLIO_ASSESS_SP, `Gestionnaire: ${autoLeader.name}\n\n${ctx}`, 500);
      saveMeta(autoLeader.name, {
        riskOverride: normalizeRisk(p.riskAssessment) || "",
        pressure: p.pressureLevel || "",
        type: p.managerType || "",
        topIssue: p.topIssue || "",
        nextAction: p.recommendedAction || "",
        lastInteraction: new Date().toISOString().split("T")[0],
      });
    } catch (e) { alert("Erreur: " + e.message); }
    finally { setAiAssessing(false); }
  };

  // Auto-select leader passed from another module via sessionStorage bridge
  useEffect(() => {
    const pending = sessionStorage.getItem("hrbpos:pendingLeader");
    if (!pending) return;
    sessionStorage.removeItem("hrbpos:pendingLeader");
    const key = normKey(pending);
    if (leaders[key]) selectLeader(key);
  }, [leaders]);

  // ── LIST VIEW ────────────────────────────────────────────────────────────────
  if (!selected) {
    // Filter by archive status — leaders without archived flag are active (migration douce)
    const filteredByArchive = leaderList.filter(l => {
      const lMeta = getMeta(l.name, leadersMap);
      const isArchived = !!lMeta.archived;
      if (filterArchive === "active")   return !isArchived;
      if (filterArchive === "archived") return isArchived;
      return true; // "all"
    });
    const archivedCount = leaderList.filter(l => !!getMeta(l.name, leadersMap).archived).length;

    // Group by level — editorial levelOverride takes precedence
    const groupMap = {};
    filteredByArchive.forEach(l => {
      const lMeta = getMeta(l.name, leadersMap);
      const effectiveLevel = lMeta.levelOverride || l.level;
      const meta = LEVEL_META[effectiveLevel] || DEFAULT_LEVEL;
      if (!groupMap[meta.label]) groupMap[meta.label] = { meta, leaders:[] };
      groupMap[meta.label].leaders.push(l);
    });
    const groupOrder = ["Employé","Gestionnaire","Directeur","VP","Exécutif","HRBP Team","TA Team","Autres"];
    const groups = groupOrder.filter(g => groupMap[g]).map(g => groupMap[g]);

    return (
      <div style={{ maxWidth:880, margin:"0 auto" }}>
        <div style={{ marginBottom:20 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
            <div>
              <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>Fiches Leaders</div>
              <div style={{ fontSize:12, color:C.textM }}>
                {filteredByArchive.length} gestionnaire{filteredByArchive.length>1?"s":""}
                {filterArchive === "archived" ? " archivé" + (filteredByArchive.length>1?"s":"") : " actif" + (filteredByArchive.length>1?"s":"")}
                {filterArchive === "all" && ` (${archivedCount} archivé${archivedCount>1?"s":""})`}
                <span style={{ color:C.textD }}> · Agrégation auto + couche éditoriale HRBP</span>
              </div>
            </div>
            <div style={{ display:"flex", gap:4 }}>
              {[
                { key:"active",   label:"Actifs" },
                { key:"archived", label:"Archivés" },
                { key:"all",      label:"Tous" },
              ].map(f => (
                <button key={f.key} onClick={() => setFilterArchive(f.key)}
                  style={{ background: filterArchive===f.key ? C.em+"22" : "none",
                    border:`1px solid ${filterArchive===f.key ? C.em+"44" : C.border}`,
                    borderRadius:6, padding:"5px 11px", fontSize:11, cursor:"pointer",
                    color: filterArchive===f.key ? C.em : C.textM,
                    fontFamily:"'DM Sans',sans-serif", fontWeight: filterArchive===f.key ? 600 : 400 }}>
                  {f.label}{f.key==="archived" && archivedCount > 0 ? ` (${archivedCount})` : ""}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── TOP 3 FOCUS HRBP ── */}
        {topFocus.length > 0 && (
          <div style={{ background:"linear-gradient(135deg,#ef444412,#f59e0b08)",
            border:`1px solid ${C.red}25`, borderRadius:10, padding:"14px 16px", marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
              <span style={{ fontSize:14 }}>🎯</span>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:C.text }}>Où passer mes 5 prochaines heures HRBP ?</div>
                <div style={{ fontSize:11, color:C.textD }}>Score basé sur risque, inactivité, pression et pattern</div>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              {topFocus.map((m, i) => {
                const meta = m._meta;
                const rk = meta.riskOverride || "Modéré";
                const rc = ({ "Critique":C.red, "Élevé":C.amber, "Eleve":C.amber, "Modéré":C.blue, "Modere":C.blue, "Faible":C.em }[rk]) || C.textD;
                return (
                  <button key={m.key} onClick={()=>selectLeader(m.key)}
                    style={{ display:"flex", gap:10, alignItems:"center", padding:"9px 12px",
                      background:C.surfL, borderRadius:8, borderLeft:`3px solid ${rc}`,
                      border:"none", cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif", width:"100%" }}>
                    <div style={{ width:22, height:22, background:rc+"22", border:`1px solid ${rc}44`,
                      borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:12, fontWeight:800, color:rc, flexShrink:0 }}>{i+1}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:C.text }}>
                        {TYPE_ICON[meta.type] || ""} {m.name}
                      </div>
                      <div style={{ fontSize:11, color:C.textD, marginTop:2 }}>{m._focus.reasons.join(" · ") || "Priorité"}</div>
                      {meta.nextAction && <div style={{ fontSize:11, color:C.em, marginTop:2 }}>→ {meta.nextAction}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {filteredByArchive.length === 0 && filterArchive === "archived" ? (
          <div style={{ textAlign:"center", padding:"40px 20px" }}>
            <div style={{ fontSize:36, marginBottom:12 }}>📦</div>
            <div style={{ fontSize:13, color:C.textM }}>Aucun leader archivé</div>
          </div>
        ) : leaderList.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 20px" }}>
            <div style={{ fontSize:36, marginBottom:12 }}>👤</div>
            <div style={{ fontSize:13, color:C.textM, marginBottom:6 }}>Aucun leader détecté</div>
            <div style={{ fontSize:11, color:C.textD, marginBottom:16, lineHeight:1.6 }}>
              Les fiches se construisent automatiquement à partir de tes meetings, dossiers et préparations 1:1.
              <br/>Commence par analyser un meeting ou créer un dossier Case Log.
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"center" }}>
              <button onClick={() => onNavigate("meetings")}
                style={{ padding:"8px 18px", background:C.blue+"22",
                  border:`1px solid ${C.blue}44`, borderRadius:7, color:C.blue,
                  fontSize:12, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                🎙️ Meetings
              </button>
              <button onClick={() => onNavigate("cases")}
                style={{ padding:"8px 18px", background:C.amber+"22",
                  border:`1px solid ${C.amber}44`, borderRadius:7, color:C.amber,
                  fontSize:12, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                📂 Case Log
              </button>
            </div>
          </div>
        ) : groups.map(group => (
          <div key={group.meta.label} style={{ marginBottom:24 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12,
              paddingBottom:6, borderBottom:`2px solid ${group.meta.color}33` }}>
              <span style={{ fontSize:14 }}>{group.meta.icon}</span>
              <Mono color={group.meta.color} size={9}>{group.meta.label}</Mono>
              <Mono size={9} color={C.textD}>— {group.leaders.length} personne{group.leaders.length>1?"s":""}</Mono>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10 }}>
              {group.leaders.map(l => {
                const activeCases = l.cases.filter(isCaseActive);
                const lastMeeting = sortByDate(l.meetings,"savedAt")[0];
                const lMeta = getMeta(l.name, leadersMap);
                const globalRisk  = lMeta.riskOverride || worstRisk([
                  ...activeCases.map(c => c.riskLevel),
                  lastMeeting?.analysis?.overallRisk,
                ]);
                const r = RISK[normalizeRisk(globalRisk)] || RISK["Faible"];
                const isArchived = !!lMeta.archived;
                return (
                  <button key={l.key} onClick={() => selectLeader(l.key)}
                    style={{ background:C.surfL,
                      border:`1px solid ${r.color}28`,
                      borderLeft:`3px solid ${group.meta.color}`,
                      borderRadius:10, padding:"13px 14px", cursor:"pointer",
                      textAlign:"left", fontFamily:"'DM Sans',sans-serif",
                      transition:"border-color .15s",
                      opacity: isArchived ? 0.55 : 1 }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = group.meta.color}
                    onMouseLeave={e => e.currentTarget.style.borderColor = r.color+"28"}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                      <span style={{ fontSize:18 }}>{TYPE_ICON[lMeta.type] || group.meta.icon}</span>
                      <div style={{ display:"flex", gap:3, alignItems:"center" }}>
                        {isArchived && <Badge label="Archivé" color={C.textD} size={9}/>}
                        {PRESSURE_EMOJI[lMeta.pressure] && <span style={{ fontSize:11 }}>{PRESSURE_EMOJI[lMeta.pressure]}</span>}
                        <RiskBadge level={globalRisk}/>
                      </div>
                    </div>
                    <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:6 }}>{l.name}</div>
                    {lMeta.topIssue && <div style={{ fontSize:11, color:C.amber, marginBottom:6, lineHeight:1.4, overflow:"hidden", textOverflow:"ellipsis", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>⚑ {lMeta.topIssue}</div>}
                    <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                      {l.meetings.length>0 && <Mono size={8} color={C.textD}>{l.meetings.length} meeting{l.meetings.length>1?"s":""}</Mono>}
                      {activeCases.length>0 && <Mono size={8} color={C.amber}>{activeCases.length} dossier{activeCases.length>1?"s":""} actif{activeCases.length>1?"s":""}</Mono>}
                      {lastMeeting?.savedAt && <Mono size={8} color={C.textD}>Contact: {lastMeeting.savedAt}</Mono>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── DETAIL VIEW ───────────────────────────────────────────────────────────────
  const l = leaders[selected];
  if (!l) { setSelected(null); return null; }

  const todayISO       = new Date().toISOString().split("T")[0];
  const activeCases    = l.cases.filter(isCaseActive);
  const sortedMeetings = sortByDate(l.meetings, "savedAt");
  const sortedPreps    = sortByDate(l.preps,    "savedAt");
  const lastMeeting    = sortedMeetings[0] || null;
  const lastPrep       = sortedPreps[0]    || null;
  const detailMeta     = getMeta(l.name, leadersMap);
  const levelMeta      = LEVEL_META[detailMeta.levelOverride || l.level] || DEFAULT_LEVEL;

  // Global risk — worst of active cases + last meeting, fallback Faible
  const globalRisk = worstRisk([
    ...activeCases.map(c => c.riskLevel),
    lastMeeting?.analysis?.overallRisk,
  ]);
  const rObj = RISK[normalizeRisk(globalRisk)] || RISK["Faible"];

  // Leader 360 — deterministic strategic reading
  const r360 = buildLeader360(l, todayISO);
  const R360_COLOR = { "Critique":C.red, "Élevé":C.amber, "Modéré":C.blue, "Faible":C.em };
  const r360Color = R360_COLOR[r360.globalRisk] || C.em;

  // Timeline — unified chronological event list
  const timeline = buildLeaderTimeline(l);
  const TL_COLOR = { meeting:C.blue, case:C.amber, exit:C.textM, signal:C.purple };
  const TL_ICON  = { meeting:"🎙️", case:"📂", exit:"🚪", signal:"📡" };
  const TL_LABEL = { meeting:"MEETING", case:"DOSSIER", exit:"DÉPART", signal:"SIGNAL" };
  const TL_MAX   = 10;

  // Filter by type chip
  const tlFiltered = tlFilter === "all" ? timeline : timeline.filter(i => i.type === tlFilter);
  const tlSliced   = tlExpanded ? tlFiltered : tlFiltered.slice(0, TL_MAX);

  // Relative time indicator — shown only for events ≤30 days
  const tlDaysAgo = (dateStr) => {
    if (!dateStr) return null;
    const diff = Math.floor((new Date(todayISO) - new Date(dateStr + "T00:00:00")) / 86400000);
    if (diff < 0 || diff > 30) return null;
    if (diff === 0) return "auj.";
    if (diff === 1) return "il y a 1j";
    return `il y a ${diff}j`;
  };

  // Month grouping of sliced list (robust, no locale dependency)
  const MOIS_FR = ["","Janvier","Février","Mars","Avril","Mai","Juin",
                   "Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const tlGrouped = (() => {
    const groups = [];
    let cur = null;
    tlSliced.forEach(item => {
      const key = item.date ? item.date.substring(0, 7) : "__none__";
      if (key !== cur) {
        let label = "Sans date";
        if (item.date) {
          const [yr, mo] = item.date.split("-");
          label = `${MOIS_FR[parseInt(mo)] || mo} ${yr}`;
        }
        groups.push({ key, label, items:[] });
        cur = key;
      }
      groups[groups.length - 1].items.push(item);
    });
    return groups;
  })();

  // Activity badge — ≥3 events in last 14 days (across all types, unfiltered)
  const tlRecentCount = timeline.filter(item => {
    if (!item.date) return false;
    const diff = Math.floor((new Date(todayISO) - new Date(item.date + "T00:00:00")) / 86400000);
    return diff >= 0 && diff <= 14;
  }).length;
  const tlHighActivity = tlRecentCount >= 3;

  const tlNav = (item) => {
    if (item.type === "case")    onNavigate("cases",    { focusCaseId:    item.id });
    if (item.type === "meeting") onNavigate("meetings", { focusMeetingId: item.id });
    if (item.type === "exit")    onNavigate("exit",     { focusExitId:    item.id });
    if (item.type === "signal")  onNavigate("signals",  { focusSignalId:  item.id });
  };

  // Helper: read analysis data from either m.analysis (Meetings Hub) or m.output (Meeting Engine)
  const mAna = (m) => m.analysis || m.output || {};

  // Signals from meetings — Élevé/Critique, chronological, max 5
  const highSignals = sortedMeetings.slice(0,5).flatMap(m =>
    toArray(mAna(m).signals)
      .filter(s => s.level==="Élevé" || s.level==="Eleve" || s.level==="Critique")
      .map(s => ({ ...s, _date:m.savedAt, _title:mAna(m).meetingTitle }))
  ).slice(0,5);

  // hrbpKeyMessages — last 3 meetings with a key message
  const keyMessages = sortedMeetings
    .filter(m => mAna(m).hrbpKeyMessage)
    .slice(0,3)
    .map(m => ({ msg:mAna(m).hrbpKeyMessage, date:m.savedAt, risk:mAna(m).overallRisk }));

  // Last Meeting Engine output for this leader
  const lastEngineOut = getLastEngineOutput(l.name, data);

  // Merge engine hrbpKeyMessage if not already in keyMessages
  if (lastEngineOut?.hrbpKeyMessage && keyMessages.length < 3 &&
      !keyMessages.some(k => k.msg === lastEngineOut.hrbpKeyMessage)) {
    keyMessages.push({ msg:lastEngineOut.hrbpKeyMessage, date:lastEngineOut._savedAt, risk:lastEngineOut.overallRisk, source:"engine" });
  }

  // Actions from meetings — high priority, max 5
  const meetingActions = sortedMeetings.slice(0,4).flatMap(m =>
    toArray(mAna(m).actions)
      .filter(a => a.impact==="Eleve" || a.priority==="Critique" || a.priority==="Elevée" || a.priorite==="Normale" || a.action)
      .map(a => ({ ...a, _date:m.savedAt }))
  ).slice(0,5);

  // If no meeting actions found, fallback to last engine output actions
  if (meetingActions.length === 0 && toArray(lastEngineOut?.actions).length) {
    toArray(lastEngineOut?.actions).slice(0,5).forEach(a => {
      meetingActions.push({ action:a.action||a, owner:a.owner||"HRBP", delay:a.delai||"", impact:a.priorite||"", _date:lastEngineOut._savedAt });
    });
  }

  // Lecture RH + santé équipe — check both preps and Meeting Engine sessions in meetings
  const prepWithLecture = sortedPreps.find(p => p.output?.strategieHRBP);
  const engineWithLecture = sortedMeetings.find(m => m.output?.strategieHRBP);
  // Pick the most recent one
  const lectureSrc = [prepWithLecture, engineWithLecture]
    .filter(Boolean)
    .sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0))[0] || null;
  const lecture   = lectureSrc?.output?.strategieHRBP || null;
  const lectureDate = lectureSrc?.savedAt || null;
  const sante     = lecture?.santeEquipe || null;

  // 30-60-90 plans linked to this leader — active first, terminated last, max 4
  const linkedPlans = [...(l.plans||[])]
    .map(p => ({ ...p, _phase: getCurrentPhase(p.startDate) }))
    .sort((a,b) => {
      // Active phases (not terminated) come first
      const aActive = a._phase.phaseKey !== null ? 0 : 1;
      const bActive = b._phase.phaseKey !== null ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      // Within active: fewer days left = more urgent = first
      const dl_a = a._phase.daysLeft ?? 999;
      const dl_b = b._phase.daysLeft ?? 999;
      return dl_a - dl_b;
    })
    .slice(0, 4);

  return (
    <div style={{ maxWidth:900, margin:"0 auto" }}>

      {/* Breadcrumb + archive actions */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20 }}>
        <button onClick={() => setSelected(null)}
          style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6,
            padding:"5px 11px", fontSize:11, color:C.textM, cursor:"pointer",
            fontFamily:"'DM Sans',sans-serif" }}>← Retour</button>
        <Mono size={9} color={C.textD}>Fiches Leaders</Mono>
        <Mono size={9} color={C.textD}>/</Mono>
        <Mono size={9} color={C.em}>{l.name}</Mono>
        {detailMeta.archived && <Badge label="Archivé" color={C.textD}/>}
        <div style={{ flex:1 }}/>
        <button onClick={() => setRenamingName(v => !v)}
          title="Corriger une typo ou renommer ce profil dans toutes les entités"
          style={{ ...css.btn(C.teal, true), padding:"5px 12px", fontSize:11 }}>
          ✏️ Modifier le nom
        </button>
        {detailMeta.archived ? (
          <button onClick={() => { saveMeta(l.name, { archived:false, archivedAt:"" }); }}
            style={{ ...css.btn(C.em, true), padding:"5px 12px", fontSize:11 }}>
            ↩ Restaurer
          </button>
        ) : (
          <button onClick={() => {
              if (!window.confirm(`Archiver la fiche de ${l.name} ? Elle restera accessible via le filtre "Archivés".`)) return;
              saveMeta(l.name, { archived:true, archivedAt:new Date().toISOString().split("T")[0] });
            }}
            style={{ ...css.btn(C.textD, true), padding:"5px 12px", fontSize:11 }}>
            📦 Archiver
          </button>
        )}
      </div>

      {/* ── Rename inline panel (cross-entity rewrite) ── */}
      {renamingName && (
        <div style={{ background:C.surf, border:`1px solid ${C.teal}33`, borderRadius:10,
          padding:"14px 16px", marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.text, marginBottom:6 }}>
            Renommer le profil
          </div>
          <div style={{ fontSize:11, color:C.textM, lineHeight:1.5, marginBottom:10 }}>
            Réécrit le nom dans cases, meetings, enquêtes et briefs (localStorage + Supabase si dispo).
            Met aussi à jour <code style={{ fontSize:10 }}>case_tasks.assigned_to</code> et la table
            employees côté Supabase. <b>Preview</b> compte sans rien écrire.
          </div>
          <IdentityRenameForm
            defaultCurrent={l.name}
            onCancel={() => setRenamingName(false)}
            compact
          />
        </div>
      )}

      {/* ── ARCHIVED BANNER ── */}
      {detailMeta.archived && (
        <div style={{ background:C.textD+"14", border:`1px solid ${C.textD}33`,
          borderRadius:8, padding:"10px 16px", marginBottom:12,
          display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:14 }}>📦</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, fontWeight:600, color:C.textM }}>Fiche archivée</div>
            {detailMeta.archivedAt && <Mono size={8} color={C.textD}>Archivé le {detailMeta.archivedAt}</Mono>}
          </div>
          <button onClick={() => { saveMeta(l.name, { archived:false, archivedAt:"" }); }}
            style={{ ...css.btn(C.em, true), padding:"5px 12px", fontSize:11 }}>
            ↩ Restaurer
          </button>
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{ background:C.surf, border:`1px solid ${rObj.color}44`,
        borderLeft:`4px solid ${levelMeta.color}`,
        borderRadius:12, padding:"18px 22px", marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
              <span style={{ fontSize:22 }}>{levelMeta.icon}</span>
              <div style={{ fontSize:20, fontWeight:800, color:C.text, letterSpacing:-.3 }}>{l.name}</div>
            </div>
            <div style={{ display:"flex", gap:7, flexWrap:"wrap", alignItems:"center" }}>
              <Badge label={levelMeta.label} color={levelMeta.color}/>
              <RiskBadge level={globalRisk}/>
              {lecture?.postureHRBP?.mode && (
                <Badge label={`Posture HRBP: ${lecture.postureHRBP.mode}`}
                  color={POSTURE_MODE_C[lecture.postureHRBP.mode]||C.textD}/>
              )}
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:3, alignItems:"flex-end" }}>
            {lastMeeting?.savedAt && <Mono size={8} color={C.textD}>Dernier meeting: {lastMeeting.savedAt}</Mono>}
            {lastPrep?.savedAt    && <Mono size={8} color={C.textD}>Dernier 1:1: {lastPrep.savedAt}</Mono>}
          </div>
        </div>

        {/* Mini stats */}
        <div style={{ display:"flex", gap:20, marginTop:14, flexWrap:"wrap",
          paddingTop:12, borderTop:`1px solid ${C.border}` }}>
          {[
            { label:"Meetings",        value:l.meetings.length,     color:C.blue  },
            { label:"Dossiers actifs", value:activeCases.length,    color:activeCases.length>0 ? C.amber : C.textD },
            { label:"Plans 30-60-90",  value:(l.plans||[]).length,  color:(l.plans||[]).length>0 ? "#06b6d4" : C.textD },
          ].map((s,i) => (
            <div key={i}>
              <div style={{ fontSize:20, fontWeight:700, color:s.color }}>{s.value}</div>
              <Mono size={8} color={C.textD}>{s.label}</Mono>
            </div>
          ))}
        </div>
      </div>

      {/* ── NOTE HRBP — couche éditoriale ── */}
      {(() => {
        const meta = getMeta(l.name, leadersMap);
        const form = metaForm || meta;
        const startEdit = () => { setMetaForm({ ...meta }); setEditingMeta(true); };
        const cancelEdit = () => { setMetaForm(null); setEditingMeta(false); };
        const commitEdit = () => {
          saveMeta(l.name, form);
          setMetaForm(null);
          setEditingMeta(false);
        };
        const FF = (k, v) => setMetaForm(p => ({ ...p, [k]: v }));
        const hasMeta = !!(meta.type || meta.pressure || meta.topIssue || meta.nextAction || meta.execSummary || meta.riskOverride || meta.levelOverride || (meta.tags && meta.tags.length > 0));

        return (
          <div style={{ background:C.surf, border:`1px solid ${C.purple}33`,
            borderLeft:`4px solid ${C.purple}`, borderRadius:12,
            padding:"16px 20px", marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12,
              paddingBottom:8, borderBottom:`1px solid ${C.purple}22` }}>
              <span style={{ fontSize:13 }}>📝</span>
              <Mono size={9} color={C.purple}>NOTE HRBP — COUCHE ÉDITORIALE</Mono>
              <div style={{ flex:1 }}/>
              {!editingMeta && (
                <>
                  <button onClick={()=>aiAssess(l)} disabled={aiAssessing}
                    title="Réévaluer depuis le OS (meetings + cases)"
                    style={{ ...css.btn(C.teal, true), padding:"5px 11px", fontSize:11, opacity:aiAssessing?.5:1 }}>
                    {aiAssessing ? "⏳..." : "🔄 AI assess"}
                  </button>
                  <button onClick={startEdit}
                    style={{ ...css.btn(C.purple, true), padding:"5px 11px", fontSize:11 }}>
                    {hasMeta ? "✏ Modifier" : "+ Ajouter"}
                  </button>
                </>
              )}
              {editingMeta && (
                <>
                  <button onClick={commitEdit} style={{ ...css.btn(C.em), padding:"5px 12px", fontSize:11 }}>✓ Enregistrer</button>
                  <button onClick={cancelEdit} style={{ ...css.btn(C.textM, true), padding:"5px 11px", fontSize:11 }}>Annuler</button>
                </>
              )}
            </div>

            {!editingMeta && !hasMeta && (
              <div style={{ fontSize:12, color:C.textD, fontStyle:"italic" }}>
                Aucune note HRBP. Clique sur "+ Ajouter" pour saisir type, pression, enjeu et next action.
              </div>
            )}

            {!editingMeta && hasMeta && (
              <div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10 }}>
                  {meta.type && <Badge label={`${TYPE_ICON[meta.type]||""} ${meta.type}`} color={C.purple}/>}
                  {meta.pressure && <Badge label={`Pression ${meta.pressure}`} color={meta.pressure==="Elevee"||meta.pressure==="Élevée"?C.red:meta.pressure==="Moderee"||meta.pressure==="Modérée"?C.amber:C.em}/>}
                  {meta.riskOverride && <Badge label={`Risque (override): ${meta.riskOverride}`} color={C.red}/>}
                </div>
                {meta.tags?.length > 0 && <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:8 }}>{meta.tags.map((t,i) => <Badge key={i} label={t} color={C.textM} size={9}/>)}</div>}
                {meta.topIssue && <InfoRow label="Enjeu principal"><div style={{ fontSize:13, color:C.text, lineHeight:1.5 }}>⚑ {meta.topIssue}</div></InfoRow>}
                {meta.nextAction && <InfoRow label="Prochaine action HRBP"><div style={{ fontSize:13, color:C.em, lineHeight:1.5 }}>→ {meta.nextAction}</div></InfoRow>}
                {meta.execSummary && <InfoRow label="Note libre"><div style={{ fontSize:12, color:C.textM, lineHeight:1.6, whiteSpace:"pre-wrap" }}>{meta.execSummary}</div></InfoRow>}
                {meta.lastInteraction && <Mono size={8} color={C.textD}>Dernière éval: {meta.lastInteraction}</Mono>}
              </div>
            )}

            {editingMeta && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:10 }}>
                <div>
                  <Mono size={8} color={C.textD}>Type</Mono>
                  <select value={form.type||""} onChange={e=>FF("type", e.target.value)} style={{ ...css.select, marginTop:4, fontSize:12 }}>
                    <option value="">—</option>
                    {MANAGER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <Mono size={8} color={C.textD}>Niveau</Mono>
                  <select value={form.levelOverride||""} onChange={e=>FF("levelOverride", e.target.value)} style={{ ...css.select, marginTop:4, fontSize:12 }}>
                    <option value="">— (auto)</option>
                    <option value="employe">Employé</option>
                    <option value="gestionnaire">Gestionnaire</option>
                    <option value="directeur">Directeur</option>
                    <option value="vp">VP</option>
                    <option value="executif">Exécutif</option>
                    <option value="hrbp_team">HRBP Team</option>
                    <option value="ta_team">TA Team</option>
                    <option value="autres">Autres</option>
                  </select>
                </div>
                <div>
                  <Mono size={8} color={C.textD}>Pression</Mono>
                  <select value={form.pressure||""} onChange={e=>FF("pressure", e.target.value)} style={{ ...css.select, marginTop:4, fontSize:12 }}>
                    <option value="">—</option>
                    <option value="Elevee">Élevée</option>
                    <option value="Moderee">Modérée</option>
                    <option value="Faible">Faible</option>
                  </select>
                </div>
                <div>
                  <Mono size={8} color={C.textD}>Risque (override)</Mono>
                  <select value={form.riskOverride||""} onChange={e=>FF("riskOverride", e.target.value)} style={{ ...css.select, marginTop:4, fontSize:12 }}>
                    <option value="">— (auto)</option>
                    {RISK_LEVELS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn:"1 / -1" }}>
                  <Mono size={8} color={C.textD}>Enjeu principal</Mono>
                  <input value={form.topIssue||""} onChange={e=>FF("topIssue", e.target.value)}
                    placeholder="Ex: Évite les conversations de performance"
                    style={{ ...css.input, marginTop:4, fontSize:12 }}/>
                </div>
                <div style={{ gridColumn:"1 / -1" }}>
                  <Mono size={8} color={C.textD}>Prochaine action HRBP</Mono>
                  <input value={form.nextAction||""} onChange={e=>FF("nextAction", e.target.value)}
                    placeholder="Ex: Coaching ciblé conversation difficile"
                    style={{ ...css.input, marginTop:4, fontSize:12 }}/>
                </div>
                <div style={{ gridColumn:"1 / -1" }}>
                  <Mono size={8} color={C.textD}>Note libre HRBP</Mono>
                  <textarea rows={3} value={form.execSummary||""} onChange={e=>FF("execSummary", e.target.value)}
                    placeholder="Contexte, observations, patterns, plan stratégique..."
                    style={{ ...css.textarea, marginTop:4, fontSize:12 }}/>
                </div>
                <div style={{ gridColumn:"1 / -1" }}>
                  <Mono size={8} color={C.textD}>Tags</Mono>
                  <input value={Array.isArray(form.tags) ? form.tags.join(", ") : (form.tags||"")}
                    onChange={e=>FF("tags", e.target.value.split(",").map(t=>t.trim()).filter(Boolean))}
                    placeholder="Ex: high-potential, succession, retention-risk"
                    style={{ ...css.input, marginTop:4, fontSize:12 }}/>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── LEADER 360 — LECTURE STRATÉGIQUE ── */}
      <div style={{ background:C.surf, border:`1px solid ${r360Color}44`,
        borderLeft:`4px solid ${r360Color}`, borderRadius:12,
        padding:"16px 20px", marginBottom:16 }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14,
          paddingBottom:10, borderBottom:`1px solid ${r360Color}22` }}>
          <span style={{ fontSize:13 }}>🔬</span>
          <Mono size={9} color={r360Color}>LECTURE STRATÉGIQUE 360</Mono>
          <div style={{ flex:1 }}/>
          <div style={{ background:r360Color+"22", border:`1px solid ${r360Color}55`,
            borderRadius:5, padding:"3px 9px", display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ width:7, height:7, borderRadius:"50%", background:r360Color,
              display:"inline-block" }}/>
            <Mono size={9} color={r360Color}>Risque global · {r360.globalRisk}</Mono>
          </div>
        </div>

        {/* 3-col grid */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>

          {/* B — Patterns observés */}
          <div>
            <Mono size={8} color={C.textD} style={{ marginBottom:8 }}>Patterns observés</Mono>
            <div style={{ marginTop:6, display:"flex", flexDirection:"column", gap:5 }}>
              {r360.patterns.length > 0 ? r360.patterns.map((p, i) => (
                <div key={i} style={{ fontSize:11, color:C.text,
                  background:C.surfL, border:`1px solid ${C.border}`,
                  borderRadius:5, padding:"4px 9px", lineHeight:1.4 }}>
                  {p}
                </div>
              )) : (
                <div style={{ fontSize:11, color:C.textD, fontStyle:"italic" }}>
                  Aucun pattern détecté
                </div>
              )}
            </div>
          </div>

          {/* C — Facteurs observés */}
          <div>
            <Mono size={8} color={C.textD} style={{ marginBottom:8 }}>Facteurs observés</Mono>
            <div style={{ marginTop:6, display:"flex", flexDirection:"column", gap:5 }}>
              {r360.why.length > 0 ? r360.why.map((w, i) => (
                <div key={i} style={{ display:"flex", gap:7, alignItems:"flex-start" }}>
                  <div style={{ width:5, height:5, borderRadius:"50%", background:r360Color,
                    flexShrink:0, marginTop:6 }}/>
                  <span style={{ fontSize:11, color:C.textM, lineHeight:1.55 }}>{w}</span>
                </div>
              )) : (
                <div style={{ fontSize:11, color:C.textD, fontStyle:"italic" }}>
                  Données insuffisantes
                </div>
              )}
            </div>
          </div>

          {/* D — Actions recommandées */}
          <div>
            <Mono size={8} color={C.textD} style={{ marginBottom:8 }}>Actions recommandées</Mono>
            <div style={{ marginTop:6, display:"flex", flexDirection:"column", gap:7 }}>
              {r360.actions.map((a, i) => (
                <div key={i} style={{ display:"flex", gap:7, alignItems:"flex-start" }}>
                  <span style={{ flexShrink:0, background:(DELAY_C[a.delay]||C.blue)+"22",
                    border:`1px solid ${(DELAY_C[a.delay]||C.blue)}55`,
                    borderRadius:4, padding:"2px 7px", fontSize:9, fontWeight:700,
                    color:DELAY_C[a.delay]||C.blue,
                    fontFamily:"'DM Mono',monospace", letterSpacing:.4, whiteSpace:"nowrap" }}>
                    {a.delay}
                  </span>
                  <span style={{ fontSize:11, color:C.text, lineHeight:1.55 }}>{a.action}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── TIMELINE LEADER V2 ── */}
      {timeline.length > 0 && (
        <div style={{ background:C.surf, border:`1px solid ${C.border}`,
          borderRadius:12, padding:"16px 20px", marginBottom:16 }}>

          {/* Header */}
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10,
            paddingBottom:9, borderBottom:`1px solid ${C.border}`, flexWrap:"wrap" }}>
            <span style={{ fontSize:13 }}>⏱</span>
            <Mono size={9} color={C.textD}>TIMELINE</Mono>
            <Mono size={8} color={C.textD}>
              — {timeline.length} événement{timeline.length > 1 ? "s" : ""}
            </Mono>
            {tlHighActivity && (
              <span style={{ background:C.amber+"22", border:`1px solid ${C.amber}44`,
                borderRadius:4, padding:"2px 8px", fontSize:9, fontWeight:700,
                color:C.amber, fontFamily:"'DM Mono',monospace", letterSpacing:.3 }}>
                ⚡ Activité élevée · 14j
              </span>
            )}
          </div>

          {/* Filter chips */}
          <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:12 }}>
            {[
              { key:"all",     label:"Tous",     icon:"·" },
              { key:"meeting", label:"Meetings", icon:"🎙️" },
              { key:"case",    label:"Cases",    icon:"📂" },
              { key:"signal",  label:"Signaux",  icon:"📡" },
              { key:"exit",    label:"Exits",    icon:"🚪" },
            ].map(f => {
              const count = f.key === "all"
                ? timeline.length
                : timeline.filter(i => i.type === f.key).length;
              if (f.key !== "all" && count === 0) return null;
              const isActive = tlFilter === f.key;
              const col = f.key === "all" ? C.em : (TL_COLOR[f.key] || C.textD);
              return (
                <button key={f.key}
                  onClick={() => { setTlFilter(f.key); setTlExpanded(false); }}
                  style={{ background: isActive ? col+"22" : "none",
                    border:`1px solid ${isActive ? col+"55" : C.border}`,
                    borderRadius:5, padding:"3px 9px", fontSize:9,
                    fontWeight: isActive ? 700 : 400,
                    color: isActive ? col : C.textD,
                    cursor:"pointer", fontFamily:"'DM Mono',monospace",
                    letterSpacing:.3, whiteSpace:"nowrap" }}>
                  {f.icon} {f.label}
                  <span style={{ marginLeft:4, opacity:.6 }}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Month groups */}
          {tlGrouped.length === 0 ? (
            <div style={{ fontSize:11, color:C.textD, padding:"8px 0" }}>
              Aucun événement pour ce filtre.
            </div>
          ) : tlGrouped.map(group => (
            <div key={group.key} style={{ marginBottom:6 }}>

              {/* Month label */}
              <div style={{ display:"flex", alignItems:"center", gap:6,
                padding:"7px 0 3px" }}>
                <Mono size={8} color={C.textD}
                  style={{ textTransform:"uppercase", letterSpacing:.8 }}>
                  {group.label}
                </Mono>
                <span style={{ flex:1, height:1, background:C.border }}/>
                <Mono size={7} color={C.textD}>{group.items.length}</Mono>
              </div>

              {/* Events in group */}
              {group.items.map((item, i) => {
                const color = TL_COLOR[item.type] || C.textD;
                const rObj  = item.severity
                  ? (RISK[normalizeRisk(item.severity)] || null)
                  : null;
                const ago = tlDaysAgo(item.date);
                return (
                  <button key={`${item.type}-${item.id || i}`}
                    onClick={() => tlNav(item)}
                    style={{ display:"flex", alignItems:"center", gap:10, width:"100%",
                      background:"none", border:"none",
                      borderBottom:`1px solid ${C.border}`, padding:"7px 0",
                      cursor:"pointer", textAlign:"left",
                      fontFamily:"'DM Sans',sans-serif", transition:"background .1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = color + "0d"}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}>

                    {/* Date + relative */}
                    <div style={{ width:88, flexShrink:0 }}>
                      <Mono size={8} color={C.textD}>{item.date || "—"}</Mono>
                      {ago && (
                        <div style={{ fontSize:8, color:C.textD, marginTop:1,
                          fontFamily:"'DM Mono',monospace" }}>
                          {ago}
                        </div>
                      )}
                    </div>

                    {/* Type chip */}
                    <span style={{ flexShrink:0, background:color+"18",
                      border:`1px solid ${color}44`, borderRadius:4,
                      padding:"2px 7px", fontSize:9, fontWeight:700, color,
                      fontFamily:"'DM Mono',monospace", letterSpacing:.4,
                      whiteSpace:"nowrap" }}>
                      {TL_ICON[item.type]} {TL_LABEL[item.type] || item.type.toUpperCase()}
                    </span>

                    {/* Label */}
                    <span style={{ fontSize:12, color:C.text, flex:1, lineHeight:1.4,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {item.label}
                    </span>

                    {/* Severity badge */}
                    {rObj && <Badge label={item.severity} color={rObj.color} size={9}/>}

                    {/* Arrow */}
                    <span style={{ fontSize:9, color, flexShrink:0, marginLeft:4,
                      fontFamily:"'DM Mono',monospace" }}>→</span>
                  </button>
                );
              })}
            </div>
          ))}

          {/* Expand / collapse */}
          {tlFiltered.length > TL_MAX && (
            <button onClick={() => setTlExpanded(x => !x)}
              style={{ background:"none", border:"none", marginTop:6,
                fontSize:10, color:C.em, cursor:"pointer", padding:0,
                fontFamily:"'DM Mono',monospace" }}>
              {tlExpanded
                ? "↑ Réduire"
                : `↓ Voir tout — ${tlFiltered.length - TL_MAX} de plus`}
            </button>
          )}
        </div>
      )}

      {/* ── MAIN 2-COL GRID ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>

        {/* ── LEFT COLUMN ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

          {/* Bloc 1 — Dossiers actifs */}
          {activeCases.length > 0 && (
            <Card>
              <SH icon="🔴" label="DOSSIERS ACTIFS" color={C.red}
                sub={`${activeCases.length} en cours`}/>
              {activeCases.slice(0,4).map((c,i) => {
                const isOverdue = c.dueDate && c.dueDate < todayISO;
                return (
                  <button key={c.id||i}
                    onClick={() => onNavigate("cases", { focusCaseId: c.id })}
                    style={{ display:"block", width:"100%", background:"none", border:"none",
                      borderBottom:`1px solid ${C.border}`, padding:"8px 0",
                      cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif",
                      transition:"background .1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = C.em+"0d"}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                      <span style={{ fontSize:12, fontWeight:500,
                        color:isOverdue ? C.red : C.text, flex:1, lineHeight:1.4 }}>
                        {c.title}
                      </span>
                      <div style={{ display:"flex", gap:4, flexShrink:0, alignItems:"center" }}>
                        <RiskBadge level={c.riskLevel}/>
                        {c.urgency && <Badge label={c.urgency} color={URGENCY_C[c.urgency]||C.textD} size={9}/>}
                        <span style={{ fontSize:9, color:C.em, fontFamily:"'DM Mono',monospace", marginLeft:2 }}>→</span>
                      </div>
                    </div>
                    <div style={{ fontSize:10, color:C.textD, marginTop:3, lineHeight:1.5 }}>
                      {[
                        CASE_TYPE_LABEL[c.type] || c.type,
                        isOverdue ? `⚠ Échéance dépassée: ${c.dueDate}` : c.dueDate ? `📅 ${c.dueDate}` : null,
                        c.hrPosture ? `Posture: ${c.hrPosture}` : null,
                      ].filter(Boolean).join(" · ")}
                    </div>
                    {(c.evolution || c.owner) && (
                      <div style={{ display:"flex", gap:5, marginTop:4, alignItems:"center" }}>
                        {c.evolution && <Badge label={c.evolution} color={EVO_C[c.evolution]||C.textD} size={9}/>}
                        {c.owner && c.owner !== "HRBP" && <Mono size={8} color={C.textD}>Owner: {c.owner}</Mono>}
                      </div>
                    )}
                  </button>
                );
              })}
              {activeCases.length > 4 && (
                <button onClick={() => onNavigate("cases")}
                  style={{ display:"block", width:"100%", background:"none", border:"none",
                    fontSize:10, color:C.em, marginTop:6, cursor:"pointer",
                    textAlign:"left", fontFamily:"'DM Mono',monospace", padding:0 }}>
                  +{activeCases.length - 4} autre{activeCases.length-4>1?"s":""} — voir Case Log →
                </button>
              )}
            </Card>
          )}

          {/* Bloc 2 — Signaux & patterns */}
          {highSignals.length > 0 && (
            <Card>
              <SH icon="📡" label="SIGNAUX & PATTERNS" color={C.amber}
                sub={`${highSignals.length} signal${highSignals.length>1?"s":""} élevés`}/>
              {highSignals.map((s,i) => (
                <div key={i} style={{ borderBottom:`1px solid ${C.border}`, padding:"7px 0" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                    <span style={{ fontSize:12, color:C.text, flex:1, lineHeight:1.4 }}>{s.signal}</span>
                    <Badge label={s.level} color={s.level==="Critique"?C.red:C.amber} size={9}/>
                  </div>
                  <div style={{ fontSize:10, color:C.textD, marginTop:2 }}>
                    {[s.breadth, s._date].filter(Boolean).join(" · ")}
                  </div>
                  {s.ifUnaddressed && (
                    <div style={{ fontSize:10, color:C.textD, fontStyle:"italic", marginTop:2,
                      borderLeft:`2px solid ${C.amber}44`, paddingLeft:6 }}>
                      {s.ifUnaddressed}
                    </div>
                  )}
                </div>
              ))}
            </Card>
          )}

          {/* Bloc 3 — Messages clés HRBP */}
          {keyMessages.length > 0 && (
            <Card>
              <SH icon="💬" label="MESSAGES CLÉS HRBP" color={C.blue}/>
              {keyMessages.map((m,i) => (
                <div key={i} style={{ borderBottom:`1px solid ${C.border}`, padding:"7px 0" }}>
                  <div style={{ fontSize:12, color:C.text, lineHeight:1.5 }}>{m.msg}</div>
                  <div style={{ display:"flex", gap:6, alignItems:"center", marginTop:4 }}>
                    <Mono size={8} color={C.textD}>{m.date}</Mono>
                    {m.risk && <RiskBadge level={m.risk}/>}
                    {m.source === "engine" && <Badge label="Meeting Engine" color={C.purple} size={8}/>}
                  </div>
                </div>
              ))}
            </Card>
          )}

          {/* Bloc 4 — Actions prioritaires */}
          {meetingActions.length > 0 && (
            <Card>
              <SH icon="✅" label="ACTIONS PRIORITAIRES" color={C.em}
                sub="issues des meetings"/>
              {meetingActions.map((a,i) => (
                <div key={i} style={{ borderBottom:`1px solid ${C.border}`, padding:"7px 0" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", gap:8, alignItems:"flex-start" }}>
                    <span style={{ fontSize:12, color:C.text, flex:1, lineHeight:1.4 }}>{a.action}</span>
                    <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                      {a.impact && <Badge label={a.impact} color={a.impact==="Eleve"?C.amber:C.textD} size={9}/>}
                      {a.delay  && <Badge label={a.delay}  color={C.blue} size={9}/>}
                    </div>
                  </div>
                  <Mono size={8} color={C.textD}>
                    {[a.owner, a._date].filter(Boolean).join(" · ")}
                  </Mono>
                </div>
              ))}
            </Card>
          )}

          {/* Bloc 5 — Exits liés */}
          {(l.exits||[]).length > 0 && (
            <Card>
              <SH icon="🚪" label="DÉPARTS LIÉS" color={C.textM}
                sub={`${(l.exits||[]).length} départ${(l.exits||[]).length>1?"s":""}`}/>
              {sortByDate(l.exits||[], "savedAt").slice(0,3).map((ex,i) => {
                const dept = ex.result?.summary?.departure_type;
                const sent = ex.result?.management?.overallSentiment;
                const dc   = EXIT_DC[dept] || C.textM;
                const sc   = EXIT_SC[sent] || C.textD;
                return (
                  <button key={ex.id||i}
                    onClick={() => onNavigate("exit", { focusExitId: ex.id })}
                    style={{ display:"block", width:"100%", background:"none", border:"none",
                      borderBottom:`1px solid ${C.border}`, padding:"8px 0",
                      cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif",
                      transition:"background .1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = C.textM+"0d"}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                      <span style={{ fontSize:12, fontWeight:500, color:C.text, flex:1, lineHeight:1.4 }}>
                        {ex.result?.summary?.headline || ex.employeeName || "Départ"}
                      </span>
                      <div style={{ display:"flex", gap:4, flexShrink:0, alignItems:"center" }}>
                        {dept && <Badge label={dept} color={dc} size={9}/>}
                        <span style={{ fontSize:9, color:C.textM, fontFamily:"'DM Mono',monospace", marginLeft:2 }}>→</span>
                      </div>
                    </div>
                    <div style={{ fontSize:10, color:C.textD, marginTop:3, lineHeight:1.5 }}>
                      {[
                        ex.role,
                        ex.team,
                        sent ? <span key="sent" style={{ color:sc }}>Mgmt: {sent}</span> : null,
                        ex.savedAt,
                      ].filter(Boolean).reduce((acc, el, idx) => (
                        idx === 0 ? [el] : [...acc, " · ", el]
                      ), [])}
                    </div>
                  </button>
                );
              })}
              {(l.exits||[]).length > 3 && (
                <button onClick={() => onNavigate("exit")}
                  style={{ display:"block", width:"100%", background:"none", border:"none",
                    fontSize:10, color:C.textM, marginTop:4, cursor:"pointer",
                    textAlign:"left", fontFamily:"'DM Mono',monospace", padding:0 }}>
                  +{(l.exits||[]).length - 3} autre{(l.exits||[]).length-3>1?"s":""} — voir les départs →
                </button>
              )}
            </Card>
          )}

          {/* Bloc 6 — Signaux liés */}
          {(l.signals||[]).length > 0 && (
            <Card>
              <SH icon="📡" label="SIGNAUX LIÉS" color={C.purple}
                sub={`${(l.signals||[]).length} signal${(l.signals||[]).length>1?"s":""}`}/>
              {sortByDate(l.signals||[], "savedAt").slice(0,3).map((s,i) => {
                const sev = s.analysis?.severity || "Modéré";
                const r   = RISK[normalizeRisk(sev)] || RISK["Modéré"];
                return (
                  <button key={s.id||i}
                    onClick={() => onNavigate("signals", { focusSignalId: s.id })}
                    style={{ display:"block", width:"100%", background:"none", border:"none",
                      borderBottom:`1px solid ${C.border}`, padding:"7px 0",
                      cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif",
                      transition:"background .1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = C.purple+"0d"}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                      <span style={{ fontSize:12, fontWeight:500, color:C.text, flex:1, lineHeight:1.4 }}>
                        {s.analysis?.title || s.signal?.substring(0,50) || "Signal"}
                      </span>
                      <div style={{ display:"flex", gap:4, flexShrink:0, alignItems:"center" }}>
                        <Badge label={sev} color={r.color} size={9}/>
                        <span style={{ fontSize:9, color:C.purple, fontFamily:"'DM Mono',monospace", marginLeft:2 }}>→</span>
                      </div>
                    </div>
                    <div style={{ fontSize:10, color:C.textD, marginTop:2 }}>
                      {[s.analysis?.category, s.savedAt].filter(Boolean).join(" · ")}
                    </div>
                  </button>
                );
              })}
              {(l.signals||[]).length > 3 && (
                <button onClick={() => onNavigate("signals")}
                  style={{ display:"block", width:"100%", background:"none", border:"none",
                    fontSize:10, color:C.purple, marginTop:4, cursor:"pointer",
                    textAlign:"left", fontFamily:"'DM Mono',monospace", padding:0 }}>
                  +{(l.signals||[]).length - 3} autre{(l.signals||[]).length-3>1?"s":""} — voir tous les signaux →
                </button>
              )}
            </Card>
          )}

        </div>

        {/* ── RIGHT COLUMN ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

          {/* Bloc 5 — Lecture RH */}
          {lecture && (
            <Card style={{ borderLeft:`3px solid ${C.em}` }}>
              <SH icon="🧠" label="LECTURE RH" color={C.em} sub={lectureDate||""}/>

              {lecture.lectureGestionnaire?.style && (
                <InfoRow label="Style de gestion">
                  <div style={{ fontSize:12, fontWeight:600, color:C.text }}>
                    {lecture.lectureGestionnaire.style}
                  </div>
                </InfoRow>
              )}

              {lecture.lectureGestionnaire?.angles && (
                <InfoRow label="Angle recommandé">
                  <div style={{ fontSize:12, color:C.textM, lineHeight:1.5 }}>
                    {lecture.lectureGestionnaire.angles}
                  </div>
                </InfoRow>
              )}

              {lecture.postureHRBP && (
                <InfoRow label="Posture HRBP">
                  <div style={{ display:"flex", alignItems:"flex-start", gap:8, flexWrap:"wrap" }}>
                    <Badge label={lecture.postureHRBP.mode}
                      color={POSTURE_MODE_C[lecture.postureHRBP.mode]||C.textD}/>
                    {lecture.postureHRBP.justification && (
                      <span style={{ fontSize:11, color:C.textM, lineHeight:1.4 }}>
                        {lecture.postureHRBP.justification}
                      </span>
                    )}
                  </div>
                </InfoRow>
              )}

              {lecture.risqueCle && (
                <div style={{ background:C.surfL, borderRadius:6, padding:"9px 11px", marginTop:4 }}>
                  <Mono size={8} color={C.textD}>Risque clé identifié</Mono>
                  <div style={{ display:"flex", gap:7, marginTop:5, alignItems:"center" }}>
                    <Badge label={lecture.risqueCle.niveau||"—"}
                      color={(RISK[normalizeRisk(lecture.risqueCle.niveau)]||RISK["Faible"]).color}/>
                    <span style={{ fontSize:11, color:C.textM }}>{lecture.risqueCle.nature}</span>
                  </div>
                  {lecture.risqueCle.rationale && (
                    <div style={{ fontSize:11, color:C.textD, fontStyle:"italic", marginTop:5, lineHeight:1.5 }}>
                      {lecture.risqueCle.rationale}
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Bloc 6 — Focus équipe */}
          {sante && (
            <Card>
              <SH icon="👥" label="FOCUS ÉQUIPE" color={C.teal} sub={lectureDate||""}/>
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                {sante.performance && (
                  <div style={{ flex:1, background:C.surfL, borderRadius:6, padding:"8px 10px" }}>
                    <Mono size={8} color={C.textD}>Performance</Mono>
                    <div style={{ fontSize:12, fontWeight:600, marginTop:4,
                      color:SANTE_C[sante.performance]||C.text }}>
                      {sante.performance}
                    </div>
                  </div>
                )}
                {sante.engagement && (
                  <div style={{ flex:1, background:C.surfL, borderRadius:6, padding:"8px 10px" }}>
                    <Mono size={8} color={C.textD}>Engagement</Mono>
                    <div style={{ fontSize:12, fontWeight:600, marginTop:4,
                      color:SANTE_C[sante.engagement]||C.text }}>
                      {sante.engagement}
                    </div>
                  </div>
                )}
              </div>
              {sante.dynamique && (
                <div style={{ fontSize:12, color:C.textM, lineHeight:1.6, fontStyle:"italic" }}>
                  {sante.dynamique}
                </div>
              )}
            </Card>
          )}

          {/* Bloc 7 — Plans 30-60-90 */}
          {linkedPlans.length > 0 && (
            <Card>
              <SH icon="📅" label="30-60-90 EN COURS" color="#06b6d4"
                sub={`${linkedPlans.length} plan${linkedPlans.length>1?"s":""}`}/>
              {linkedPlans.map((p, i) => {
                const ph      = p._phase;
                const risk    = p.output?.summary?.transitionRisk;
                const note    = p.output?.summary?.hrbpNote;
                const watchout = ph.phaseKey ? p.output?.[ph.phaseKey]?.watchouts?.[0] : null;
                const typeIcon = PLAN_TYPE_ICON[p.planType] || "📅";
                const isTerminated = ph.label === "Terminé";
                return (
                  <div key={p.id||i} style={{ borderBottom:`1px solid ${C.border}`, padding:"8px 0",
                    opacity: isTerminated ? 0.55 : 1 }}>
                    {/* Name + badges row */}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                      <span style={{ fontSize:12, fontWeight:600, color:C.text, flex:1 }}>
                        {typeIcon} {p.employeeName}
                      </span>
                      <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                        {risk && (
                          <span style={{ background:RISK_C_306(risk)+"22",
                            border:`1px solid ${RISK_C_306(risk)}44`,
                            borderRadius:4, padding:"2px 7px", fontSize:9, fontWeight:700,
                            color:RISK_C_306(risk), fontFamily:"'DM Mono',monospace",
                            letterSpacing:.4 }}>
                            {risk}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Role + phase row */}
                    <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:3, flexWrap:"wrap" }}>
                      <span style={{ fontSize:10, color:C.textM }}>{p.role}</span>
                      {p.team && <span style={{ fontSize:10, color:C.textD }}>· {p.team}</span>}
                    </div>
                    <div style={{ display:"flex", gap:6, alignItems:"center", marginTop:4 }}>
                      <span style={{ background:ph.color+"22", border:`1px solid ${ph.color}44`,
                        borderRadius:4, padding:"2px 8px", fontSize:9, fontWeight:700,
                        color:ph.color, fontFamily:"'DM Mono',monospace", letterSpacing:.4 }}>
                        ▶ {ph.label}
                      </span>
                      {ph.daysLeft !== null && !isTerminated && (
                        <Mono size={8} color={ph.daysLeft <= 5 ? C.red : C.textD}>
                          {ph.daysLeft}j restants
                        </Mono>
                      )}
                    </div>
                    {/* HRBP note */}
                    {note && (
                      <div style={{ fontSize:10, color:C.textD, fontStyle:"italic",
                        marginTop:4, lineHeight:1.5,
                        borderLeft:`2px solid ${"#06b6d4"}44`, paddingLeft:6 }}>
                        {note.length > 120 ? note.slice(0,117)+"…" : note}
                      </div>
                    )}
                    {/* Watchout for current phase */}
                    {watchout && (
                      <div style={{ fontSize:10, color:C.amber, marginTop:3 }}>
                        ⚠ {watchout}
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>
          )}

          {/* Bloc 8 — Historique */}
          {(sortedMeetings.length > 0 || sortedPreps.length > 0) && (
            <Card>
              <SH icon="🕒" label="HISTORIQUE" color={C.textD}/>

              {sortedMeetings.slice(0,4).map((m,i) => {
                const a = mAna(m);
                const r = RISK[normalizeRisk(a.overallRisk)] || RISK["Faible"];
                return (
                  <button key={m.id||i}
                    onClick={() => onNavigate("meetings", { focusMeetingId: m.id })}
                    style={{ display:"block", width:"100%", background:"none", border:"none",
                      borderBottom:`1px solid ${C.border}`, padding:"6px 0",
                      cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif",
                      transition:"opacity .15s", opacity:1 }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
                    onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:11, color:C.blue, flex:1, lineHeight:1.4 }}>
                        🎙️ {a.meetingTitle || m.meetingType || m.engineType || "Meeting"}
                      </span>
                      <div style={{ display:"flex", gap:4, flexShrink:0, alignItems:"center" }}>
                        <Badge label={a.overallRisk||"Faible"} color={r.color} size={9}/>
                        <Mono size={8} color={C.textD}>{m.savedAt}</Mono>
                        <span style={{ fontSize:9, color:C.blue, fontFamily:"'DM Mono',monospace", marginLeft:2 }}>→</span>
                      </div>
                    </div>
                  </button>
                );
              })}
              {sortedMeetings.length > 4 && (
                <button onClick={() => onNavigate("meetings")}
                  style={{ display:"block", width:"100%", background:"none", border:"none",
                    fontSize:10, color:C.blue, marginTop:4, cursor:"pointer",
                    textAlign:"left", fontFamily:"'DM Mono',monospace", padding:0 }}>
                  +{sortedMeetings.length - 4} autre{sortedMeetings.length-4>1?"s":""} — voir tous les meetings →
                </button>
              )}

              {sortedPreps.length > 0 && sortedMeetings.length > 0 && (
                <div style={{ height:1, background:C.border, margin:"6px 0" }}/>
              )}

              {sortedPreps.slice(0,3).map((p,i) => (
                <button key={p.id||i}
                  onClick={() => p.kind === "1:1-meeting"
                    ? onNavigate("meetings", { focusMeetingId: p.id })
                    : onNavigate("meetings")}
                  style={{ display:"block", width:"100%", background:"none", border:"none",
                    borderBottom:`1px solid ${C.border}`, padding:"6px 0",
                    cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif",
                    transition:"opacity .15s", opacity:1 }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
                  onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:11, color:C.blue, flex:1 }}>
                      📋 {p.engineType || p.meetingType || p.output?.meetingTitle || "Meeting"}
                    </span>
                    <div style={{ display:"flex", gap:4, flexShrink:0, alignItems:"center" }}>
                      {p.output?.overallRisk && (
                        <Badge label={p.output.overallRisk}
                          color={(RISK[normalizeRisk(p.output.overallRisk)]||RISK["Faible"]).color}
                          size={9}/>
                      )}
                      <Mono size={8} color={C.textD}>{p.savedAt}</Mono>
                      <span style={{ fontSize:9, color:C.blue, fontFamily:"'DM Mono',monospace", marginLeft:2 }}>→</span>
                    </div>
                  </div>
                </button>
              ))}
            </Card>
          )}

          {/* Empty detail state — leader exists but has thin data */}
          {!lecture && highSignals.length === 0 && activeCases.length === 0 && keyMessages.length === 0 && linkedPlans.length === 0 && (
            <Card style={{ textAlign:"center", padding:"24px 16px" }}>
              <div style={{ fontSize:24, marginBottom:8 }}>📭</div>
              <div style={{ fontSize:12, color:C.textM, marginBottom:4 }}>Données limitées pour ce gestionnaire</div>
              <div style={{ fontSize:11, color:C.textD, lineHeight:1.6 }}>
                Analysez un meeting ou préparez un 1:1 pour enrichir cette fiche.
              </div>
              <div style={{ display:"flex", gap:8, justifyContent:"center", marginTop:12 }}>
                <button onClick={() => onNavigate("meetings")}
                  style={{ padding:"6px 14px", background:C.blue+"18",
                    border:`1px solid ${C.blue}44`, borderRadius:6, color:C.blue,
                    fontSize:11, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                  🎙️ Meetings
                </button>
                <button onClick={() => onNavigate("prep1on1")}
                  style={{ padding:"6px 14px", background:C.teal+"18",
                    border:`1px solid ${C.teal}44`, borderRadius:6, color:C.teal,
                    fontSize:11, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                  🗂️ Préparer 1:1
                </button>
              </div>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}
