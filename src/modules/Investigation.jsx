// Source: HRBP_OS.jsx L.3247-3666
import { useState, useEffect } from "react";
import { C, css, RISK, INV_RED } from '../theme.js';
import { callAIJson } from '../api/index.js';
import { buildLegalPromptContext } from '../utils/legal.js';
import { getProvince, fmtDate } from '../utils/format.js';
import { INV_SP_1, INV_SP_2 } from '../prompts/investigation.js';
import { toArray } from '../utils/meetingModel.js';
import Badge from '../components/Badge.jsx';
import Card from '../components/Card.jsx';
import Mono from '../components/Mono.jsx';
import AILoader from '../components/AILoader.jsx';
import ProvinceBadge from '../components/ProvinceBadge.jsx';
import ProvinceSelect from '../components/ProvinceSelect.jsx';

// B-26 — Titre structuré [Type] – [Sujet]. Utilise uniquement les champs déjà persistés.
export function generateInvestigationTitle(inv) {
  if (!inv) return "Enquête sans titre";
  const type = (inv.caseType || "").trim();
  const subject = (inv.caseTitle || "").trim();
  const parts = [type, subject].filter(Boolean);
  if (parts.length === 0) {
    const id = inv.caseId || (inv.id ? String(inv.id).slice(-6) : "");
    return id ? `Enquête ${id}` : "Enquête sans titre";
  }
  return parts.join(" – ");
}

// B-28 — Bridge Enquête → Meeting Engine.
const INV_ANGLES = {
  complainant: { id:"complainant", label:"Plaignant(e)",  icon:"🔴",
    note:"Recueillir un récit complet, factuel et chronologique." },
  respondent:  { id:"respondent",  label:"Mise en cause", icon:"🟠",
    note:"Présenter les éléments pertinents et obtenir la version des faits." },
  witness:     { id:"witness",     label:"Témoin",        icon:"🔵",
    note:"Valider les faits observés avec des questions neutres et non suggestives." },
};

// B-27 — Liens lean (caseId single, meetings derived)
function getLinkedCase(inv, data) {
  if (!inv?.linkedCaseId) return null;
  return (data?.cases || []).find(c => c.id === inv.linkedCaseId) || null;
}

function getLinkedMeetings(inv, data) {
  if (!inv?.id) return [];
  return (data?.meetings || []).filter(m => m.linkedInvestigationId === inv.id);
}

// Chronologie unifiée — événements dossier + rencontres liées.
// Defensive read: inv.createdAt is optional (not yet populated by data model).
function buildInvestigationTimeline(inv, data) {
  if (!inv) return [];
  const events = [];
  if (inv.createdAt)  events.push({ type:"case", date: inv.createdAt,  label:"Dossier ouvert" });
  if (inv.savedAt)    events.push({ type:"case", date: inv.savedAt,    label:"Dossier archivé" });
  if (inv.enrichedAt) events.push({ type:"case", date: inv.enrichedAt, label:"Dossier complété" });
  (data?.meetings || [])
    .filter(m => m.linkedInvestigationId === inv.id)
    .forEach(m => {
      const title = m.analysis?.meetingTitle || m.ctx?.purpose || m.meetingType || "Rencontre";
      events.push({
        type:"meeting",
        date: m.savedAt || m.ctx?.date,
        label: `Entrevue — ${title}`,
        meetingId: m.id,
      });
    });
  return events
    .filter(e => e.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function buildInvestigationMeetingBridge(inv, angle) {
  const cs = inv?.caseData?.caseSummary || {};
  const title = inv?.title || generateInvestigationTitle(inv);
  const today = new Date().toISOString().split("T")[0];
  return {
    engineType: "enquete",
    linkedInvestigationId: inv?.id,
    caseTitle: title,
    ctx: {
      managerName: "",
      team: "",
      date: today,
      meetingType: "enquete",
      purpose: `Entrevue ${angle.label} — ${inv?.caseType || "Enquête"}`,
      background: [
        `Dossier: ${inv?.caseId || inv?.id || ""}`,
        inv?.caseType ? `Type: ${inv.caseType}` : "",
        cs.situation ? `Situation: ${cs.situation}` : "",
        cs.triggerEvent ? `Déclencheur: ${cs.triggerEvent}` : "",
        `Angle: ${angle.note}`,
      ].filter(Boolean).join("\n\n"),
      activeCases: title,
      province: inv?.province || "",
    }
  };
}

// Inline shared helper (used in multiple modules, to be reviewed at Bloc 7)
function SecHead({ icon, label, color=C.em }) {
  return <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, paddingBottom:8, borderBottom:`1px solid ${color}28` }}>
    <span style={{ fontSize:14 }}>{icon}</span>
    <Mono size={10} color={color}>{label}</Mono>
  </div>;
}

// Inline module-specific components (Source: L.3282-3296)
function InvTag({ label, color=INV_RED }) {
  return <span style={{ background:color+"15", border:`1px solid ${color}30`, color, borderRadius:4,
    padding:"2px 8px", fontSize:9, fontWeight:600, fontFamily:"'DM Mono',monospace",
    letterSpacing:1, textTransform:"uppercase", whiteSpace:"nowrap" }}>{label}</span>;
}

function InvSection({ num, title }) {
  return <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18,
    paddingBottom:12, borderBottom:`2px solid ${INV_RED}` }}>
    <div style={{ background:INV_RED, color:"#fff", width:26, height:26, display:"flex",
      alignItems:"center", justifyContent:"center", fontFamily:"'DM Mono',monospace",
      fontSize:10, fontWeight:500, flexShrink:0, borderRadius:3 }}>{num}</div>
    <span style={{ fontSize:16, fontWeight:700, color:C.text }}>{title}</span>
  </div>;
}

function InvTimeline({ inv, data, onNavigate }) {
  const events = buildInvestigationTimeline(inv, data);
  if (!inv || events.length === 0) return null;
  return (
    <Card style={{ marginBottom:14, borderLeft:`3px solid ${INV_RED}` }}>
      <Mono color={C.textD} size={9}>Chronologie</Mono>
      <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:6 }}>
        {events.map((e, i) => {
          const clickable = e.type === "meeting" && !!onNavigate && !!e.meetingId;
          return (
            <div key={i}
              onClick={clickable ? () => onNavigate("meetings", { focusMeetingId: e.meetingId }) : undefined}
              title={clickable ? "Ouvrir la rencontre" : undefined}
              style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 8px",
                background: e.type === "meeting" ? C.surfL : "transparent",
                border: e.type === "meeting" ? `1px solid ${C.border}` : "none",
                borderRadius:6, cursor: clickable ? "pointer" : "default" }}>
              <Mono color={e.type === "meeting" ? INV_RED : C.textD} size={8}>
                {fmtDate(String(e.date).slice(0, 10))}
              </Mono>
              <span style={{ fontSize:12, color:C.text }}>
                {e.type === "meeting" ? "🎯 " : "• "}{e.label}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// Module-scope display components — prevents remount on every render of ModuleInvestigation.
// InvQ: a single interview question row.
function InvQ({ q, pfx, color }) {
  return (
    <div style={{ display:"flex", gap:10, alignItems:"flex-start", paddingBottom:8, borderBottom:`1px solid ${C.border}` }}>
      <Mono color={color||INV_RED} size={9}>{pfx}</Mono>
      <div style={{ flex:1, fontSize:13, color:C.text, lineHeight:1.65, fontStyle:"italic" }}>{q}</div>
    </div>
  );
}

// Action-type color map — moved to module scope for ActionBlock.
const INV_ACTION_TC = {
  "Disciplinaire":C.red, "Coaching":C.purple, "Formation":C.em,
  "Réorganisation":C.textM, "Politique":C.textM, "Structure":C.amber,
  "Suivi":C.em, "Aucune":C.textD,
};

// ActionBlock: a group of recommended actions for one party.
function ActionBlock({ items, label }) {
  if (!items?.length) return null;
  return (
    <Card style={{ marginBottom:10 }}>
      <Mono color={C.textD} size={9}>{label}</Mono>
      {items.map((item, i) => (
        <div key={i} style={{ background:C.surfL, border:`1px solid ${C.border}`, borderRadius:7,
          padding:"11px 13px", marginTop:10, borderLeft:`3px solid ${INV_ACTION_TC[item.type]||C.textM}` }}>
          <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}>
            <InvTag label={item.type} color={INV_ACTION_TC[item.type]||C.textM}/>
            {item.timeline && <Mono color={C.textD} size={8}>{item.timeline}</Mono>}
            {item.owner    && <Mono color={C.textD} size={8}>Owner: {item.owner}</Mono>}
          </div>
          <div style={{ fontSize:13, fontWeight:500, color:C.text, marginBottom:4 }}>{item.action}</div>
          <div style={{ fontSize:11.5, color:C.textM, lineHeight:1.6 }}>{item.rationale}</div>
        </div>
      ))}
    </Card>
  );
}

// Inline data constants (Source: L.3262-3277)
const INV_TABS = [
  {id:"summary",  num:"01", label:"Résumé"},
  {id:"plan",     num:"02", label:"Plan d'enquête"},
  {id:"guide",    num:"03", label:"Guide entrevue"},
  {id:"evidence", num:"04", label:"Preuve"},
  {id:"findings", num:"05", label:"Conclusions"},
  {id:"actions",  num:"06", label:"Mesures"},
  {id:"report",   num:"07", label:"Rapport"},
];

const INV_FINDING = {
  "Fondée":               { color:"#7a1e2e", icon:"●" },
  "Partiellement fondée": { color:C.amber,   icon:"◑" },
  "Non fondée":           { color:C.em,      icon:"○" },
  "Preuve insuffisante":  { color:C.textM,   icon:"◌" },
};

// Personnes impliquées — identités réelles stockées séparément du narratif (qui reste anonymisé).
const PERSON_ROLES = [
  { value:"plaignant",    label:"Plaignant(e)",    color:INV_RED },
  { value:"mis_en_cause", label:"Mis(e) en cause", color:C.amber },
  { value:"temoin",       label:"Témoin",          color:C.blue },
  { value:"autre",        label:"Autre",           color:C.textM },
];
const PERSON_ROLE_MAP = Object.fromEntries(PERSON_ROLES.map(r => [r.value, r]));
// Backward-compat : anciennes valeurs anglaises → nouvelles valeurs françaises.
const LEGACY_PERSON_ROLE_MAP = {
  complainant: "plaignant",
  respondent:  "mis_en_cause",
  witness:     "temoin",
  other:       "autre",
};
const normalizePersonRole = (r) => LEGACY_PERSON_ROLE_MAP[r] || r || "autre";
const migratePeople = (arr) => (arr || []).map(p => ({ ...p, role: normalizePersonRole(p.role) }));
const newPerson = (role="plaignant") => ({
  id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
  role, fullName:"", organization:"", title:"",
});

export default function ModuleInvestigation({ data, onSave, onNavigate, focusInvestigationId, onClearFocus }) {
  const [view, setView] = useState("list"); // list | input | loading | case
  const [complaint, setComplaint] = useState("");
  const [context, setContext] = useState("");
  const [parties, setParties] = useState("");
  const [policy, setPolicy] = useState("");
  const [evidence, setEvidence] = useState("");
  const [invProvince, setInvProvince] = useState("QC");
  const [invPrompt, setInvPrompt] = useState("");
  const [activeTab, setActiveTab] = useState("summary");
  const [caseData, setCaseData] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [gtab, setGtab] = useState("complainant");
  const [people, setPeople] = useState([]);
  // Phase 2 — Suivi du dossier en cours d'ouverture pour pouvoir promouvoir
  // un brouillon en place (preserve id, caseId, createdAt, source).
  const [openInvId, setOpenInvId] = useState(null);

  const investigations = data.investigations || [];
  const openInv = openInvId ? investigations.find(x => x.id === openInvId) : null;
  const isDraftOpen = !!(openInv && openInv.status === "draft");

  // ── Inter-module focus: auto-open a specific investigation on mount ──────────
  useEffect(() => {
    if (!focusInvestigationId) return;
    const target = investigations.find(x => x.id === focusInvestigationId);
    if (target) { setCaseData(target.caseData||{}); setPeople(migratePeople(target.people)); setOpenInvId(target.id); setActiveTab("summary"); setSaved(true); setView("case"); }
    if (onClearFocus) onClearFocus();
  }, [focusInvestigationId]); // eslint-disable-line

  // Helper : passe en mode enrichissement d'un brouillon existant
  const enrichDraft = (inv) => {
    setOpenInvId(inv.id);
    setComplaint(""); setContext(""); setParties(""); setPolicy(""); setEvidence("");
    setPeople(migratePeople(inv.people));
    setInvProvince(inv.province || data.profile?.defaultProvince || "QC");
    setError("");
    setView("input");
  };

  // People helpers — local edits only, persisted via saveDossier.
  const addPerson  = () => setPeople(ps => [...ps, newPerson()]);
  const updatePerson = (id, patch) => setPeople(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p));
  const removePerson = (id) => setPeople(ps => ps.filter(p => p.id !== id));

  const generate = async () => {
    if (!complaint.trim()) return;
    setError("");
    const _invProvince = invProvince || data.profile?.defaultProvince || "QC";
    const _invLegal = buildLegalPromptContext(_invProvince);
    const userMsg = [
      "Génère un dossier d'enquête complet pour la situation suivante.",
      `
${_invLegal}`,
      `
PLAINTE / SIGNALEMENT:
${complaint}`,
      context  ? `
CONTEXTE ORGANISATIONNEL:
${context}` : "",
      parties  ? `
PARTIES IMPLIQUÉES (rôles génériques):
${parties}` : "",
      policy   ? `
POLITIQUES ET LOIS APPLICABLES:
${policy}` : "",
      evidence ? `
PREUVES INITIALES DISPONIBLES:
${evidence}` : "",
    ].join("");
    setView("loading"); setError("");
    try {
      const part1 = await callAIJson(INV_SP_1, userMsg, 8000);
      const part2 = await callAIJson(INV_SP_2, userMsg, 8000);
      setCaseData({...part1,...part2}); setActiveTab("summary"); setSaved(false); setView("case");
    } catch(e) { setError("Erreur: "+e.message); setView("input"); }
  };

  const saveDossier = () => {
    if (!caseData || saved) return;
    const today = new Date().toISOString().split("T")[0];
    // Phase 2 — Promotion en place d'un brouillon (id, caseId original, source, linkedCaseId préservés)
    if (openInvId) {
      const existing = investigations.find(x => x.id === openInvId);
      if (existing && existing.status === "draft") {
        const merged = {
          ...existing,
          savedAt: today,
          caseId: caseData.caseId || existing.caseId,
          caseTitle: caseData.caseTitle || existing.caseTitle,
          caseType: caseData.caseType || existing.caseType,
          urgencyLevel: caseData.urgencyLevel || existing.urgencyLevel,
          province: invProvince,
          caseData,
          people,
          status: "complete",
          titleAuto: true,
          enrichedAt: new Date().toISOString(),
        };
        merged.title = generateInvestigationTitle(merged);
        const updated = investigations.map(x => x.id === openInvId ? merged : x);
        onSave("investigations", updated);
        setSaved(true);
        return;
      }
    }
    const inv = { id:Date.now().toString(), savedAt:today,
      caseId:caseData.caseId, caseTitle:caseData.caseTitle, caseType:caseData.caseType,
      urgencyLevel:caseData.urgencyLevel, province:invProvince, caseData, people,
      title:"", titleAuto:true, linkedCaseId:null };
    inv.title = generateInvestigationTitle(inv);
    onSave("investigations", [...investigations, inv]);
    setOpenInvId(inv.id);
    setSaved(true);
  };

  // ── SECTION RENDERERS ──────────────────────────────────────────────────────
  function renderSummary() {
    const s = caseData.caseSummary;
    const legalFramework = toArray(caseData.legalFramework);
    const parties        = toArray(s?.parties);
    return <div>
      <InvSection num="01" title="Résumé du dossier"/>
      <div style={{ background:INV_RED+"18", border:`1px solid ${INV_RED}30`,
        borderLeft:`4px solid ${INV_RED}`, padding:"14px 18px", borderRadius:8, marginBottom:12 }}>
        <Mono color={INV_RED} size={9}>{caseData.caseId}</Mono>
        <div style={{ fontSize:16, fontWeight:700, color:C.text, margin:"6px 0 10px" }}>{caseData.caseTitle}</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}><InvTag label={caseData.caseType}/><InvTag label={`Urgence: ${caseData.urgencyLevel}`} color={RISK[caseData.urgencyLevel]?.color||C.amber}/></div>
      </div>
      <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Cadre légal</Mono><div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap" }}>{legalFramework.map((l,i)=><InvTag key={i} label={l} color={C.blue}/>)}</div></Card>
      <Card style={{ marginBottom:10, borderLeft:`3px solid ${INV_RED}` }}><Mono color={C.textD} size={9}>Situation — Résumé factuel et neutre</Mono><div style={{ fontSize:13, color:C.text, lineHeight:1.8, marginTop:8, fontStyle:"italic" }}>{s?.situation}</div></Card>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
        <Card><Mono color={C.textD} size={9}>Événement déclencheur</Mono><div style={{ fontSize:12, color:C.textM, marginTop:6, lineHeight:1.7 }}>{s?.triggerEvent}</div></Card>
        <Card><Mono color={C.textD} size={9}>Date / Période du signalement</Mono><div style={{ fontSize:12, color:C.textM, marginTop:6, lineHeight:1.7 }}>{s?.reportedDate}</div></Card>
      </div>
      <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Parties impliquées</Mono>
        {parties.map((p,i)=><div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start", marginTop:10, paddingBottom:8, borderBottom:i<parties.length-1?`1px solid ${C.border}`:"none" }}><InvTag label={p.role}/><span style={{ fontSize:12, color:C.textM, lineHeight:1.6, flex:1 }}>{p.description}</span></div>)}
      </Card>
      <Card style={{ borderLeft:`3px solid ${C.textM}` }}><Mono color={C.textD} size={9}>Analyse de la question seuil</Mono><div style={{ fontSize:12, color:C.textM, marginTop:6, lineHeight:1.7 }}>{s?.thresholdAnalysis}</div></Card>
    </div>;
  }

  function renderPlan() {
    const p = caseData.investigationPlan;
    const interimMeasures   = toArray(p?.interimMeasures);
    const objectives        = toArray(p?.objectives);
    const interviewOrder    = toArray(p?.interviewOrder);
    const documentsToReview = toArray(p?.documentsToReview);
    return <div>
      <InvSection num="02" title="Plan d'enquête"/>
      <Card style={{ marginBottom:10, borderLeft:`3px solid ${INV_RED}` }}><Mono color={C.textD} size={9}>Mandat de l'enquêteur</Mono><div style={{ fontSize:13, color:C.text, lineHeight:1.75, marginTop:6 }}>{p?.mandate}</div></Card>
      <Card style={{ marginBottom:10 }}>
        <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:8 }}><Mono color={C.textD} size={9}>Type d'enquêteur</Mono><InvTag label={p?.investigatorType} color={p?.investigatorType==="Externe"?INV_RED:C.em}/></div>
        <div style={{ fontSize:12, color:C.textM, lineHeight:1.7 }}>{p?.investigatorRationale}</div>
      </Card>
      {interimMeasures.length>0&&<Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Mesures intérimaires</Mono>
        {interimMeasures.map((m,i)=><div key={i} style={{ background:C.surfL, border:`1px solid ${C.border}`, borderRadius:7, padding:"10px 13px", marginTop:10 }}>
          <div style={{ fontSize:13, fontWeight:500, color:C.text, marginBottom:5 }}>{m.measure}</div>
          <div style={{ fontSize:11.5, color:C.textM, marginBottom:5, lineHeight:1.6 }}>↳ {m.rationale}</div>
          <div style={{ fontSize:11, color:C.textM, fontStyle:"italic" }}>⚖ {m.neutralityNote}</div>
        </div>)}
      </Card>}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
        <Card><Mono color={C.textD} size={9}>Objectifs de l'enquête</Mono>{objectives.map((o,i)=><div key={i} style={{ display:"flex", gap:8, fontSize:12, color:C.textM, marginTop:6, lineHeight:1.6 }}><span style={{ color:INV_RED }}>→</span>{o}</div>)}</Card>
        <Card><Mono color={C.textD} size={9}>Ordre des entrevues</Mono>{interviewOrder.map((item,i)=><div key={i} style={{ display:"flex", gap:9, alignItems:"flex-start", marginTop:8 }}>
          <div style={{ background:INV_RED, color:"#fff", width:20, height:20, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Mono',monospace", fontSize:9, flexShrink:0, borderRadius:3 }}>{item.order}</div>
          <div><div style={{ fontSize:12, fontWeight:500, color:C.text }}>{item.party}</div><div style={{ fontSize:11, color:C.textM, lineHeight:1.5 }}>{item.rationale}</div></div>
        </div>)}</Card>
      </div>
      <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Documents à examiner</Mono>{documentsToReview.map((d,i)=><div key={i} style={{ display:"flex", gap:12, marginTop:8, paddingBottom:8, borderBottom:i<documentsToReview.length-1?`1px solid ${C.border}`:"none" }}>
        <Mono color={C.textD} size={8}>{String(i+1).padStart(2,"0")}</Mono>
        <div><div style={{ fontSize:12, fontWeight:500, color:C.text }}>{d.document}</div><div style={{ fontSize:11, color:C.textM }}>{d.purpose}</div></div>
      </div>)}</Card>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Card><Mono color={C.textD} size={9}>Délai estimé</Mono><div style={{ fontSize:13, fontWeight:500, color:C.text, marginTop:6 }}>{p?.timeline}</div></Card>
        <Card style={{ borderLeft:`3px solid ${C.textM}` }}><Mono color={C.textD} size={9}>Protocole de confidentialité</Mono><div style={{ fontSize:12, color:C.textM, lineHeight:1.7, marginTop:6 }}>{p?.confidentialityProtocol}</div></Card>
      </div>
    </div>;
  }

  function renderGuide() {
    const g = caseData.interviewGuide;
    const gtabs = [{id:"complainant",label:"Plaignant(e)"},{id:"respondent",label:"Mise en cause"},{id:"witnesses",label:"Témoins"}];
    const compDrillDown     = toArray(g?.complainant?.drillDownQuestions);
    const respAllegations   = toArray(g?.respondent?.allegationResponses);
    const respMitigating    = toArray(g?.respondent?.mitigatingFactors);
    const witElimination    = toArray(g?.witnesses?.eliminationQuestions);
    const witMemoryTriggers = toArray(g?.witnesses?.memoryTriggerQuestions);
    // InvQ is now at module scope
    return <div>
      <InvSection num="03" title="Guide d'entrevue"/>
      <Card style={{ marginBottom:12, borderLeft:`3px solid ${C.amber}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <Mono color={C.textD} size={9}>Préambule standard — À lire en début de toute entrevue</Mono>
        </div>
        <div style={{ background:C.amber+"15", border:`1px solid ${C.amber}30`, borderRadius:7, padding:"10px 13px", fontSize:12, color:C.text, lineHeight:1.8, fontStyle:"italic" }}>{g?.preambleScript}</div>
      </Card>
      <div style={{ display:"flex", gap:0, marginBottom:14, borderBottom:`2px solid ${C.border}` }}>
        {gtabs.map(t=><button key={t.id} onClick={()=>setGtab(t.id)} style={{ background:"none", border:"none", cursor:"pointer", padding:"9px 16px", fontFamily:"'DM Mono',monospace", fontSize:9, fontWeight:500, letterSpacing:1.5, color:gtab===t.id?INV_RED:C.textD, borderBottom:`2px solid ${gtab===t.id?INV_RED:"transparent"}`, marginBottom:-2, textTransform:"uppercase" }}>{t.label}</button>)}
      </div>
      {gtab==="complainant"&&<div>
        <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Question d'ouverture</Mono><div style={{ fontSize:13, color:C.text, fontStyle:"italic", lineHeight:1.7, marginTop:8 }}>"{g?.complainant?.openingQuestion}"</div></Card>
        <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Questions de drill-down</Mono><div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:10 }}>{compDrillDown.map((q,i)=><InvQ key={i} q={q} pfx={`Q${i+1}`}/>)}</div></Card>
        <Card><Mono color={C.textD} size={9}>Question finale de conclusion</Mono><div style={{ fontSize:13, color:C.text, fontStyle:"italic", marginTop:8 }}>"{g?.complainant?.closingQuestion}"</div></Card>
      </div>}
      {gtab==="respondent"&&<div>
        <Card style={{ marginBottom:10, background:C.amber+"0a", borderLeft:`3px solid ${C.amber}` }}><Mono color={C.textD} size={9}>Note sur la divulgation des allégations</Mono><div style={{ fontSize:12, color:C.textM, lineHeight:1.7, marginTop:6 }}>{g?.respondent?.disclosureNote}</div></Card>
        <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Question d'ouverture</Mono><div style={{ fontSize:13, color:C.text, fontStyle:"italic", lineHeight:1.7, marginTop:8 }}>"{g?.respondent?.openingQuestion}"</div></Card>
        <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Réponses aux allégations</Mono><div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:10 }}>{respAllegations.map((q,i)=><InvQ key={i} q={q} pfx={`A${i+1}`} color={C.amber}/>)}</div></Card>
        <Card><Mono color={C.textD} size={9}>Facteurs atténuants</Mono><div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:10 }}>{respMitigating.map((q,i)=><InvQ key={i} q={q} pfx={`M${i+1}`} color={C.textM}/>)}</div></Card>
      </div>}
      {gtab==="witnesses"&&<div>
        <Card style={{ marginBottom:10, borderLeft:`3px solid ${C.textM}` }}><Mono color={C.textD} size={9}>Approche — contacter sans divulguer le contexte</Mono><div style={{ fontSize:12, color:C.textM, lineHeight:1.7, marginTop:6 }}>{g?.witnesses?.approachNote}</div></Card>
        <Card style={{ marginBottom:10, background:C.blue+"08", borderLeft:`3px solid ${C.blue}` }}><Mono color={C.textD} size={9}>Technique Bull's-Eye — application au présent dossier</Mono><div style={{ fontSize:12, color:C.textM, lineHeight:1.7, marginTop:6 }}>{g?.witnesses?.bullseyeApproach}</div></Card>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <Card><Mono color={C.textD} size={9}>Questions d'élimination</Mono><div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:10 }}>{witElimination.map((q,i)=><InvQ key={i} q={q} pfx={`E${i+1}`} color={C.textM}/>)}</div></Card>
          <Card><Mono color={C.textD} size={9}>Déclencheurs de mémoire</Mono><div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:10 }}>{witMemoryTriggers.map((q,i)=><InvQ key={i} q={q} pfx={`M${i+1}`} color={C.em}/>)}</div></Card>
        </div>
      </div>}
    </div>;
  }

  function renderEvidence() {
    const ev = caseData.evidenceAnalysis;
    const WC = {"Fort":C.red,"Modéré":C.amber,"Faible":C.textM};
    const establishedFacts  = toArray(ev?.establishedFacts);
    const contestedElements = toArray(ev?.contestedElements);
    const evidenceGaps      = toArray(ev?.evidenceGaps);
    const hearsayFlags      = toArray(ev?.hearsayFlags);
    return <div>
      <InvSection num="04" title="Analyse de la preuve"/>
      <Card style={{ marginBottom:10, borderLeft:`3px solid ${INV_RED}` }}><Mono color={C.textD} size={9}>Norme de preuve applicable</Mono><div style={{ fontSize:13, color:C.text, lineHeight:1.75, marginTop:6 }}>{ev?.standardOfProof}</div></Card>
      <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Faits établis ou non contestés</Mono>{establishedFacts.map((f,i)=><div key={i} style={{ display:"flex", gap:10, marginTop:10, paddingBottom:8, borderBottom:i<establishedFacts.length-1?`1px solid ${C.border}`:"none" }}>
        <div style={{ width:3, alignSelf:"stretch", background:WC[f.weight]||C.textM, flexShrink:0, borderRadius:1 }}/>
        <div style={{ flex:1 }}><div style={{ fontSize:13, color:C.text, lineHeight:1.6, marginBottom:3 }}>{f.fact}</div><Mono color={C.textD} size={8}>Source: {f.source} · Poids: {f.weight}</Mono></div>
      </div>)}</Card>
      <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Éléments contestés</Mono>{contestedElements.map((e,i)=><div key={i} style={{ background:C.surfL, border:`1px solid ${C.border}`, borderRadius:7, padding:"11px 13px", marginTop:10 }}>
        <div style={{ fontSize:13, fontWeight:500, color:C.text, marginBottom:9 }}>{e.element}</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:8 }}>
          <div><Mono color={INV_RED} size={8}>Version plaignant(e)</Mono><p style={{ fontSize:11, color:C.textM, lineHeight:1.6, marginTop:4 }}>{e.complainantVersion}</p></div>
          <div><Mono color={C.amber} size={8}>Version probable mise en cause</Mono><p style={{ fontSize:11, color:C.textM, lineHeight:1.6, marginTop:4 }}>{e.respondentVersion}</p></div>
        </div>
        <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:8, fontSize:11, color:C.textM, lineHeight:1.6 }}><span style={{ color:C.em }}>Résolution → </span>{e.resolution}</div>
      </div>)}</Card>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Card><Mono color={C.textD} size={9}>Lacunes dans la preuve</Mono>{evidenceGaps.map((g,i)=><div key={i} style={{ fontSize:12, color:C.textM, display:"flex", gap:7, marginTop:6 }}><span style={{ color:C.amber }}>!</span>{g}</div>)}</Card>
        <Card><Mono color={C.textD} size={9}>Alertes ouï-dire</Mono>{hearsayFlags.length>0?hearsayFlags.map((h,i)=><div key={i} style={{ fontSize:12, color:C.textM, display:"flex", gap:7, marginTop:6 }}><span style={{ color:C.red }}>⚠</span>{h}</div>):<div style={{ fontSize:12, color:C.textD, fontStyle:"italic", marginTop:6 }}>Aucun ouï-dire identifié</div>}</Card>
      </div>
    </div>;
  }

  function renderFindings() {
    const f = caseData.findings;
    const overall = INV_FINDING[f?.overallFinding]||INV_FINDING["Preuve insuffisante"];
    const allegationByAllegation = toArray(f?.allegationByAllegation);
    return <div>
      <InvSection num="05" title="Conclusions"/>
      <div style={{ background:overall.color+"18", border:`2px solid ${overall.color}40`, borderRadius:10, padding:"18px 22px", marginBottom:14 }}>
        <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:10 }}>
          <span style={{ fontSize:24, color:overall.color }}>{overall.icon}</span>
          <div><Mono color={overall.color} size={8}>CONCLUSION GLOBALE</Mono><div style={{ fontSize:18, fontWeight:700, color:overall.color, marginTop:3 }}>Plainte {f?.overallFinding}</div></div>
        </div>
        <div style={{ fontSize:13, lineHeight:1.8, color:C.text }}>{f?.overallRationale}</div>
      </div>
      <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Analyse par allégation</Mono>{allegationByAllegation.map((a,i)=>{
        const am = INV_FINDING[a.finding]||INV_FINDING["Preuve insuffisante"];
        return <div key={i} style={{ background:am.color+"10", border:`1px solid ${am.color}30`, borderRadius:7, padding:"12px 14px", borderLeft:`3px solid ${am.color}`, marginTop:10 }}>
          <div style={{ display:"flex", gap:8, alignItems:"flex-start", marginBottom:8 }}>
            <span style={{ fontSize:16, color:am.color }}>{am.icon}</span>
            <div style={{ flex:1 }}><div style={{ fontSize:13, fontWeight:500, color:C.text, marginBottom:5 }}>{a.allegation}</div><InvTag label={a.finding} color={am.color}/></div>
          </div>
          <div style={{ fontSize:11.5, color:C.textM, lineHeight:1.65, borderTop:`1px solid ${am.color}20`, paddingTop:8 }}><strong>Base: </strong>{a.basis}</div>
          {a.policyAnalysis&&<div style={{ fontSize:11.5, color:C.textM, marginTop:5 }}><strong>Politique: </strong>{a.policyAnalysis}</div>}
        </div>;
      })}</Card>
      <Card style={{ borderLeft:`3px solid ${C.textM}` }}><Mono color={C.textD} size={9}>Conformité — Règle de Browne v. Dunn</Mono><div style={{ fontSize:12, color:C.textM, lineHeight:1.7, marginTop:6 }}>{f?.brownvDunnCompliance}</div></Card>
    </div>;
  }

  function renderActions() {
    const r = caseData.recommendedActions;
    // TC and ActionBlock are now at module scope (INV_ACTION_TC / ActionBlock)
    return <div>
      <InvSection num="06" title="Mesures recommandées"/>
      <ActionBlock items={toArray(r?.forRespondent)} label="Pour la personne mise en cause"/>
      <ActionBlock items={toArray(r?.forOrganization)} label="Mesures organisationnelles"/>
      <ActionBlock items={toArray(r?.forComplainant)} label="Soutien au/à la plaignant(e)"/>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Card style={{ borderLeft:`3px solid ${C.em}` }}><Mono color={C.textD} size={9}>Plan de suivi</Mono><div style={{ fontSize:12, color:C.textM, lineHeight:1.7, marginTop:6 }}>{r?.followUp}</div></Card>
        <Card style={{ borderLeft:`3px solid ${C.amber}` }}><Mono color={C.textD} size={9}>Protection contre les représailles</Mono><div style={{ fontSize:12, color:C.textM, lineHeight:1.7, marginTop:6 }}>{r?.reprisalProtection}</div></Card>
      </div>
    </div>;
  }

  function renderReport() {
    const rs = caseData.reportStructure;
    const sections = toArray(rs?.sections);
    return <div>
      <InvSection num="07" title="Structure du rapport"/>
      <Card style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>Sections du rapport</Mono>{sections.map((s,i)=><div key={i} style={{ display:"flex", gap:0, borderBottom:i<sections.length-1?`1px solid ${C.border}`:"none" }}>
        <div style={{ width:32, padding:"12px 0", display:"flex", justifyContent:"center", flexShrink:0 }}>
          <div style={{ background:INV_RED, color:"#fff", width:22, height:22, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Mono',monospace", fontSize:9, borderRadius:3 }}>{i+1}</div>
        </div>
        <div style={{ flex:1, padding:"12px 14px" }}>
          <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>{s.section}</div>
          <div style={{ fontSize:12, color:C.textM, lineHeight:1.65, marginBottom:4 }}>{s.content}</div>
          <div style={{ fontSize:11, color:C.textM, fontStyle:"italic", lineHeight:1.5 }}><span style={{ color:C.em }}>Conseil → </span>{s.tips}</div>
        </div>
      </div>)}</Card>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Card style={{ borderLeft:`3px solid ${INV_RED}` }}><Mono color={C.textD} size={9}>Considérations de privilège légal</Mono><div style={{ fontSize:12, color:C.textM, lineHeight:1.7, marginTop:6 }}>{rs?.privilegeConsiderations}</div></Card>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <Card><Mono color={C.textD} size={9}>Liste de distribution</Mono><div style={{ fontSize:12, color:C.textM, lineHeight:1.7, marginTop:6 }}>{rs?.distributionList}</div></Card>
          <Card style={{ borderLeft:`3px solid ${C.amber}` }}><Mono color={C.textD} size={9}>Conservation du dossier</Mono><div style={{ fontSize:12, color:C.textM, lineHeight:1.7, marginTop:6 }}>{rs?.retentionNote}</div></Card>
        </div>
      </div>
    </div>;
  }

  const RENDERERS = { summary:renderSummary, plan:renderPlan, guide:renderGuide,
    evidence:renderEvidence, findings:renderFindings, actions:renderActions, report:renderReport };

  // ── LIST VIEW ────────────────────────────────────────────────────────────────
  if (view === "list") return (
    <div style={{ maxWidth:860, margin:"0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>Enquêtes & Investigations</div>
          <div style={{ fontSize:12, color:C.textM }}>{investigations.length} dossier(s) archivé(s) · Standards Rubin Thomlinson</div>
        </div>
        <button onClick={()=>{ setComplaint(""); setContext(""); setParties(""); setPolicy(""); setEvidence(""); setPeople([]); setCaseData(null); setOpenInvId(null); setView("input"); }} style={{ ...css.btn(INV_RED) }}>🔍 Ouvrir un dossier d'enquête</button>
      </div>
      {investigations.length === 0 && <Card style={{ textAlign:"center", padding:"40px 20px" }}>
        <div style={{ fontSize:32, marginBottom:12 }}>🔍</div>
        <div style={{ fontSize:14, color:C.textM }}>Aucun dossier d'enquête archivé</div>
        <div style={{ fontSize:12, color:C.textD, marginTop:4 }}>Clique sur "Ouvrir un dossier" pour démarrer une enquête structurée</div>
      </Card>}
      {investigations.length > 0 && <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
        {investigations.slice().reverse().map((inv,i) => {
          const fc = INV_FINDING[inv.caseData?.findings?.overallFinding];
          const uc = RISK[inv.urgencyLevel]||RISK["Modéré"];
          const isDraft = inv.status === "draft";
          const fromMeeting = inv.source === "meeting-engine-express";
          const accent = isDraft ? C.amber : INV_RED;
          return <button key={i} onClick={()=>{ setCaseData(inv.caseData||{}); setPeople(migratePeople(inv.people)); setOpenInvId(inv.id); setActiveTab("summary"); setSaved(true); setView("case"); }}
            style={{ background:C.surfL, border:`1px solid ${accent}28`, borderLeft:`3px solid ${accent}`,
              borderRadius:8, padding:"12px 14px", cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
              <span style={{ fontSize:13, fontWeight:500, color:C.text }}>
                {inv.title || generateInvestigationTitle(inv)}
                <span
                  onClick={(e)=>{
                    e.stopPropagation();
                    const current = inv.title || generateInvestigationTitle(inv);
                    const next = window.prompt("Modifier le titre de l'enquête", current);
                    if (next === null) return;
                    const trimmed = next.trim();
                    const updated = investigations.map(x => x.id === inv.id ? {
                      ...x,
                      title: trimmed || generateInvestigationTitle(x),
                      titleAuto: !trimmed,
                    } : x);
                    onSave("investigations", updated);
                  }}
                  title="Modifier le titre"
                  style={{ cursor:"pointer", marginLeft:8, opacity:.5, fontSize:11 }}
                >✎</span>
              </span>
              <div style={{ display:"flex", gap:6 }}>
                {isDraft && <InvTag label="BROUILLON" color={C.amber}/>}
                {fromMeeting && <InvTag label="📎 via meeting" color={C.blue}/>}
                {inv.people?.length > 0 && <InvTag label={`👤 ${inv.people.length}`} color={C.textM}/>}
                {fc&&<InvTag label={inv.caseData?.findings?.overallFinding} color={fc.color}/>}
                <InvTag label={`Urgence: ${inv.urgencyLevel}`} color={uc.color}/>
              </div>
            </div>
            <div style={{ fontSize:11, color:C.textM, display:"flex", gap:6, alignItems:"center" }}>{inv.caseId} · {inv.caseType} · {inv.savedAt}<ProvinceBadge province={getProvince(inv, data.profile)}/></div>
            {isDraft && (
              <div style={{ marginTop:8, padding:"8px 10px", background:C.amber+"10",
                border:`1px solid ${C.amber}30`, borderRadius:6, display:"flex",
                justifyContent:"space-between", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:11, color:C.textM, lineHeight:1.5 }}>
                  Dossier minimal — les sections IA (plan, guide, preuve, conclusions, rapport) n'ont pas encore été générées.
                </span>
                <span
                  onClick={(e) => { e.stopPropagation(); enrichDraft(inv); }}
                  title="Fournir la plainte et le contexte, puis générer les sections IA. Le dossier sera promu en place (même caseId)."
                  style={{ cursor:"pointer", fontSize:10, padding:"5px 10px",
                    background:C.amber, color:"#fff", border:`1px solid ${C.amber}`,
                    borderRadius:4, whiteSpace:"nowrap", fontWeight:600,
                    fontFamily:"'DM Sans',sans-serif" }}>
                  ✦ Compléter
                </span>
              </div>
            )}
            {onNavigate && (
              <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
                {Object.values(INV_ANGLES).map(a => (
                  <span
                    key={a.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      sessionStorage.setItem(
                        "hrbpos:pendingMeetingContext",
                        JSON.stringify(buildInvestigationMeetingBridge(inv, a))
                      );
                      onNavigate("meetings");
                    }}
                    title={`Préparer une entrevue — ${a.label}`}
                    style={{
                      cursor:"pointer", fontSize:10, padding:"3px 8px",
                      background:C.surfLL, border:`1px solid ${C.border}`,
                      borderRadius:4, color:C.textM, fontFamily:"'DM Sans',sans-serif",
                    }}
                  >
                    🎯 {a.icon} {a.label}
                  </span>
                ))}
              </div>
            )}
            {(() => {
              const linkedCase = getLinkedCase(inv, data);
              const linkedMeetings = getLinkedMeetings(inv, data);
              return (
                <div style={{ display:"flex", gap:6, marginTop:6, flexWrap:"wrap" }}>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      const cases = data.cases || [];
                      if (cases.length === 0) { window.alert("Aucun dossier disponible dans Cases"); return; }
                      const list = cases.map((c, i) => `${i+1}. ${c.title || c.name || "(sans titre)"}`).join("\n");
                      const currentIdx = inv.linkedCaseId ? cases.findIndex(c => c.id === inv.linkedCaseId) + 1 : 0;
                      const ans = window.prompt(`Lier à un dossier:\n${list}\n\nEntrer le numéro (vide = délier):`, currentIdx || "");
                      if (ans === null) return;
                      const idx = parseInt(ans, 10);
                      const newId = (Number.isFinite(idx) && idx > 0 && idx <= cases.length) ? cases[idx-1].id : null;
                      const updated = investigations.map(x => x.id === inv.id ? { ...x, linkedCaseId: newId } : x);
                      onSave("investigations", updated);
                    }}
                    title={linkedCase ? "Modifier le lien" : "Lier à un dossier Cases"}
                    style={{ cursor:"pointer", fontSize:10, padding:"3px 8px",
                      background: linkedCase ? C.em+"15" : C.surfLL,
                      border: `1px solid ${linkedCase ? C.em+"40" : C.border}`,
                      borderRadius:4, color: linkedCase ? C.em : C.textM }}
                  >
                    {linkedCase ? `🔗 ${linkedCase.title || linkedCase.name || "Dossier lié"}` : "🔗 Lier un dossier"}
                  </span>
                  {inv.linkedCaseId && !linkedCase && (
                    <span style={{ fontSize:10, padding:"3px 8px", color:C.red,
                      background: C.red+"10", border:`1px solid ${C.red}30`, borderRadius:4 }}>
                      ⚠ Dossier introuvable
                    </span>
                  )}
                  {linkedMeetings.length > 0 && (
                    <span style={{ fontSize:10, padding:"3px 8px", color:C.blue,
                      background: C.blue+"10", border:`1px solid ${C.blue}30`, borderRadius:4 }}>
                      📅 {linkedMeetings.length} rencontre{linkedMeetings.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              );
            })()}
          </button>;
        })}
      </div>}
    </div>
  );

  // ── INPUT VIEW ───────────────────────────────────────────────────────────────
  if (view === "input") return (
    <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button onClick={()=>{ setView("list"); setOpenInvId(null); }} style={{ ...css.btn(C.textM,true), padding:"6px 12px", fontSize:11 }}>← Retour</button>
        <div style={{ fontSize:18, fontWeight:700, color:C.text }}>
          {isDraftOpen ? `Compléter le brouillon · ${openInv?.caseId || ""}` : "Nouveau dossier d'enquête"}
        </div>
      </div>
      <Card style={{ marginBottom:14 }}>
        <SecHead icon="🔍" label="Plainte ou signalement reçu *" color={INV_RED}/>
        <textarea rows={5} value={complaint} onChange={e=>setComplaint(e.target.value)}
          placeholder="Décrire la plainte — nature des comportements allégués, période, contexte. Ne pas inclure de noms propres."
          style={{ ...css.textarea, marginTop:6 }}
          onFocus={e=>e.target.style.borderColor=INV_RED+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
      </Card>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
        {[["Contexte organisationnel",context,setContext,"Département, type de relation, ancienneté, historique..."],
          ["Parties impliquées (rôles génériques)",parties,setParties,"Ex: Gestionnaire senior, 15 ans / Employé subordonné, 2 ans. Éviter les noms."],
          ["Politiques ou lois applicables",policy,setPolicy,"LNT art. 81.18-81.20, Charte des droits, LSST..."],
          ["Preuves initiales disponibles",evidence,setEvidence,"Courriels, témoignages initiaux, documents, dates..."]
        ].map(([l,v,s,ph],i)=><Card key={i}>
          <Mono color={C.textD} size={9}>{l}</Mono>
          <textarea rows={4} value={v} onChange={e=>s(e.target.value)} placeholder={ph}
            style={{ ...css.textarea, marginTop:6 }}
            onFocus={e=>e.target.style.borderColor=INV_RED+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
        </Card>)}
      </div>
      <Card style={{ marginBottom:14 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, marginBottom:4 }}>
          <div>
            <Mono color={C.textD} size={9}>Personnes impliquées · identités réelles</Mono>
            <div style={{ fontSize:11, color:C.textD, marginTop:4, lineHeight:1.5 }}>
              Stocké séparément du narratif, qui reste anonymisé (rôles génériques).
            </div>
          </div>
          <button type="button" onClick={addPerson}
            style={{ background:C.surfLL, border:`1px solid ${C.border}`, borderRadius:6,
              padding:"6px 10px", fontSize:11, color:C.text, cursor:"pointer",
              fontFamily:"'DM Sans',sans-serif", whiteSpace:"nowrap" }}>
            + Ajouter une personne
          </button>
        </div>
        {people.length === 0 && (
          <div style={{ fontSize:11, color:C.textD, fontStyle:"italic", marginTop:10,
            padding:"10px 12px", background:C.surfL, border:`1px dashed ${C.border}`, borderRadius:6 }}>
            Aucune identité enregistrée. Optionnel — le dossier peut rester entièrement anonymisé.
          </div>
        )}
        {people.map((p) => {
          const rc = PERSON_ROLE_MAP[p.role]?.color || C.textM;
          return (
            <div key={p.id} style={{ display:"grid",
              gridTemplateColumns:"140px 1.6fr 1fr 1fr 28px",
              gap:8, alignItems:"center", marginTop:8 }}>
              <select value={p.role} onChange={e=>updatePerson(p.id, { role: e.target.value })}
                style={{ ...css.select, borderLeft:`3px solid ${rc}` }}>
                {PERSON_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <input value={p.fullName} placeholder="Nom complet"
                onChange={e=>updatePerson(p.id, { fullName: e.target.value })}
                style={{ ...css.input }}/>
              <input value={p.organization} placeholder="Firme / organisation"
                onChange={e=>updatePerson(p.id, { organization: e.target.value })}
                style={{ ...css.input }}/>
              <input value={p.title} placeholder="Titre / fonction"
                onChange={e=>updatePerson(p.id, { title: e.target.value })}
                style={{ ...css.input }}/>
              <button type="button" onClick={()=>removePerson(p.id)} title="Retirer"
                style={{ background:"none", border:"none", color:C.textD, cursor:"pointer",
                  fontSize:14, padding:4, lineHeight:1 }}>✕</button>
            </div>
          );
        })}
      </Card>
      {error&&<div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7, padding:"8px 12px", marginBottom:12, fontSize:12, color:C.red }}>⚠ {error}</div>}
      <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:12 }}>
        <div style={{ flex:"0 0 auto" }}>
          <Mono color={C.textD} size={9}>Province</Mono>
          <ProvinceSelect value={invProvince} onChange={e=>setInvProvince(e.target.value)}
            style={{ marginTop:6, minWidth:80 }}/>
        </div>
        <button onClick={generate} disabled={!complaint.trim()}
          style={{ ...css.btn(INV_RED), flex:1, marginTop:20, opacity:complaint.trim()?1:.4 }}>
          🔍 Ouvrir le dossier d'enquête
        </button>
      </div>
    </div>
  );

  // ── LOADING view kept as stub ─────────────────────────────────────────────
  if (view === "loading") return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"100px 32px", gap:24 }}>
      <AILoader label="Ouverture du dossier d'enquête..."/>
      <Mono color={C.textD} size={8}>ANALYSE · PLAN · GUIDE D'ENTREVUE · PREUVE · CONCLUSIONS</Mono>
    </div>
  );

  // ── CASE VIEW ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth:980, margin:"0 auto" }}>
      <div style={{ background:INV_RED, borderRadius:10, padding:"16px 20px", marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <Mono color="rgba(255,255,255,.6)" size={8}>Enquêtes & Investigations · Groupe IT Québec</Mono>
            <div style={{ fontSize:16, fontWeight:700, color:"#fff", marginTop:4 }}>{caseData?.caseId} — {caseData?.caseTitle}</div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>{ setView("list"); setOpenInvId(null); }} style={{ background:"rgba(255,255,255,.15)", border:"1px solid rgba(255,255,255,.3)", borderRadius:6, padding:"6px 12px", fontSize:11, color:"#fff", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>← Retour</button>
            <button onClick={saveDossier} disabled={saved} style={{ background:saved?"rgba(255,255,255,.15)":"rgba(255,255,255,.25)", border:"1px solid rgba(255,255,255,.4)", borderRadius:6, padding:"6px 14px", fontSize:11, color:"#fff", cursor:saved?"default":"pointer", fontFamily:"'DM Sans',sans-serif" }}>{saved?"✓ Archivé":"💾 Archiver"}</button>
          </div>
        </div>
        <div style={{ display:"flex", gap:0, marginTop:12, overflowX:"auto" }}>
          {[{id:"input",label:"← Nouvelle saisie"},...INV_TABS].map(t=><button key={t.id}
            onClick={()=>{if(t.id==="input"){setView("input");}else{setActiveTab(t.id);}}}
            style={{ background:"none", border:"none", cursor:"pointer", padding:"8px 14px",
              fontFamily:"'DM Mono',monospace", fontSize:8, fontWeight:500, letterSpacing:1.5,
              color:activeTab===t.id&&t.id!=="input"?"#fff":"rgba(255,255,255,.45)",
              borderBottom:`2px solid ${activeTab===t.id&&t.id!=="input"?"#fff":"transparent"}`,
              whiteSpace:"nowrap", transition:"all .15s", textTransform:"uppercase" }}>{t.num?`${t.num} · `:""}{t.label}</button>)}
        </div>
      </div>
      {isDraftOpen && (
        <div style={{ background:C.amber+"12", border:`1px solid ${C.amber}40`,
          borderLeft:`4px solid ${C.amber}`, borderRadius:8,
          padding:"14px 18px", marginBottom:14,
          display:"flex", justifyContent:"space-between", alignItems:"center", gap:14, flexWrap:"wrap" }}>
          <div style={{ flex:"1 1 320px", minWidth:240 }}>
            <div style={{ fontSize:12, fontWeight:700, color:C.amber,
              fontFamily:"'DM Mono',monospace", letterSpacing:1.2, marginBottom:4 }}>
              ⚠ DOSSIER EN BROUILLON
            </div>
            <div style={{ fontSize:12, color:C.textM, lineHeight:1.6 }}>
              {openInv?.source === "meeting-engine-express"
                ? "Dossier ouvert depuis Meeting Engine pour rattacher une rencontre. Les sections d'enquête ne sont pas encore générées — complète le dossier pour activer plan, guide, preuve et conclusions."
                : "Ce dossier n'a pas encore été enrichi par l'IA. Complète-le pour générer plan, guide, preuve, conclusions et rapport."}
            </div>
          </div>
          <button onClick={() => openInv && enrichDraft(openInv)}
            style={{ background:C.amber, color:"#fff", border:"none", borderRadius:6,
              padding:"9px 14px", fontSize:12, fontWeight:600, cursor:"pointer",
              whiteSpace:"nowrap", fontFamily:"'DM Sans',sans-serif" }}>
            ✦ Compléter le dossier
          </button>
        </div>
      )}
      {(() => {
        if (!openInv || !onNavigate) return null;
        const ld = (data.decisions || []).filter(d =>
          (d.linkedInvestigationId && d.linkedInvestigationId === openInv.id) ||
          (openInv.linkedCaseId && d.linkedCaseId === openInv.linkedCaseId)
        );
        if (ld.length === 0) return null;
        const latest = [...ld].sort((a,b) => (b.updatedAt||b.createdAt||"").localeCompare(a.updatedAt||a.createdAt||""))[0];
        return (
          <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
            <span onClick={() => onNavigate("decisions", { focusDecisionId: latest.id })} title={ld.length === 1 ? "Ouvrir la décision liée" : `Ouvrir la décision la plus récente (${ld.length} liées)`} style={{ cursor:"pointer", fontSize:10, padding:"3px 8px", background:C.purple+"15", border:`1px solid ${C.purple}40`, borderRadius:4, color:C.purple, fontFamily:"'DM Sans',sans-serif" }}>
              ⚖ {ld.length === 1 ? "Décision" : `Décisions (${ld.length})`}
            </span>
          </div>
        );
      })()}
      <InvTimeline inv={openInv} data={data} onNavigate={onNavigate}/>
      {(openInv?.people?.length > 0) && (
        <Card style={{ marginBottom:14, borderLeft:`3px solid ${INV_RED}` }}>
          <Mono color={C.textD} size={9}>Personnes impliquées · identités réelles (confidentiel)</Mono>
          <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:10 }}>
            {openInv.people.map(p => {
              const r = PERSON_ROLE_MAP[normalizePersonRole(p.role)] || PERSON_ROLE_MAP.autre;
              const meta = [p.title, p.organization].filter(Boolean).join(" · ");
              return (
                <div key={p.id} style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                  <InvTag label={r.label} color={r.color}/>
                  <span style={{ fontSize:13, fontWeight:500, color:C.text }}>
                    {p.fullName || <span style={{ color:C.textD, fontStyle:"italic" }}>Sans nom</span>}
                  </span>
                  {meta && <span style={{ fontSize:11, color:C.textM }}>{meta}</span>}
                </div>
              );
            })}
          </div>
        </Card>
      )}
      <div>{isDraftOpen
        ? <Card style={{ textAlign:"center", padding:"36px 20px", borderStyle:"dashed" }}>
            <div style={{ fontSize:26, marginBottom:10 }}>📝</div>
            <div style={{ fontSize:13, color:C.textM, maxWidth:420, margin:"0 auto", lineHeight:1.6 }}>
              Les sections détaillées apparaîtront après avoir complété le dossier.
              Les badges d'angle et la création de rencontres restent disponibles depuis la liste.
            </div>
          </Card>
        : (RENDERERS[activeTab] && RENDERERS[activeTab]())}</div>
    </div>
  );
}
