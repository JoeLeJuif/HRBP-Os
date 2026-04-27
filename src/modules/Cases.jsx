// Source: HRBP_OS.jsx L.1740-1998
import { useState, useEffect } from "react";
import { C, css, RISK } from '../theme.js';
import { normalizeRisk } from '../utils/normalize.js';
import { getProvince, fmtDate } from '../utils/format.js';
import { getCaseTimeBadge } from '../utils/caseStatus.js';
import { PROVINCES } from '../utils/legal.js';
import Badge from '../components/Badge.jsx';
import Card from '../components/Card.jsx';
import Mono from '../components/Mono.jsx';
import Divider from '../components/Divider.jsx';
import ProvinceBadge from '../components/ProvinceBadge.jsx';
import ProvinceSelect from '../components/ProvinceSelect.jsx';
import CaseBrief from '../components/CaseBrief.jsx';

// Inline shared helper (used in multiple modules, to be reviewed at Bloc 7)
function RiskBadge({ level }) {
  const norm = normalizeRisk(level);
  const r = RISK[norm] || RISK["Modéré"];
  return <Badge label={norm} color={r.color} />;
}

// Inline data constants (Source: L.1742-1768)
const CASE_TYPES = [
  {id:"performance",label:"Performance",icon:"📉",color:C.amber},
  {id:"pip",label:"PIP / Correctif",icon:"📋",color:C.red},
  {id:"conflict_ee",label:"Conflit EE/EE",icon:"⚡",color:C.amber},
  {id:"conflict_em",label:"Conflit EE/Mgr",icon:"🔥",color:C.red},
  {id:"complaint",label:"Plainte",icon:"🚨",color:C.pink},
  {id:"immigration",label:"Immigration",icon:"✈",color:C.teal},
  {id:"retention",label:"Rétention / Flight Risk",icon:"🎯",color:C.purple},
  {id:"promotion",label:"Promotion",icon:"⬆",color:C.purple},
  {id:"return",label:"Retour d'absence",icon:"🌱",color:C.em},
  {id:"reorg",label:"Restructuration",icon:"🔄",color:C.blue},
  {id:"exit",label:"Départ",icon:"🚪",color:C.textM},
  {id:"investigation",label:"Enquête",icon:"⚖",color:"#7a1e2e"},
];
const STATUSES = [
  {id:"open",label:"Ouvert",color:C.blue},
  {id:"active",label:"Actif",color:C.amber},
  {id:"pending",label:"En attente",color:C.purple},
  {id:"resolved",label:"Résolu",color:C.em},
  {id:"closed",label:"Fermé",color:C.textD},
  {id:"escalated",label:"Escaladé",color:C.red},
];
const URGENCY_C    = {"Immediat":C.red,"Cette semaine":C.amber,"Ce mois":C.blue,"En veille":C.textD};
const EVO_C        = {"Nouveau":C.blue,"En cours":C.amber,"Aggravé":C.red,"En amélioration":C.teal,"Bloqué":C.red,"Résolu":C.em};
const HR_POSTURE_C = {"Partenaire":C.blue,"Garant":C.red,"Coach":C.teal,"Neutre":C.textD,"Enquêteur":"#7a1e2e"};
const URGENCY_ORDER = {"Immediat":0,"Cette semaine":1,"Ce mois":2,"En veille":3};
const RISK_ORDER    = {"Critique":0,"Élevé":1,"Modéré":2,"Faible":3};
// B-25: Map Case type → MeetingEngine engineType
const CASE_TO_ENGINE = {
  performance: "performance",
  pip:         "performance",
  conflict_ee: "mediation",
  conflict_em: "mediation",
  complaint:   "enquete",
  immigration: "1on1",
  retention:   "coaching",
  promotion:   "coaching",
  return:      "transition",
  reorg:       "transition",
  exit:        "transition",
  investigation: "enquete",
};
const mapCaseTypeToEngineType = (caseType) => CASE_TO_ENGINE[caseType] || "1on1";

const EMPTY_FORM = { title:"", type:"conflict_ee", riskLevel:"Modéré", status:"active",
  director:"", employee:"", department:"", openDate:new Date().toISOString().split("T")[0],
  province:"QC",
  situation:"", interventionsDone:"", hrPosition:"", decision:"", nextFollowUp:"",
  notes:"", actions:[],
  scope:"leader", owner:"HRBP", dueDate:"", urgency:"Cette semaine", evolution:"", hrPosture:"", closedDate:"" };

// Field wrapper — plain function (NOT a React component).
// Called as fl("label", <input/>) so its output is part of CaseForm's own fiber tree.
// Avoids a component-boundary children-passthrough that breaks input focus in React 18.
function fl(label, child) {
  return (
    <div style={{ marginBottom:14 }}>
      <Mono color={C.textD} size={9}>{label}</Mono>
      <div style={{ marginTop:6 }}>{child}</div>
    </div>
  );
}

// ── CaseForm ───────────────────────────────────────────────────────────────────
// Defined at module scope so React assigns it a STABLE component type.
// When the view switches detail→form, React sees <div>(detail) → <CaseForm>:
// different types → full unmount/remount (no recycled DOM).
// When typing in the form, React sees <CaseForm>→<CaseForm>: same type →
// reconcile only → inputs keep their DOM nodes → focus is preserved.
function CaseForm({ form, setForm, editId, defaultProvince, onSave, onCancel }) {
  const SF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const FO = { onFocus:e=>e.target.style.borderColor=C.em+"60", onBlur:e=>e.target.style.borderColor=C.border };

  return (
    // autoComplete="off" au niveau <form> — Chrome l'ignore sur les champs individuels
    // mais respecte la directive au niveau du formulaire (fix Chrome Autofill focus theft)
    <form autoComplete="off" onSubmit={e => e.preventDefault()} style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button type="button" onClick={onCancel}
          style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>← Retour</button>
        <div style={{ fontSize:17, fontWeight:700, color:C.text }}>
          {editId ? "Modifier le dossier" : "Nouveau dossier"}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        {fl("Titre du dossier *",
          <input value={form.title} onChange={SF("title")}
            placeholder="Ex: Conflit infra Nolan-Laroche" style={css.input}
            autoComplete="off" {...FO}/>
        )}
        {fl("Date d'ouverture",
          <input value={form.openDate} onChange={SF("openDate")}
            style={css.input} autoComplete="off" {...FO}/>
        )}
        {fl("Type de dossier",
          <select value={form.type} onChange={SF("type")} style={css.select}>
            {CASE_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
          </select>
        )}
        {fl("Statut",
          <select value={form.status} onChange={SF("status")} style={css.select}>
            {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        )}
        {fl("Niveau de risque",
          <select value={form.riskLevel} onChange={SF("riskLevel")} style={css.select}>
            {["Critique","Élevé","Modéré","Faible"].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        {fl("Directeur concerné",
          <input value={form.director} onChange={SF("director")}
            placeholder="Nom du directeur" style={css.input}
            autoComplete="off" {...FO}/>
        )}
        {fl("Employé / Groupe concerné",
          <input value={form.employee} onChange={SF("employee")}
            placeholder="Prénom, rôle ou groupe" style={css.input}
            autoComplete="off" {...FO}/>
        )}
        {fl("Département / Équipe",
          <input value={form.department} onChange={SF("department")}
            placeholder="Ex: IT Infrastructure" style={css.input}
            autoComplete="off" {...FO}/>
        )}
        {fl("Province",
          <ProvinceSelect
            value={form.province||defaultProvince||"QC"}
            onChange={e=>setForm(f=>({...f,province:e.target.value}))}/>
        )}
        {fl("Responsable (owner)",
          <select value={form.owner||"HRBP"} onChange={SF("owner")} style={css.select}>
            {["HRBP","Gestionnaire","HRBP + Gestionnaire","Direction"].map(o=><option key={o} value={o}>{o}</option>)}
          </select>
        )}
        {fl("Portée du dossier",
          <select value={form.scope||"leader"} onChange={SF("scope")} style={css.select}>
            <option value="leader">Leader / Gestionnaire</option>
            <option value="individual">Employé / Individuel</option>
            <option value="team">Équipe</option>
            <option value="org">Organisation / Projet</option>
          </select>
        )}
        {fl("Urgence",
          <select value={form.urgency||"Cette semaine"} onChange={SF("urgency")} style={css.select}>
            {["Immediat","Cette semaine","Ce mois","En veille"].map(u=><option key={u} value={u}>{u}</option>)}
          </select>
        )}
        {fl("Évolution (optionnel)",
          <select value={form.evolution||""} onChange={SF("evolution")} style={css.select}>
            <option value="">— Non renseignée</option>
            {["Nouveau","En cours","Aggravé","En amélioration","Bloqué","Résolu"].map(ev=><option key={ev} value={ev}>{ev}</option>)}
          </select>
        )}
        {fl("Posture RH (optionnel)",
          <select value={form.hrPosture||""} onChange={SF("hrPosture")} style={css.select}>
            <option value="">— Non renseignée</option>
            {["Partenaire","Garant","Coach","Neutre","Enquêteur"].map(p=><option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>

      {fl("Description de la situation",
        <textarea rows={3} value={form.situation} onChange={SF("situation")}
          placeholder="Description factuelle et concise de la situation…" style={css.textarea}
          autoComplete="off" {...FO}/>
      )}
      {fl("Interventions / Actions faites",
        <textarea rows={2} value={form.interventionsDone} onChange={SF("interventionsDone")}
          placeholder="Interventions, conversations, documents produits…" style={css.textarea}
          autoComplete="off" {...FO}/>
      )}
      {fl("Position RH recommandée",
        <textarea rows={2} value={form.hrPosition} onChange={SF("hrPosition")}
          placeholder="Recommandation formelle ou en cours…" style={css.textarea}
          autoComplete="off" {...FO}/>
      )}
      {fl("Décision prise",
        <textarea rows={2} value={form.decision||""} onChange={SF("decision")}
          placeholder="Décision formelle prise ou en attente…" style={css.textarea}
          autoComplete="off" {...FO}/>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        {fl("Prochain suivi (libre)",
          <input value={form.nextFollowUp} onChange={SF("nextFollowUp")}
            placeholder="Ex: 16 mars 2026" style={css.input}
            autoComplete="off" {...FO}/>
        )}
        {fl("Échéance (date)",
          <input type="date" value={form.dueDate||""} onChange={SF("dueDate")}
            style={css.input} {...FO}/>
        )}
      </div>
      {fl("Notes HRBP",
        <textarea rows={2} value={form.notes} onChange={SF("notes")}
          placeholder="Patterns organisationnels, liens avec d'autres dossiers…" style={css.textarea}
          autoComplete="off" {...FO}/>
      )}

      <div style={{ display:"flex", gap:10, marginTop:8 }}>
        <button type="button" onClick={onSave} disabled={!form.title}
          style={{ ...css.btn(C.em), flex:1, opacity:form.title?1:.4 }}>
          {editId ? "💾 Mettre à jour" : "💾 Créer le dossier"}
        </button>
        <button type="button" onClick={onCancel} style={{ ...css.btn(C.textM, true) }}>Annuler</button>
      </div>
    </form>
  );
}

// ── Clipboard export formatter ────────────────────────────────────────────────
function formatCaseForClipboard(c, data) {
  const lines = [];
  const sep = "─".repeat(40);
  const secSep = "── ";

  // Header
  lines.push(`DOSSIER RH — ${c.title || "Sans titre"}`);
  lines.push(sep);

  // Fiche synthèse
  const typeObj = CASE_TYPES.find(t => t.id === c.type);
  const statusObj = STATUSES.find(s => s.id === c.status);
  if (statusObj)      lines.push(`Statut       : ${statusObj.label}`);
  if (c.riskLevel)    lines.push(`Risque       : ${c.riskLevel}`);
  if (typeObj)         lines.push(`Type         : ${typeObj.label}`);
  if (c.urgency)      lines.push(`Urgence      : ${c.urgency}`);
  if (c.evolution)    lines.push(`Évolution    : ${c.evolution}`);
  if (c.hrPosture)    lines.push(`Posture RH   : ${c.hrPosture}`);
  if (c.province)     lines.push(`Province     : ${c.province}`);
  if (c.director)     lines.push(`Gestionnaire : ${c.director}`);
  if (c.employee)     lines.push(`Employé      : ${c.employee}`);
  if (c.department)   lines.push(`Département  : ${c.department}`);
  if (c.owner)        lines.push(`Owner        : ${c.owner}`);
  if (c.openDate)     lines.push(`Ouverture    : ${c.openDate}`);
  if (c.dueDate)      lines.push(`Échéance     : ${c.dueDate}`);
  if (c.closedDate)   lines.push(`Fermé        : ${c.closedDate}`);

  // Sections narratives
  if (c.situation)          { lines.push(""); lines.push(`${secSep}SITUATION`); lines.push(c.situation); }
  if (c.interventionsDone)  { lines.push(""); lines.push(`${secSep}INTERVENTIONS EFFECTUÉES`); lines.push(c.interventionsDone); }
  if (c.hrPosition)         { lines.push(""); lines.push(`${secSep}POSITION RH`); lines.push(c.hrPosition); }
  if (c.decision)           { lines.push(""); lines.push(`${secSep}DÉCISION`); lines.push(c.decision); }
  if (c.nextFollowUp)       { lines.push(""); lines.push(`${secSep}PROCHAIN SUIVI`); lines.push(c.nextFollowUp); }
  if (c.notes)              { lines.push(""); lines.push(`${secSep}NOTES`); lines.push(c.notes); }

  // Décisions liées (section dédiée)
  const linkedDecs = (data.decisions || []).filter(d => d.linkedCaseId === c.id);
  if (linkedDecs.length > 0) {
    lines.push(""); lines.push(`${secSep}DÉCISIONS LIÉES (${linkedDecs.length})`);
    linkedDecs.forEach(d => {
      const statusLabel = d.status ? {draft:"Brouillon",decided:"Décidé",reviewed:"Révisé",archived:"Archivé"}[d.status] || "" : "";
      lines.push(`• ${d.title || "Décision RH"}${statusLabel ? ` [${statusLabel}]` : ""}${d.decisionDate ? ` — ${d.decisionDate}` : ""}`);
      if (d.decisionRationale) lines.push(`  Justification : ${d.decisionRationale}`);
      if (d.selectedOption)    lines.push(`  Option retenue : ${d.selectedOption}`);
      if (d.riskLevel)         lines.push(`  Risque : ${d.riskLevel}`);
    });
  }

  // Timeline (aligned with UI: case events + meetings + signals)
  const tlEvents = [];
  const created = c.createdAt || c.savedAt || c.openDate;
  if (created) tlEvents.push({ date: created, label: "Dossier ouvert" });
  if ((c.status === "resolved" || c.status === "closed") && (c.closedDate || c.savedAt))
    tlEvents.push({ date: c.closedDate || c.savedAt, label: c.status === "resolved" ? "Dossier résolu" : "Dossier fermé" });
  if (c.status === "escalated") tlEvents.push({ date: c.savedAt || created, label: "Dossier escaladé" });
  if (c.dueDate) tlEvents.push({ date: c.dueDate, label: "Échéance" + (c.nextFollowUp ? ` — ${c.nextFollowUp}` : "") });
  linkedDecs.forEach(d => {
    tlEvents.push({ date: d.savedAt || d.decisionDate || d.createdAt, label: `⚖ ${d.title || "Décision RH"}`, sub: d.summary || d.rationale || "" });
  });
  // Meetings liés (même logique que la timeline UI : director match, 90 jours, max 3)
  if (c.director) {
    const dirNorm = c.director.trim().toLowerCase();
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    (data.meetings || [])
      .filter(m => m.director && m.director.trim().toLowerCase() === dirNorm && m.savedAt && new Date(m.savedAt).getTime() >= cutoff)
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
      .slice(0, 3)
      .forEach(m => {
        tlEvents.push({ date: m.savedAt, label: `🗓 ${m.analysis?.meetingTitle || "Meeting"}`, sub: m.meetingType || "" });
      });
  }
  // Signals liés (director match, max 2)
  if (c.director) {
    const dirNorm = c.director.trim().toLowerCase();
    (data.signals || [])
      .filter(s => s.managerName && s.managerName.trim().toLowerCase() === dirNorm)
      .sort((a, b) => new Date(b.createdAt || b.savedAt || 0) - new Date(a.createdAt || a.savedAt || 0))
      .slice(0, 2)
      .forEach(s => {
        tlEvents.push({ date: s.createdAt || s.savedAt, label: `📡 ${s.title || s.label || "Signal"}`, sub: s.level || s.riskLevel || "" });
      });
  }
  const sortedTl = tlEvents.filter(e => e.date).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (sortedTl.length > 0) {
    lines.push(""); lines.push(`${secSep}TIMELINE`);
    sortedTl.forEach(ev => {
      lines.push(`• ${ev.date} — ${ev.label}`);
      if (ev.sub) lines.push(`  ${ev.sub}`);
    });
  }

  lines.push(""); lines.push(sep);
  lines.push(`Exporté depuis HRBP OS — ${new Date().toLocaleDateString("fr-CA")}`);
  return lines.join("\n");
}

export default function ModuleCases({ data, onSave, onNavigate, focusCaseId, onClearFocus }) {
  const [view, setView] = useState("list"); // list | form | detail
  const [form, setForm] = useState({...EMPTY_FORM});
  const [editId, setEditId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterProvince, setFilterProvince] = useState("");

  // ── Inter-module focus: auto-open a specific case on mount ───────────────────
  useEffect(() => {
    if (!focusCaseId) return;
    const target = (data.cases || []).find(c => c.id === focusCaseId);
    if (target) { setDetail(target); setView("detail"); }
    if (onClearFocus) onClearFocus();
  }, [focusCaseId]); // eslint-disable-line

  const cases = data.cases || [];
  const todayISO = new Date().toISOString().split("T")[0];
  const filtered = cases.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.title?.toLowerCase().includes(q) || c.director?.toLowerCase().includes(q) || c.employee?.toLowerCase().includes(q);
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    const matchProvince = !filterProvince || getProvince(c, data.profile) === filterProvince;
    return matchSearch && matchStatus && matchProvince;
  }).sort((a, b) => {
    const ua = URGENCY_ORDER[a.urgency] ?? 4, ub = URGENCY_ORDER[b.urgency] ?? 4;
    if (ua !== ub) return ua - ub;
    const da = a.dueDate || "9999-99-99", db = b.dueDate || "9999-99-99";
    if (da !== db) return da < db ? -1 : 1;
    const ra = RISK_ORDER[a.riskLevel] ?? 4, rb = RISK_ORDER[b.riskLevel] ?? 4;
    if (ra !== rb) return ra - rb;
    return (b.updatedAt||"0000-00-00") < (a.updatedAt||"0000-00-00") ? -1 : 1;
  });

  const save = () => {
    const today = new Date().toISOString().split("T")[0];
    const isClosing = form.status === "resolved" || form.status === "closed";
    const closedDate = isClosing ? (form.closedDate || today) : "";
    const existingCase = editId ? cases.find(c => c.id === editId) : null;
    const newCase = { ...form, closedDate, id: editId || Date.now().toString(), updatedAt: today,
      dateCreated: existingCase?.dateCreated || today };
    const updated = editId ? cases.map(c => c.id===editId ? newCase : c) : [...cases, newCase];
    onSave("cases", updated);
    setView("list"); setForm({...EMPTY_FORM}); setEditId(null);
  };

  const deleteCase = (id) => {
    const updated = cases.filter(c => c.id !== id);
    console.log("[debug] deleteCase id:", id, "type:", typeof id, "before:", cases.length, "after:", updated.length);
    onSave("cases", updated);
    setView("list");
  };

  const openEdit = (c) => { setForm({...EMPTY_FORM, ...c}); setEditId(c.id); setView("form"); };

  if (view === "form") return (
    <CaseForm
      form={form}
      setForm={setForm}
      editId={editId}
      defaultProvince={data.profile?.defaultProvince}
      onSave={save}
      onCancel={() => { setView("list"); setForm({...EMPTY_FORM}); setEditId(null); }}
    />
  );

  if (view === "detail" && detail) {
    const c = detail;
    const typeObj = CASE_TYPES.find(t=>t.id===c.type);
    const statusObj = STATUSES.find(s=>s.id===c.status);
    const r = RISK[c.riskLevel]||RISK["Modéré"];
    return <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
        <button onClick={() => setView("list")} style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>← Retour</button>
        <div style={{ flex:1, fontSize:16, fontWeight:700, color:C.text }}>{c.title}</div>
        <button onClick={async () => {
            const text = formatCaseForClipboard(c, data);
            try { await navigator.clipboard.writeText(text); }
            catch { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); }
            setCopied(true); setTimeout(() => setCopied(false), 2000);
          }}
          style={{ ...css.btn(copied ? C.em : C.textM, true), padding:"6px 14px", fontSize:12 }}>
          {copied ? "✓ Copié !" : "📋 Copier"}</button>
        <button onClick={() => openEdit(c)} style={{ ...css.btn(C.blue, true), padding:"6px 14px", fontSize:12 }}>✏ Modifier</button>
        <button onClick={() => {
            sessionStorage.setItem("hrbpos:pendingDecision", JSON.stringify({
              linkedCaseId: c.id, caseTitle: c.title || "",
              employee: c.employee || "", director: c.director || "",
              context: c.situation || "", province: c.province || "",
              type: c.type || "", department: c.department || ""
            }));
            onNavigate("decisions");
          }}
          title="Créer une décision liée à ce dossier"
          style={{ ...css.btn(C.purple, true), padding:"6px 14px", fontSize:12 }}>⚖ Décision</button>
        <button onClick={() => {
            sessionStorage.setItem("hrbpos:pendingMeetingContext", JSON.stringify({
              engineType: mapCaseTypeToEngineType(c.type),
              linkedCaseId: c.id,
              caseTitle: c.title || "",
              ctx: {
                managerName: c.director || "",
                team: c.department || "",
                purpose: c.title ? `Dossier: ${c.title}` : "",
                background: c.situation || "",
                activeCases: c.title || "",
                province: c.province || "",
              }
            }));
            onNavigate("meetings");
          }}
          title="Préparer une rencontre à partir de ce dossier"
          style={{ ...css.btn(C.em, true), padding:"6px 14px", fontSize:12 }}>🎯 Préparer une rencontre</button>
        <button onClick={() => { if(window.confirm("Supprimer ce dossier?")) deleteCase(c.id); }}
          style={{ ...css.btn(C.red, true), padding:"6px 14px", fontSize:12 }}>🗑 Supprimer</button>
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
        <RiskBadge level={c.riskLevel}/>
        {statusObj && <Badge label={statusObj.label} color={statusObj.color}/>}
        {typeObj && <Badge label={`${typeObj.icon} ${typeObj.label}`} color={typeObj.color}/>}
        {(() => { const tb = getCaseTimeBadge(c); return tb ? <Badge label={tb.label} color={tb.tone}/> : null; })()}
        {c.evolution && <Badge label={c.evolution} color={EVO_C[c.evolution]||C.textD}/>}
        {c.hrPosture && <Badge label={c.hrPosture} color={HR_POSTURE_C[c.hrPosture]||C.textD}/>}
        {c.director && (onNavigate
          ? <span onClick={() => { sessionStorage.setItem("hrbpos:pendingLeader", c.director); onNavigate("leaders"); }}
              style={{ cursor:"pointer" }} title="Voir la fiche leader">
              <Badge label={c.director} color={C.blue}/>
            </span>
          : <Badge label={c.director} color={C.blue}/>)}
        {(() => {
          const ld = (data.decisions||[]).filter(d => d.linkedCaseId === c.id);
          if (ld.length === 0 || !onNavigate) return null;
          const latest = [...ld].sort((a,b) => (b.updatedAt||b.createdAt||"").localeCompare(a.updatedAt||a.createdAt||""))[0];
          return <span onClick={() => onNavigate("decisions", { focusDecisionId: latest.id })} style={{ cursor:"pointer" }} title={ld.length === 1 ? "Ouvrir la décision liée" : `Ouvrir la décision la plus récente (${ld.length} liées)`}>
            <Badge label={ld.length === 1 ? "⚖ Décision" : `⚖ Décisions (${ld.length})`} color={C.purple} size={9}/>
          </span>;
        })()}
        {c.owner && <Mono color={C.textD}>Owner · {c.owner}</Mono>}
        <ProvinceBadge province={getProvince(c, data.profile)}/>
        {c.openDate && <Mono color={C.textD}>Ouvert: {c.openDate}</Mono>}
        {c.dueDate && <Mono color={C.purple}>Échéance: {c.dueDate}</Mono>}
        {c.closedDate && <Mono color={C.em}>Fermé: {c.closedDate}</Mono>}
      </div>

      {/* ⚡ Brief Copilot — généré sur demande via bouton (display only) */}
      <CaseBrief caseObj={c} data={data} />

      <Card>
        {[["Employé / Groupe",c.employee],["Département",c.department],["Situation",c.situation],
          ["Interventions",c.interventionsDone],["Décision",c.decision],["Position RH",c.hrPosition],
          ["Prochain suivi",c.nextFollowUp],["Notes HRBP",c.notes]].map(([l,v],i) => v ? (
          <div key={i} style={{ marginBottom:14 }}>
            <Mono color={C.textD} size={9}>{l}</Mono>
            <div style={{ fontSize:13, color:C.text, lineHeight:1.65, marginTop:4 }}>{v}</div>
            <Divider my={8}/>
          </div>) : null)}
      </Card>

      {/* ── Timeline ──────────────────────────────────────────────── */}
      {(() => {
        const events = [];
        // Case creation
        const created = c.createdAt || c.savedAt || c.openDate;
        if (created) events.push({ date: created, type:"case", icon:"📂", label:"Dossier ouvert", sub: c.title || "", color: C.blue });
        // Status changes
        if (c.status === "resolved" || c.status === "closed") {
          const closedD = c.closedDate || c.savedAt;
          if (closedD) events.push({ date: closedD, type:"status", icon: c.status === "resolved" ? "✅" : "🔒",
            label: c.status === "resolved" ? "Dossier résolu" : "Dossier fermé", sub:"", color: c.status === "resolved" ? C.em : C.textD });
        }
        if (c.status === "escalated") events.push({ date: c.savedAt || created, type:"status", icon:"🚨", label:"Dossier escaladé", sub:"", color: C.red });
        // Due date
        if (c.dueDate) events.push({ date: c.dueDate, type:"deadline", icon:"⏰", label:"Échéance", sub: c.nextFollowUp || "", color: C.amber });
        // Linked decisions (B-05.2: enriched + clickable)
        (data.decisions || []).filter(d => d.linkedCaseId === c.id).forEach(d => {
          const statusLabel = d.status ? {draft:"Brouillon",decided:"Décidé",reviewed:"Révisé",archived:"Archivé"}[d.status] || "" : "";
          const excerpt = d.decisionRationale || d.selectedOption || d.background || "";
          events.push({ date: d.savedAt || d.decisionDate || d.createdAt, type:"decision", icon:"⚖",
            label: d.title || "Décision RH", sub: excerpt.length > 120 ? excerpt.slice(0,117)+"…" : excerpt, color: C.purple,
            decisionId: d.id, decisionStatus: statusLabel,
            decisionRisk: d.riskLevel || "" });
        });
        // Linked meetings (B-06.3: director match, 90-day window, max 3)
        if (c.director) {
          const dirNorm = c.director.trim().toLowerCase();
          const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
          (data.meetings || [])
            .filter(m => m.director && m.director.trim().toLowerCase() === dirNorm && m.savedAt && new Date(m.savedAt).getTime() >= cutoff)
            .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
            .slice(0, 3)
            .forEach(m => {
              events.push({ date: m.savedAt, type:"meeting", icon:"🗓", label: m.analysis?.meetingTitle || "Meeting", sub: m.meetingType || "", color: C.teal });
            });
        }
        // Linked signals (B-06.4: director/managerName match, max 2)
        if (c.director) {
          const dirNorm = c.director.trim().toLowerCase();
          (data.signals || [])
            .filter(s => s.managerName && s.managerName.trim().toLowerCase() === dirNorm)
            .sort((a, b) => new Date(b.createdAt || b.savedAt || 0) - new Date(a.createdAt || a.savedAt || 0))
            .slice(0, 2)
            .forEach(s => {
              events.push({ date: s.createdAt || s.savedAt, type:"signal", icon:"📡", label: s.title || s.label || "Signal", sub: s.level || s.riskLevel || "", color: C.amber });
            });
        }
        const sorted = events.filter(e => e.date).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 15);
        if (sorted.length === 0) return null;
        return (
          <Card style={{ marginTop: 14 }}>
            <Mono color={C.textD} size={9} style={{ marginBottom: 12, display:"block" }}>TIMELINE</Mono>
            <div style={{ position:"relative", paddingLeft:20 }}>
              {sorted.length > 1 && <div style={{ position:"absolute", left:5, top:4, bottom:4, width:2, background:C.border, borderRadius:1 }}/>}
              {sorted.map((ev, i) => {
                const isDecision = ev.type === "decision" && ev.decisionId;
                const Wrapper = isDecision ? "button" : "div";
                const wrapperProps = isDecision ? {
                  onClick: () => {
                    sessionStorage.setItem("hrbpos:openDecision", JSON.stringify({ decisionId: ev.decisionId, linkedCaseId: c.id }));
                    onNavigate && onNavigate("decisions");
                  },
                  title: "Ouvrir cette décision"
                } : {};
                return (
                  <Wrapper key={i} {...wrapperProps} style={{ position:"relative", marginBottom: i < sorted.length - 1 ? 16 : 0, paddingLeft:16,
                    ...(isDecision ? { cursor:"pointer", background:"none", border:"none", textAlign:"left",
                      fontFamily:"'DM Sans',sans-serif", padding:0, paddingLeft:16, width:"100%" } : {}) }}>
                    <div style={{ position:"absolute", left:-18, top:2, width:10, height:10, borderRadius:"50%",
                      background:ev.color, border:`2px solid ${ev.color}`, boxShadow:`0 0 0 3px ${ev.color}22`, zIndex:1 }}/>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
                      <span style={{ fontSize:11 }}>{ev.icon}</span>
                      <span style={{ fontSize:12, fontWeight:600, color: isDecision ? C.purple : C.text }}>{ev.label}</span>
                      <Badge label={ev.type === "decision" ? "Décision" : ev.type === "deadline" ? "Échéance"
                        : ev.type === "meeting" ? "Meeting" : ev.type === "signal" ? "Signal"
                        : ev.type === "status" ? "Statut" : "Dossier"} color={ev.color} size={8}/>
                      {ev.decisionStatus && <Mono color={C.textM} size={8}>{ev.decisionStatus}</Mono>}
                      {ev.decisionRisk && <RiskBadge level={({low:"Faible",medium:"Modéré",high:"Élevé"})[ev.decisionRisk]||ev.decisionRisk}/>}
                      <span style={{ fontSize:10, color:C.textD, fontFamily:"'DM Mono',monospace", marginLeft:"auto" }}>
                        {fmtDate(ev.date)}
                      </span>
                    </div>
                    {ev.sub && <div style={{ fontSize:11, color:C.textM, lineHeight:1.4 }}>{ev.sub}</div>}
                    {isDecision && <div style={{ fontSize:10, color:C.purple+"88", marginTop:2 }}>Cliquer pour ouvrir →</div>}
                  </Wrapper>
                );
              })}
            </div>
          </Card>
        );
      })()}
    </div>;
  }

  return (
    <div style={{ maxWidth:860, margin:"0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>Case Log</div>
          <div style={{ fontSize:12, color:C.textM }}>{cases.length} dossier(s) · {cases.filter(c=>c.status==="active"||c.status==="open").length} actifs</div>
        </div>
        <button onClick={() => { setForm({...EMPTY_FORM}); setEditId(null); setView("form"); }} style={css.btn(C.em)}>
          + Nouveau dossier
        </button>
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍 Rechercher..." style={{ ...css.input, maxWidth:240 }}
          onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
        <div style={{ display:"flex", gap:4 }}>
          {["all",...STATUSES.map(s=>s.id)].map(s => {
            const so = STATUSES.find(x=>x.id===s);
            return <button key={s} onClick={() => setFilterStatus(s)}
              style={{ background:filterStatus===s?(so?.color||C.em)+"22":"none",
                color:filterStatus===s?(so?.color||C.em):C.textM,
                border:`1px solid ${filterStatus===s?(so?.color||C.em)+"44":C.border}`,
                borderRadius:6, padding:"6px 12px", fontSize:11, cursor:"pointer",
                fontFamily:"'DM Sans',sans-serif" }}>
              {s==="all" ? "Tous" : so?.label}
            </button>;
          })}
        </div>
        <select value={filterProvince} onChange={e => setFilterProvince(e.target.value)} style={{ ...css.select, maxWidth:140, fontSize:11 }}>
          <option value="">Province: Toutes</option>
          {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Cases list */}
      {filtered.length === 0 && <div style={{ textAlign:"center", padding:32, color:C.textM, fontSize:13 }}>Aucun dossier ne correspond aux filtres.</div>}
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {filtered.map((c,i) => {
          const r = RISK[c.riskLevel]||RISK["Modéré"];
          const typeObj = CASE_TYPES.find(t=>t.id===c.type);
          const statusObj = STATUSES.find(s=>s.id===c.status);
          const isOverdue = c.dueDate && c.dueDate < todayISO && !["resolved","closed"].includes(c.status);
          const linkedDecisions = (data.decisions||[]).filter(d => d.linkedCaseId === c.id);
          const latestLinkedDecision = linkedDecisions.length > 0 ? [...linkedDecisions].sort((a,b) => (b.updatedAt||b.createdAt||"").localeCompare(a.updatedAt||a.createdAt||""))[0] : null;
          return <button key={c.id||i} onClick={() => { setDetail(c); setView("detail"); }}
            style={{ background:isOverdue ? C.red+"0d" : C.surfL,
              border:`1px solid ${isOverdue ? C.red+"66" : r.color+"28"}`,
              borderLeft:`3px solid ${isOverdue ? C.red : r.color}`,
              borderRadius:8, padding:"13px 15px", cursor:"pointer", textAlign:"left",
              fontFamily:"'DM Sans',sans-serif", transition:"border-color .15s" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
              <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{c.title}
                {isOverdue && <span style={{ fontSize:10, color:C.red, fontFamily:"'DM Mono',monospace", marginLeft:8 }}>⚠ ÉCHÉANCE DÉPASSÉE</span>}
              </span>
              <div style={{ display:"flex", gap:6, flexShrink:0, marginLeft:8 }}>
                <RiskBadge level={c.riskLevel}/>
                {statusObj && <Badge label={statusObj.label} color={statusObj.color}/>}
                {latestLinkedDecision && (onNavigate
                  ? <span onClick={(e)=>{e.stopPropagation();onNavigate("decisions",{focusDecisionId:latestLinkedDecision.id});}} style={{ cursor:"pointer" }} title={linkedDecisions.length === 1 ? "Ouvrir la décision liée" : `Ouvrir la plus récente (${linkedDecisions.length} liées)`}>
                      <Badge label={linkedDecisions.length === 1 ? "⚖ Décision" : `⚖ Décisions (${linkedDecisions.length})`} color={C.purple} size={9}/>
                    </span>
                  : <Badge label="⚖ Décision liée" color={C.purple} size={9}/>)}
              </div>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
              {typeObj && <span style={{ fontSize:11, color:typeObj.color }}>{typeObj.icon} {typeObj.label}</span>}
              {c.director && (onNavigate
                ? <span onClick={(e) => { e.stopPropagation(); sessionStorage.setItem("hrbpos:pendingLeader", c.director); onNavigate("leaders"); }}
                    style={{ fontSize:11, color:C.blue, cursor:"pointer", textDecoration:"underline", fontWeight:500 }}
                    title="Voir la fiche leader">· {c.director}</span>
                : <span style={{ fontSize:11, color:C.textM }}>· {c.director}</span>)}
              {c.employee && <span style={{ fontSize:11, color:C.textM }}>· {c.employee}</span>}
              <ProvinceBadge province={getProvince(c, data.profile)}/>
              {(() => { const tb = getCaseTimeBadge(c); return tb ? <span style={{ fontSize:10, color:tb.tone, fontFamily:"'DM Mono',monospace", letterSpacing:.3, marginLeft:4 }}>{tb.label}</span> : null; })()}
              {c.scope && c.scope !== "leader" && (
                <Badge label={{ individual:"Individuel", team:"Équipe", org:"Org" }[c.scope] || c.scope}
                  color={{ individual:C.blue, team:C.teal, org:C.textD }[c.scope] || C.textD}
                  size={9}/>
              )}
              {(c.dueDate||c.nextFollowUp) && <span style={{ fontSize:10, color:isOverdue ? C.red : C.purple, marginLeft:"auto" }}>📅 {c.dueDate||c.nextFollowUp}</span>}
            </div>
          </button>;
        })}
        {filtered.length === 0 && <div style={{ textAlign:"center", padding:"40px 20px", color:C.textD, fontSize:13 }}>
          {search ? "Aucun résultat" : "Aucun dossier. Créez le premier ↑"}
        </div>}
      </div>
    </div>
  );
}
