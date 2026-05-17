// Source: HRBP_OS.jsx L.1740-1998
import { useState, useEffect } from "react";
import { C, css, RISK } from '../theme.js';
import { normalizeRisk } from '../utils/normalize.js';
import { getProvince, fmtDate } from '../utils/format.js';
import { getCaseTimeBadge, INACTIVE_CASE_STATUSES } from '../utils/caseStatus.js';
import { PROVINCES } from '../utils/legal.js';
import Badge from '../components/Badge.jsx';
import Card from '../components/Card.jsx';
import Mono from '../components/Mono.jsx';
import Divider from '../components/Divider.jsx';
import ProvinceBadge from '../components/ProvinceBadge.jsx';
import ProvinceSelect from '../components/ProvinceSelect.jsx';
import CaseBrief from '../components/CaseBrief.jsx';
import { listCaseTasks, createCaseTask, updateCaseTask } from '../services/caseTasks.js';
import { checkUsage } from '../services/planLimits.js';
import { getNextOpenTask, getCaseFollowUp, fetchTasksForCases } from '../utils/caseFollowUp.js';
import { getLeadersMap, anyPersonArchived } from '../utils/leaderStore.js';
import { useT, t as tFn } from '../lib/i18n.js';
import { tStatus, tRisk, tDecisionStatus, tDecisionRisk } from '../lib/i18nEnums.js';

// Inline shared helper (used in multiple modules, to be reviewed at Bloc 7)
function RiskBadge({ level }) {
  const { t } = useT();
  const norm = normalizeRisk(level);
  const r = RISK[norm] || RISK["Modéré"];
  return <Badge label={tRisk(t, norm)} color={r.color} />;
}

// Phase 3 Batch 2 — case_tasks panel.
// Reads/writes public.case_tasks via the isolated service. Coexists with the
// legacy `c.nextFollowUp` text field (not removed in this batch). When tasks
// exist alongside a non-empty nextFollowUp, both surfaces are shown so HRBPs
// can manually migrate at their own pace; data migration is a later batch.
function CaseTasksPanel({ caseId, legacyFollowUp, onTasksChange }) {
  const [tasks, setTasks]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [title, setTitle]       = useState("");
  const [dueDate, setDueDate]   = useState("");
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState("");

  const refetch = async () => {
    if (!caseId) return;
    setLoading(true); setError("");
    const res = await listCaseTasks(caseId);
    if (res.ok) {
      const fresh = res.tasks || [];
      setTasks(fresh);
      setUnavailable(false);
      // Phase 3 Batch 2.6 — push fresh tasks up so the parent's tasksByCase
      // cache (used by the list pill and detail "Prochain suivi" row) stays
      // in sync with this panel's mutations without waiting for a navigation.
      if (typeof onTasksChange === "function") onTasksChange(caseId, fresh);
    } else if (res.reason === "no-client") {
      setUnavailable(true);
      setTasks([]);
    } else {
      setError(res.reason || "load-failed");
      setTasks([]);
    }
    setLoading(false);
  };

  useEffect(() => { refetch(); /* eslint-disable-line */ }, [caseId]);

  const addTask = async () => {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true); setError("");
    const res = await createCaseTask({ case_id: caseId, title: trimmed, due_date: dueDate || null });
    setBusy(false);
    if (!res.ok) { setError(res.reason || "create-failed"); return; }
    setTitle(""); setDueDate("");
    refetch();
  };

  const transitionTask = async (taskId, newStatus) => {
    if (busy) return;
    setBusy(true); setError("");
    const res = await updateCaseTask(taskId, { status: newStatus });
    setBusy(false);
    if (!res.ok) { setError(res.reason || "update-failed"); return; }
    refetch();
  };

  const open      = tasks.filter(t => t.status === "open");
  const done      = tasks.filter(t => t.status === "done");
  const cancelled = tasks.filter(t => t.status === "cancelled");

  const TaskRow = ({ task }) => {
    const muted = task.status !== "open";
    return (
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0",
        borderBottom:`1px solid ${C.borderL}`, opacity: muted ? .55 : 1 }}>
        <div style={{ flex:1, fontSize:13, color:C.text,
          textDecoration: task.status === "cancelled" ? "line-through" : "none" }}>
          {task.title}
          {task.due_date && <Mono color={C.textD} size={9} style={{ marginLeft:8 }}>· {task.due_date}</Mono>}
        </div>
        {task.status === "open" && (
          <>
            <button onClick={() => transitionTask(task.id, "done")} disabled={busy}
              title="Marquer comme complété"
              style={{ ...css.btn(C.em, true), padding:"4px 10px", fontSize:11 }}>✓</button>
            <button onClick={() => transitionTask(task.id, "cancelled")} disabled={busy}
              title="Annuler"
              style={{ ...css.btn(C.textD, true), padding:"4px 10px", fontSize:11 }}>✗</button>
          </>
        )}
        {task.status !== "open" && (
          <Mono color={C.textD} size={9}>{task.status === "done" ? "Complété" : "Annulé"}</Mono>
        )}
      </div>
    );
  };

  return (
    <Card style={{ marginBottom:16 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <Mono color={C.textD} size={9}>SUIVIS / TÂCHES</Mono>
        {loading && <Mono color={C.textD} size={9}>chargement…</Mono>}
      </div>

      {legacyFollowUp && (
        <div style={{ padding:"8px 10px", marginBottom:10, background:C.amber+"14",
          border:`1px solid ${C.amber}33`, borderLeft:`3px solid ${C.amber}`, borderRadius:6 }}>
          <Mono color={C.amber} size={9}>SUIVI HÉRITÉ (champ texte)</Mono>
          <div style={{ fontSize:12, color:C.text, marginTop:4 }}>{legacyFollowUp}</div>
          <Mono color={C.textD} size={9} style={{ marginTop:4 }}>
            À convertir manuellement en tâche ci-dessous (la migration automatique arrivera plus tard).
          </Mono>
        </div>
      )}

      {unavailable ? (
        <Mono color={C.textD} size={9}>Service de tâches indisponible (Supabase non connecté).</Mono>
      ) : (
        <>
          <div style={{ display:"flex", gap:8, marginBottom:12 }}>
            <input
              type="text"
              placeholder="Nouvelle tâche…"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addTask(); }}
              disabled={busy}
              style={{ flex:1, padding:"6px 10px", fontSize:13, color:C.text,
                background:C.surfL, border:`1px solid ${C.border}`, borderRadius:4 }}
            />
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              disabled={busy}
              style={{ padding:"6px 10px", fontSize:13, color:C.text,
                background:C.surfL, border:`1px solid ${C.border}`, borderRadius:4 }}
            />
            <button onClick={addTask} disabled={busy || !title.trim()}
              style={{ ...css.btn(C.em, true), padding:"6px 14px", fontSize:12,
                opacity: (busy || !title.trim()) ? .4 : 1 }}>+ Ajouter</button>
          </div>

          {error && <Mono color={C.red} size={9} style={{ marginBottom:8 }}>Erreur: {error}</Mono>}

          {open.length === 0 && done.length === 0 && cancelled.length === 0 && !loading && (
            <Mono color={C.textD} size={9}>Aucune tâche pour le moment.</Mono>
          )}

          {open.length > 0 && (
            <div>
              {open.map(task => <TaskRow key={task.id} task={task} />)}
            </div>
          )}

          {(done.length > 0 || cancelled.length > 0) && (
            <details style={{ marginTop:12 }}>
              <summary style={{ cursor:"pointer", fontSize:11, color:C.textD,
                fontFamily:"'DM Mono',monospace" }}>
                Historique ({done.length + cancelled.length})
              </summary>
              <div style={{ marginTop:8 }}>
                {done.map(task => <TaskRow key={task.id} task={task} />)}
                {cancelled.map(task => <TaskRow key={task.id} task={task} />)}
              </div>
            </details>
          )}
        </>
      )}
    </Card>
  );
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
  {id:"open",        label:"Ouvert",     color:C.blue},
  {id:"in_progress", label:"En cours",   color:C.amber},
  {id:"waiting",     label:"En attente", color:C.purple},
  {id:"closed",      label:"Fermé",      color:C.textD},
  {id:"archived",    label:"Archivé",    color:C.textD},
];
const ACTIVE_STATUSES = ["open","in_progress","waiting"];
// Phase 3 Batch 3.1 — single source of truth for "inactive" classification
// is INACTIVE_CASE_STATUSES from caseStatus.js (now includes "deleted").
const URGENCY_C    = {"Immediat":C.red,"Cette semaine":C.amber,"Ce mois":C.blue,"En veille":C.textD};
const EVO_C        = {"Nouveau":C.blue,"En cours":C.amber,"Aggravé":C.red,"En amélioration":C.teal,"Bloqué":C.red,"Résolu":C.em};
const HR_POSTURE_C = {"Partenaire":C.blue,"Garant":C.red,"Coach":C.teal,"Neutre":C.textD,"Enquêteur":"#7a1e2e"};
// Newest-first key — applied uniformly after status filtering so every
// Case Journal tab (active/archived/all × open/closed/etc.) sorts the same way.
// Numeric (ms) so date-only strings and full ISO timestamps compare correctly.
function _caseSortKey(c) {
  const raw = c?.updatedAt || c?.lastUpdated || c?.createdAt || c?.date || "";
  const ms = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(ms) ? ms : 0;
}
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

const EMPTY_FORM = { title:"", type:"conflict_ee", riskLevel:"Modéré", status:"open",
  director:"", employee:"", department:"", openDate:new Date().toISOString().split("T")[0],
  province:"QC",
  situation:"", interventionsDone:"", hrPosition:"", decision:"",
  notes:"", actions:[],
  scope:"leader", owner:"HRBP", dueDate:"", urgency:"Cette semaine", evolution:"", hrPosture:"", closedDate:"",
};

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
  const { t } = useT();
  const SF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const FO = { onFocus:e=>e.target.style.borderColor=C.em+"60", onBlur:e=>e.target.style.borderColor=C.border };

  return (
    // autoComplete="off" au niveau <form> — Chrome l'ignore sur les champs individuels
    // mais respecte la directive au niveau du formulaire (fix Chrome Autofill focus theft)
    <form autoComplete="off" onSubmit={e => e.preventDefault()} style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button type="button" onClick={onCancel}
          style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>← {t("common.back")}</button>
        <div style={{ fontSize:17, fontWeight:700, color:C.text }}>
          {editId ? t("case.form.heading.edit") : t("case.form.heading.new")}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        {fl(t("case.form.title"),
          <input value={form.title} onChange={SF("title")}
            placeholder={t("case.form.ph.title")} style={css.input}
            autoComplete="off" {...FO}/>
        )}
        {fl(t("case.form.openDate"),
          <input value={form.openDate} onChange={SF("openDate")}
            style={css.input} autoComplete="off" {...FO}/>
        )}
        {fl(t("case.form.type"),
          <select value={form.type} onChange={SF("type")} style={css.select}>
            {CASE_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
          </select>
        )}
        {fl(t("case.form.status"),
          <select value={form.status} onChange={SF("status")} style={css.select}>
            {STATUSES.map(s => <option key={s.id} value={s.id}>{tStatus(t, s.id)}</option>)}
          </select>
        )}
        {fl(t("case.form.risk"),
          <select value={form.riskLevel} onChange={SF("riskLevel")} style={css.select}>
            {["Critique","Élevé","Modéré","Faible"].map(r => <option key={r} value={r}>{tRisk(t, r)}</option>)}
          </select>
        )}
        {fl(t("case.form.director"),
          <input value={form.director} onChange={SF("director")}
            placeholder={t("case.form.ph.director")} style={css.input}
            autoComplete="off" {...FO}/>
        )}
        {fl(t("case.form.employee"),
          <input value={form.employee} onChange={SF("employee")}
            placeholder={t("case.form.ph.employee")} style={css.input}
            autoComplete="off" {...FO}/>
        )}
        {fl(t("case.form.department"),
          <input value={form.department} onChange={SF("department")}
            placeholder={t("case.form.ph.department")} style={css.input}
            autoComplete="off" {...FO}/>
        )}
        {fl(t("common.province"),
          <ProvinceSelect
            value={form.province||defaultProvince||"QC"}
            onChange={e=>setForm(f=>({...f,province:e.target.value}))}/>
        )}
        {fl(t("case.form.owner"),
          <select value={form.owner||"HRBP"} onChange={SF("owner")} style={css.select}>
            {["HRBP","Gestionnaire","HRBP + Gestionnaire","Direction"].map(o=><option key={o} value={o}>{o}</option>)}
          </select>
        )}
        {fl(t("case.form.scope"),
          <select value={form.scope||"leader"} onChange={SF("scope")} style={css.select}>
            <option value="leader">Leader / Gestionnaire</option>
            <option value="individual">Employé / Individuel</option>
            <option value="team">Équipe</option>
            <option value="org">Organisation / Projet</option>
          </select>
        )}
        {fl(t("case.form.urgency"),
          <select value={form.urgency||"Cette semaine"} onChange={SF("urgency")} style={css.select}>
            {["Immediat","Cette semaine","Ce mois","En veille"].map(u=><option key={u} value={u}>{u}</option>)}
          </select>
        )}
        {fl(t("case.form.evolution"),
          <select value={form.evolution||""} onChange={SF("evolution")} style={css.select}>
            <option value="">— Non renseignée</option>
            {["Nouveau","En cours","Aggravé","En amélioration","Bloqué","Résolu"].map(ev=><option key={ev} value={ev}>{ev}</option>)}
          </select>
        )}
        {fl(t("case.form.hrPosture"),
          <select value={form.hrPosture||""} onChange={SF("hrPosture")} style={css.select}>
            <option value="">— Non renseignée</option>
            {["Partenaire","Garant","Coach","Neutre","Enquêteur"].map(p=><option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>

      {fl(t("case.form.situation"),
        <textarea rows={3} value={form.situation} onChange={SF("situation")}
          placeholder={t("case.form.ph.situation")} style={css.textarea}
          autoComplete="off" {...FO}/>
      )}
      {fl(t("case.form.interventions"),
        <textarea rows={2} value={form.interventionsDone} onChange={SF("interventionsDone")}
          placeholder={t("case.form.ph.interventions")} style={css.textarea}
          autoComplete="off" {...FO}/>
      )}
      {fl(t("case.form.hrPosition"),
        <textarea rows={2} value={form.hrPosition} onChange={SF("hrPosition")}
          placeholder={t("case.form.ph.hrPosition")} style={css.textarea}
          autoComplete="off" {...FO}/>
      )}
      {fl(t("case.form.decision"),
        <textarea rows={2} value={form.decision||""} onChange={SF("decision")}
          placeholder={t("case.form.ph.decision")} style={css.textarea}
          autoComplete="off" {...FO}/>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        {/* Phase 3 Batch 2.11 — the legacy free-text follow-up input was
            removed from the form. Users now manage follow-ups as tasks
            on the saved case (case_tasks panel). Existing nextFollowUp
            data on legacy rows is preserved by normalizeCase and still
            surfaces via getCaseFollowUp's last-priority fallback. */}
        <div style={{ alignSelf:"end", padding:"10px 12px",
          background:C.surfL, border:`1px dashed ${C.border}`, borderRadius:6 }}>
          <Mono color={C.textD} size={9}>SUIVI</Mono>
          <div style={{ fontSize:11, color:C.textD, marginTop:6, lineHeight:1.55 }}>
            Les suivis se gèrent comme tâches sur la fiche du dossier (après enregistrement).
          </div>
        </div>
        {fl(t("case.form.dueDate"),
          <input type="date" value={form.dueDate||""} onChange={SF("dueDate")}
            style={css.input} {...FO}/>
        )}
      </div>
      {fl(t("case.form.notes"),
        <textarea rows={2} value={form.notes} onChange={SF("notes")}
          placeholder={t("case.form.ph.notes")} style={css.textarea}
          autoComplete="off" {...FO}/>
      )}

      <div style={{ display:"flex", gap:10, marginTop:8 }}>
        <button type="button" onClick={onSave} disabled={!form.title}
          style={{ ...css.btn(C.em), flex:1, opacity:form.title?1:.4 }}>
          {editId ? `💾 ${t("common.update")}` : `💾 ${t("common.create")}`}
        </button>
        <button type="button" onClick={onCancel} style={{ ...css.btn(C.textM, true) }}>{t("common.cancel")}</button>
      </div>
    </form>
  );
}

// ── Clipboard export formatter ────────────────────────────────────────────────
// Phase 3 Batch 2.7: optional `tasks` param feeds getCaseFollowUp so the
// PROCHAIN SUIVI section and the timeline "Échéance" event reflect the
// preferred follow-up (open task > legacy dueDate > legacy nextFollowUp).
// Called without `tasks` will still work — the helper falls back to the
// legacy fields, matching pre-2.7 behavior.
function formatCaseForClipboard(c, data, tasks) {
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
  // Phase 3 Batch 2.7: PROCHAIN SUIVI section uses the unified helper.
  // When the source is the open task we render the title (with optional
  // date suffix); when it falls back to dueDate/nextFollowUp we render the
  // raw legacy value. Section is omitted entirely when no follow-up exists.
  const _fu = getCaseFollowUp(c, tasks);
  if (_fu) {
    lines.push(""); lines.push(`${secSep}PROCHAIN SUIVI`);
    if (_fu.source === "task") {
      lines.push(_fu.due ? `${_fu.title} — échéance ${_fu.due}` : _fu.title);
    } else if (_fu.source === "due_date") {
      lines.push(`Échéance ${_fu.due}`);
    } else {
      lines.push(_fu.title);
    }
  }
  if (c.notes)              { lines.push(""); lines.push(`${secSep}NOTES`); lines.push(c.notes); }

  // Décisions liées (section dédiée)
  const linkedDecs = (data.decisions || []).filter(d => d.linkedCaseId === c.id);
  if (linkedDecs.length > 0) {
    lines.push(""); lines.push(`${secSep}DÉCISIONS LIÉES (${linkedDecs.length})`);
    linkedDecs.forEach(d => {
      const statusLabel = d.status ? tDecisionStatus(tFn, d.status) : "";
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
  if ((c.status === "closed" || c.status === "archived") && (c.closedDate || c.savedAt))
    tlEvents.push({ date: c.closedDate || c.savedAt, label: c.status === "archived" ? "Dossier archivé" : "Dossier fermé" });
  // Phase 3 Batch 2.7: deadline event prefers the helper's resolved due
  // date. When the source is `next_follow_up` (no date), the event is
  // omitted — matching pre-2.7 behavior, which never pushed a dateless event.
  if (_fu && _fu.due) {
    tlEvents.push({ date: _fu.due, label: _fu.title ? `Échéance — ${_fu.title}` : "Échéance" });
  }
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

export default function ModuleCases({ data, onSave, onTransitionCase, onNavigate, focusCaseId, onClearFocus, subscription, userEmail }) {
  const { t } = useT();
  const [view, setView] = useState("list"); // list | form | detail
  const [form, setForm] = useState({...EMPTY_FORM});
  const [editId, setEditId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterProvince, setFilterProvince] = useState("");
  const [filterArchived, setFilterArchived] = useState("active"); // active | archived | all
  // Phase 3 Batch 2.5 — per-case task cache for read-only display in list/detail.
  // Bulk-fetched on mount and when cases-length / view changes. Stale between
  // fetches if the panel adds tasks while the user stays in detail view; the
  // cache resyncs when the user navigates back to the list. Acceptable for
  // minimum-scope display preference. Falls back to legacy `c.nextFollowUp`
  // when no entry / no open task exists for a case.
  const [tasksByCase, setTasksByCase] = useState({});

  // ── Inter-module focus: auto-open a specific case on mount ───────────────────
  useEffect(() => {
    if (!focusCaseId) return;
    const target = (data.cases || []).find(c => c.id === focusCaseId);
    if (target) { setDetail(target); setView("detail"); }
    if (onClearFocus) onClearFocus();
  }, [focusCaseId]); // eslint-disable-line

  // Bulk-fetch tasks for all cases. Returns gracefully (empty object) when
  // Supabase is unavailable. Refetches on cases-length change and on view
  // transitions back to the list, so additions made via the detail panel
  // become visible on the list pill after a navigation.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = await fetchTasksForCases(data.cases || []);
      if (!cancelled) setTasksByCase(map);
    })();
    return () => { cancelled = true; };
  }, [data.cases?.length, view]); // eslint-disable-line

  // Portfolio archive sync: a person archived in data.leaders propagates to
  // their cases (related via director / employee name). Active view hides
  // them; archived/all keep showing them so they remain reachable.
  const leadersMap = getLeadersMap(data);
  const cases = (data.cases || []).filter(c => {
    if (filterArchived === "archived") return c.status === "archived";
    if (filterArchived === "all") return true;
    if (c.status === "archived") return false;
    if (anyPersonArchived([c.director, c.employee], leadersMap)) return false;
    return true;
  });
  const todayISO = new Date().toISOString().split("T")[0];
  const filtered = cases.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.title?.toLowerCase().includes(q) || c.director?.toLowerCase().includes(q) || c.employee?.toLowerCase().includes(q);
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    const matchProvince = !filterProvince || getProvince(c, data.profile) === filterProvince;
    return matchSearch && matchStatus && matchProvince;
  }).sort((a, b) => _caseSortKey(b) - _caseSortKey(a));

  const save = async () => {
    const today = new Date().toISOString().split("T")[0];
    const isClosing = form.status === "closed" || form.status === "archived";
    const closedDate = isClosing ? (form.closedDate || today) : "";
    const allCases = data.cases || [];
    const existingCase = editId ? allCases.find(c => c.id === editId) : null;
    if (editId && existingCase?.status === "archived") { setView("list"); setForm({...EMPTY_FORM}); setEditId(null); return; }
    // Sprint 3 — Étape 4: plan quota check on case creation only (edits skip).
    if (!editId) {
      const check = checkUsage(subscription, "cases", allCases.length, userEmail);
      if (!check.allowed) {
        if (typeof window !== "undefined" && typeof window.alert === "function") window.alert(check.message);
        return;
      }
    }
    const newCase = { ...form, closedDate, id: editId || Date.now().toString(), updatedAt: today,
      dateCreated: existingCase?.dateCreated || today };
    // Phase 2.5: when editing an existing case AND the form changed the
    // status, route the change through transitionCase so status writes
    // remain centralized. Other form fields ride along via extraPatch.
    if (editId && existingCase && existingCase.status !== form.status) {
      const { status: _droppedStatus, ...formFieldsWithoutStatus } = newCase;
      await onTransitionCase(editId, form.status, formFieldsWithoutStatus);
    } else {
      const updated = editId ? allCases.map(c => c.id===editId ? newCase : c) : [...allCases, newCase];
      onSave("cases", updated);
    }
    setView("list"); setForm({...EMPTY_FORM}); setEditId(null);
  };

  const archiveCase = async (id) => {
    const now = new Date().toISOString();
    // Phase 3 Batch 1: `archived` boolean is derived from status by
    // normalizeCase — stamping it explicitly is redundant. Only the
    // archive-specific metadata (archivedAt / archivedReason) is co-written.
    await onTransitionCase(id, "archived", {
      archivedAt: now,
      archivedReason: "user_archived",
    });
    setView("list");
  };

  const openEdit = (c) => {
    if (c?.status === "archived") return;
    setForm({...EMPTY_FORM, ...c}); setEditId(c.id); setView("form");
  };

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
    const isArchived = c.status === "archived";
    const archivedDate = c.archivedAt ? fmtDate(c.archivedAt) : null;
    const isClosed = c.status === "closed";
    return <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
        <button onClick={() => setView("list")} style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>← {t("common.back")}</button>
        <div style={{ flex:1, fontSize:16, fontWeight:700, color:C.text }}>{c.title}</div>
        <button onClick={async () => {
            const text = formatCaseForClipboard(c, data, tasksByCase[c.id]);
            try { await navigator.clipboard.writeText(text); }
            catch { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); }
            setCopied(true); setTimeout(() => setCopied(false), 2000);
          }}
          style={{ ...css.btn(copied ? C.em : C.textM, true), padding:"6px 14px", fontSize:12 }}>
          {copied ? `✓ ${t("common.copied")}` : `📋 ${t("common.copy")}`}</button>
        <button onClick={() => openEdit(c)} disabled={isArchived}
          title={isArchived ? t("case.detail.editArchivedTooltip") : t("case.detail.editTooltip")}
          style={{ ...css.btn(C.blue, true), padding:"6px 14px", fontSize:12, opacity:isArchived?.4:1, cursor:isArchived?"not-allowed":"pointer" }}>✏ {t("common.edit")}</button>
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
        {!isArchived && (
          isClosed
            ? <button onClick={async () => {
                const res = await onTransitionCase(c.id, "open");
                if (res && res.ok && res.case) setDetail(res.case);
              }}
                title="Rouvrir ce dossier (le marquer comme actif)"
                style={{ ...css.btn(C.em, true), padding:"6px 14px", fontSize:12 }}>🔓 {t("case.action.reopen")}</button>
            : <button onClick={async () => {
                const res = await onTransitionCase(c.id, "closed");
                if (res && res.ok && res.case) setDetail(res.case);
              }}
                title="Marquer ce dossier comme fermé (n'archive pas)"
                style={{ ...css.btn(C.textD, true), padding:"6px 14px", fontSize:12 }}>🔒 {t("case.action.markClosed")}</button>
        )}
        {!isArchived && <button onClick={() => { if(window.confirm(t("case.confirm.archive"))) archiveCase(c.id); }}
          style={{ ...css.btn(C.red, true), padding:"6px 14px", fontSize:12 }}>📦 {t("case.action.archive")}</button>}
      </div>
      {isArchived && (
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", marginBottom:16,
          background:C.textD+"14", border:`1px solid ${C.textD}44`, borderLeft:`3px solid ${C.textD}`, borderRadius:8 }}>
          <span style={{ fontSize:14 }}>📦</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, fontWeight:600, color:C.text }}>{t("case.detail.archivedBanner")}</div>
            <Mono color={C.textD} size={9}>
              {archivedDate ? t("case.detail.archivedAt").replace("{date}", archivedDate) : t("case.detail.archivedKept")} · {t("case.detail.editingDisabled")}
            </Mono>
          </div>
        </div>
      )}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
        <RiskBadge level={c.riskLevel}/>
        {statusObj && <Badge label={tStatus(t, statusObj.id)} color={statusObj.color}/>}
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
        {(() => {
          // Phase 3 Batch 2.7 — "Prochain suivi" row sourced through the
          // unified getCaseFollowUp helper (open task > dueDate > nextFollowUp).
          const fu = getCaseFollowUp(c, tasksByCase[c.id]);
          const followUpDisplay = !fu ? "" :
            fu.source === "task"     ? (fu.due ? `${fu.title} — échéance ${fu.due}` : fu.title) :
            fu.source === "due_date" ? `Échéance ${fu.due}` :
            /* next_follow_up */       fu.title;
          return [["Employé / Groupe",c.employee],["Département",c.department],["Situation",c.situation],
            ["Interventions",c.interventionsDone],["Décision",c.decision],["Position RH",c.hrPosition],
            ["Prochain suivi",followUpDisplay],["Notes HRBP",c.notes]].map(([l,v],i) => v ? (
            <div key={i} style={{ marginBottom:14 }}>
              <Mono color={C.textD} size={9}>{l}</Mono>
              <div style={{ fontSize:13, color:C.text, lineHeight:1.65, marginTop:4 }}>{v}</div>
              <Divider my={8}/>
            </div>) : null);
        })()}
      </Card>

      <CaseTasksPanel
        caseId={c.id}
        legacyFollowUp={c.nextFollowUp || ""}
        onTasksChange={(id, tasks) => setTasksByCase(prev => ({ ...prev, [id]: tasks }))}
      />

      {/* ── Timeline ──────────────────────────────────────────────── */}
      {(() => {
        const events = [];
        // Case creation
        const created = c.createdAt || c.savedAt || c.openDate;
        if (created) events.push({ date: created, type:"case", icon:"📂", label:t("case.timeline.opened"), sub: c.title || "", color: C.blue });
        // Status changes
        if (c.status === "closed" || c.status === "archived") {
          const closedD = c.closedDate || c.savedAt;
          if (closedD) events.push({ date: closedD, type:"status", icon: c.status === "archived" ? "📦" : "🔒",
            label: c.status === "archived" ? t("case.timeline.archived") : t("case.timeline.closed"), sub:"", color: C.textD });
        }
        // Due date
        // Phase 3 Batch 2.7: deadline event sourced through the unified
        // helper — open task date wins, then legacy dueDate. Sub-label is
        // the task title (or empty when the source is dueDate alone).
        const _fuTl = getCaseFollowUp(c, tasksByCase[c.id]);
        if (_fuTl && _fuTl.due) events.push({ date: _fuTl.due, type:"deadline", icon:"⏰", label:t("case.timeline.deadline"), sub: _fuTl.title || "", color: C.amber });
        // Linked decisions (B-05.2: enriched + clickable)
        (data.decisions || []).filter(d => d.linkedCaseId === c.id).forEach(d => {
          const statusLabel = d.status ? tDecisionStatus(t, d.status) : "";
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
            <Mono color={C.textD} size={9} style={{ marginBottom: 12, display:"block" }}>{t("case.timeline.heading")}</Mono>
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
                      <Badge label={t(`case.timeline.badge.${ev.type === "status" ? "status" : ev.type}`) || t("case.timeline.badge.case")} color={ev.color} size={8}/>
                      {ev.decisionStatus && <Mono color={C.textM} size={8}>{ev.decisionStatus}</Mono>}
                      {ev.decisionRisk && <Badge label={tDecisionRisk(t, ev.decisionRisk)} color={({low:C.em, medium:C.amber, high:C.red})[ev.decisionRisk] || C.textD} size={9}/>}
                      <span style={{ fontSize:10, color:C.textD, fontFamily:"'DM Mono',monospace", marginLeft:"auto" }}>
                        {fmtDate(ev.date)}
                      </span>
                    </div>
                    {ev.sub && <div style={{ fontSize:11, color:C.textM, lineHeight:1.4 }}>{ev.sub}</div>}
                    {isDecision && <div style={{ fontSize:10, color:C.purple+"88", marginTop:2 }}>{t("case.detail.openDecisionHint")}</div>}
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
          <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>{t("case.title")}</div>
          <div style={{ fontSize:12, color:C.textM }}>
            {cases.length} dossier(s){filterArchived !== "archived" ? ` · ${cases.filter(c=>ACTIVE_STATUSES.includes(c.status)).length} actifs` : ""}
          </div>
        </div>
        <button onClick={() => { setForm({...EMPTY_FORM}); setEditId(null); setView("form"); }} style={css.btn(C.em)}>
          {t("case.new")}
        </button>
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder={`🔍 ${t("common.search")}`} style={{ ...css.input, maxWidth:240 }}
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
              {s==="all" ? t("common.all") : tStatus(t, so.id)}
            </button>;
          })}
        </div>
        <select value={filterProvince} onChange={e => setFilterProvince(e.target.value)} style={{ ...css.select, maxWidth:140, fontSize:11 }}>
          <option value="">{t("common.province")}: {t("common.all")}</option>
          {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <div style={{ display:"flex", gap:4 }}>
          {[{id:"active",label:t("case.filter.active")},{id:"archived",label:t("case.filter.archived")},{id:"all",label:t("case.filter.all")}].map(opt => (
            <button key={opt.id} onClick={() => setFilterArchived(opt.id)}
              title={opt.id==="archived" ? "Afficher uniquement les dossiers archivés" : opt.id==="all" ? "Afficher tous les dossiers (actifs + archivés)" : "Afficher uniquement les dossiers actifs"}
              style={{ background:filterArchived===opt.id?C.textD+"22":"none",
                color:filterArchived===opt.id?C.text:C.textM,
                border:`1px solid ${filterArchived===opt.id?C.textD+"55":C.border}`,
                borderRadius:6, padding:"6px 12px", fontSize:11, cursor:"pointer",
                fontFamily:"'DM Sans',sans-serif" }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cases list */}
      {filtered.length === 0 && <div style={{ textAlign:"center", padding:32, color:C.textM, fontSize:13 }}>{t("case.empty.noFilter")}</div>}
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {filtered.map((c,i) => {
          const r = RISK[c.riskLevel]||RISK["Modéré"];
          const typeObj = CASE_TYPES.find(t=>t.id===c.type);
          const statusObj = STATUSES.find(s=>s.id===c.status);
          const isOverdue = c.dueDate && c.dueDate < todayISO && !INACTIVE_CASE_STATUSES.includes(c.status);
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
                {statusObj && <Badge label={tStatus(t, statusObj.id)} color={statusObj.color}/>}
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
              {(() => {
                const fu = getCaseFollowUp(c, tasksByCase[c.id]);
                const pillText = fu?.due || fu?.title || "";
                return pillText ? <span style={{ fontSize:10, color:isOverdue ? C.red : C.purple, marginLeft:"auto" }}>📅 {pillText}</span> : null;
              })()}
            </div>
          </button>;
        })}
        {filtered.length === 0 && <div style={{ textAlign:"center", padding:"40px 20px", color:C.textD, fontSize:13 }}>
          {search ? t("case.empty.noResults") : t("case.empty.noCases")}
        </div>}
      </div>
    </div>
  );
}
