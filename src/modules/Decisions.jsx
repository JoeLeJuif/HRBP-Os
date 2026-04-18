// ── MODULE: DECISIONS — Decision Log RH ──────────────────────────────────────
import { useState, useEffect } from "react";
import { C, css } from '../theme.js';
import { callAI } from '../api/index.js';
import { LEGAL_GUARDRAIL, buildLegalPromptContext, getLegalContext, PROVINCES } from '../utils/legal.js';
import { fmtDate } from '../utils/format.js';
import Badge from '../components/Badge.jsx';
import Card from '../components/Card.jsx';
import Mono from '../components/Mono.jsx';
import ProvinceSelect from '../components/ProvinceSelect.jsx';
import ProvinceBadge from '../components/ProvinceBadge.jsx';

// ── Shared inline helpers ─────────────────────────────────────────────────────
function SecHead({ icon, label, color=C.em }) {
  return <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, paddingBottom:8, borderBottom:`1px solid ${color}28` }}>
    <span style={{ fontSize:14 }}>{icon}</span>
    <Mono size={10} color={color}>{label}</Mono>
  </div>;
}

const DECISION_TYPES = [
  { value:"discipline", label:"Discipline" },
  { value:"performance", label:"Performance" },
  { value:"organizational", label:"Organisationnel" },
  { value:"talent", label:"Talent" },
  { value:"legal", label:"Légal" },
  { value:"other", label:"Autre" },
];
const DECISION_STATUSES = [
  { value:"draft", label:"Brouillon", color:C.textM },
  { value:"decided", label:"Décidé", color:C.em },
  { value:"reviewed", label:"Révisé", color:C.blue },
  { value:"archived", label:"Archivé", color:C.textD },
];
const DECISION_RISK = [
  { value:"low", label:"Faible", color:C.em },
  { value:"medium", label:"Modéré", color:C.amber },
  { value:"high", label:"Élevé", color:C.red },
];

const EMPTY_DECISION = {
  id:"", title:"", decisionDate:new Date().toISOString().split("T")[0],
  managerName:"", employeeName:"", linkedCaseId:"", linkedInvestigationId:"",
  decisionType:"discipline", riskLevel:"medium", province:"QC",
  status:"draft", facts:"", background:"", keyInputs:"",
  options:[], selectedOption:"", decisionRationale:"", decisionFactors:"",
  anticipatedRisks:{ legalRisk:"", employeeRelationsRisk:"", managerCapabilityRisk:"", organizationalRisk:"", precedentRisk:"", mitigationPlan:"" },
  legalNotes:{ legalNotes:"", applicableFramework:"", consultedSources:"", legalCautions:"" },
  outcome:"", followUpActions:"", reviewDate:"", retrospective:"",
  whatWorked:"", whatWasMissed:"", wouldDoSameAgain:"", createdAt:"", updatedAt:"",
};

function migrateDecision(d) {
  const base = { ...EMPTY_DECISION };
  Object.keys(d).forEach(k => { if (d[k] !== undefined && d[k] !== null) base[k] = d[k]; });
  if (!base.anticipatedRisks || typeof base.anticipatedRisks !== "object") base.anticipatedRisks = { ...EMPTY_DECISION.anticipatedRisks };
  if (!base.legalNotes || typeof base.legalNotes !== "object") base.legalNotes = { ...EMPTY_DECISION.legalNotes };
  if (!Array.isArray(base.options)) base.options = [];
  return base;
}

// ── AI prompt helpers ────────────────────────────────────────────────────────

function buildDecisionPromptContext(decision, legalContext) {
  return `TITRE: ${decision.title||"Non specifie"}
TYPE: ${decision.decisionType||"Non specifie"}
RISQUE: ${decision.riskLevel||"medium"}
GESTIONNAIRE: ${decision.managerName||"Non specifie"}
${decision.employeeName ? `EMPLOYE: ${decision.employeeName}` : ""}

FAITS:
${decision.facts||"Aucun fait fourni"}

CONTEXTE:
${decision.background||"Aucun contexte"}

ELEMENTS CLES:
${decision.keyInputs||"Aucun"}

OPTIONS CONSIDEREES:
${(decision.options||[]).map((o,i) => `Option ${i+1}: ${o.title||o.label||"Sans titre"} — ${o.description||""}`).join("\n")||"Aucune option"}

OPTION RETENUE: ${decision.selectedOption||"Aucune"}
JUSTIFICATION: ${decision.decisionRationale||"Aucune"}

${legalContext}`;
}

function buildGenerateOptionsPrompt(decision, legalContext) {
  const ctx = buildDecisionPromptContext(decision, legalContext);
  return { system: `Tu es HRBP senior, groupe IT, Canada. Ton role est de generer des options de decision realistes et equilibrees.
${LEGAL_GUARDRAIL}
Reponds UNIQUEMENT en JSON strict. Structure:
{"options":[{"title":"Titre court","description":"2-3 phrases","pros":["avantage"],"cons":["inconvenient"],"risks":"risques principaux"}]}
Genere exactement 3 options distinctes : une conservatrice, une moderee, une audacieuse.
Pas de guillemets simples dans les valeurs. Pas de retours a la ligne dans les valeurs.`, user: ctx };
}

function buildChallengeDecisionPrompt(decision, legalContext) {
  const ctx = buildDecisionPromptContext(decision, legalContext);
  return { system: `Tu es HRBP senior jouant le role d avocat du diable. Ton role est de challenger une decision RH en identifiant les angles morts, objections possibles et risques sous-estimes.
${LEGAL_GUARDRAIL}
Reponds UNIQUEMENT en JSON strict. Structure:
{"blindSpots":["angle mort"],"objections":[{"from":"partie prenante","objection":"objection probable","response":"reponse suggeree"}],"underestimatedRisks":["risque"],"worstCaseScenario":"scenario pire cas","recommendation":"recommandation finale 2-3 phrases"}
Pas de guillemets simples dans les valeurs. Pas de retours a la ligne dans les valeurs.`, user: ctx };
}

function buildDecisionRationalePrompt(decision, legalContext) {
  const ctx = buildDecisionPromptContext(decision, legalContext);
  return { system: `Tu es HRBP senior. Redige une justification formelle de decision RH. Ton sobre, rigoureux, factuel — pas de chatbot generique.
${LEGAL_GUARDRAIL}
Reponds UNIQUEMENT en JSON strict. Structure:
{"rationale":"justification formelle 4-6 phrases","keyFactors":["facteur decisif"],"alternativesConsidered":"resume des alternatives ecartees et pourquoi","legalBasis":"base legale si applicable","precedentNote":"note sur les precedents ou impacts futurs"}
Pas de guillemets simples dans les valeurs. Pas de retours a la ligne dans les valeurs.`, user: ctx };
}

function buildDecisionRetrospectivePrompt(decision, legalContext) {
  const ctx = buildDecisionPromptContext(decision, legalContext);
  const retro = `\nOUTCOME: ${decision.outcome||"Non documente"}\nACTIONS DE SUIVI: ${decision.followUpActions||"Aucune"}`;
  return { system: `Tu es HRBP senior. Analyse critique post-decision. Identifie ce qui a fonctionne, ce qui a ete manque, et les lecons pour l avenir.
${LEGAL_GUARDRAIL}
Reponds UNIQUEMENT en JSON strict. Structure:
{"whatWorkedWell":["element positif"],"whatWasMissed":["element manque"],"lessonsLearned":["lecon"],"wouldDoSameAgain":"oui/non et pourquoi en 2-3 phrases","improvementSuggestions":["suggestion"]}
Pas de guillemets simples dans les valeurs. Pas de retours a la ligne dans les valeurs.`, user: ctx + retro };
}

// ── Decision Log component ───────────────────────────────────────────────────

export default function ModuleDecisions({ data, onSave, onNavigate, focusDecisionId, onClearFocus }) {
  const [view, setView] = useState("list");
  const [form, setForm] = useState({ ...EMPTY_DECISION });
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterProvince, setFilterProvince] = useState("all");

  const [aiLoading, setAiLoading] = useState("");
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState("");

  // ── B-05.1 + B-05.2: sessionStorage bridges from Cases ─────────────────────
  useEffect(() => {
    // Bridge 1 (B-05.1): create new decision pre-filled from a case
    const pending = sessionStorage.getItem("hrbpos:pendingDecision");
    if (pending) {
      try {
        const ctx = JSON.parse(pending);
        sessionStorage.removeItem("hrbpos:pendingDecision");
        setForm(f => ({
          ...f,
          linkedCaseId:    ctx.linkedCaseId || "",
          title:           ctx.caseTitle ? `Décision — ${ctx.caseTitle}` : f.title,
          employeeName:    ctx.employee || f.employeeName,
          managerName:     ctx.director || f.managerName,
          background:      ctx.context  || f.background,
          province:        ctx.province || f.province,
          decisionType:    ctx.type === "investigation" ? "legal"
                         : ctx.type === "performance" || ctx.type === "pip" ? "performance"
                         : ctx.type === "conflict_ee" || ctx.type === "conflict_em" ? "discipline"
                         : f.decisionType,
        }));
        setEditId(null);
        setView("form");
        return; // only one bridge per mount
      } catch { /* bridge corrompu → ignorer */ }
    }
    // Bridge 2 (B-05.2): open existing decision from Cases timeline
    const open = sessionStorage.getItem("hrbpos:openDecision");
    if (open) {
      try {
        const payload = JSON.parse(open);
        sessionStorage.removeItem("hrbpos:openDecision");
        const all = (data.decisions || []).map(migrateDecision);
        const target = all.find(d => d.id === payload.decisionId);
        if (target) {
          setForm(migrateDecision(target));
          setEditId(target.id);
          setView("form");
        }
      } catch { /* bridge corrompu → ignorer */ }
    }
  }, []); // eslint-disable-line

  // ── Inter-module focus: auto-open a specific decision on mount ───────────────
  useEffect(() => {
    if (!focusDecisionId) return;
    const target = (data.decisions || []).map(migrateDecision).find(d => d.id === focusDecisionId);
    if (target) { setForm(target); setEditId(target.id); setView("form"); }
    if (onClearFocus) onClearFocus();
  }, [focusDecisionId]); // eslint-disable-line

  const decisions = (data.decisions || []).map(migrateDecision);
  const profile = data.profile || { defaultProvince:"QC" };
  const todayISO = new Date().toISOString().split("T")[0];

  const SF = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));
  const setRisk = (field) => (e) => setForm(f => ({ ...f, anticipatedRisks:{ ...f.anticipatedRisks, [field]:e.target.value } }));
  const setLegal = (field) => (e) => setForm(f => ({ ...f, legalNotes:{ ...f.legalNotes, [field]:e.target.value } }));

  const focusStyle = { onFocus:e=>e.target.style.borderColor=C.em+"60", onBlur:e=>e.target.style.borderColor=C.border };

  const save = () => {
    if (!form.title.trim()) return;
    const now = todayISO;
    const record = { ...form, id: editId || Date.now().toString(), updatedAt: now, createdAt: form.createdAt || now };
    const updated = editId ? decisions.map(d => d.id === editId ? record : d) : [...decisions, record];
    onSave("decisions", updated);
    setView("list"); setForm({ ...EMPTY_DECISION }); setEditId(null);
  };

  const deleteDecision = (id) => {
    if (!confirm("Supprimer cette décision ?")) return;
    onSave("decisions", decisions.filter(d => d.id !== id));
    setView("list"); setForm({ ...EMPTY_DECISION }); setEditId(null);
  };

  const duplicate = (d) => {
    const dup = { ...migrateDecision(d), id:Date.now().toString(), title:d.title+" (copie)", status:"draft", createdAt:todayISO, updatedAt:todayISO };
    onSave("decisions", [...decisions, dup]);
  };

  const openEdit = (d) => { setForm(migrateDecision(d)); setEditId(d.id); setView("form"); };
  const openNew = () => { setForm({ ...EMPTY_DECISION, province: profile.defaultProvince || "QC" }); setEditId(null); setView("form"); };

  const addOption = () => setForm(f => ({ ...f, options:[...f.options, { id:Date.now().toString(), title:"", description:"", pros:"", cons:"", risks:"" }] }));
  const removeOption = (id) => setForm(f => ({ ...f, options:f.options.filter(o=>o.id!==id) }));
  const setOpt = (id, field) => (e) => setForm(f => ({ ...f, options:f.options.map(o=>o.id===id?{...o,[field]:e.target.value}:o) }));

  const runAI = async (key, promptBuilder) => {
    setAiLoading(key); setAiError(""); setAiResult(null);
    try {
      const prov = form.province || profile.defaultProvince || "QC";
      const legalCtx = buildLegalPromptContext(prov);
      const { system, user } = promptBuilder(form, legalCtx);
      const parsed = await callAI(system, user);
      setAiResult({ key, data: parsed });
    } catch(e) { setAiError("Erreur IA: " + e.message); }
    finally { setAiLoading(""); }
  };

  const applyGeneratedOptions = (opts) => {
    const newOpts = (opts||[]).map(o => ({ id:Date.now().toString()+Math.random(), title:o.title||"", description:o.description||"", pros:o.pros?.join?o.pros.join(", "):o.pros||"", cons:o.cons?.join?o.cons.join(", "):o.cons||"", risks:o.risks||"" }));
    setForm(f => ({ ...f, options:[...f.options, ...newOpts] }));
    setAiResult(null);
  };

  const applyRationale = (r) => {
    setForm(f => ({ ...f, decisionRationale:r.rationale||"", decisionFactors:(r.keyFactors||[]).join("\n") }));
    setAiResult(null);
  };

  const applyRetrospective = (r) => {
    setForm(f => ({ ...f, whatWorked:(r.whatWorkedWell||[]).join("\n"), whatWasMissed:(r.whatWasMissed||[]).join("\n"), wouldDoSameAgain:r.wouldDoSameAgain||"", retrospective:(r.lessonsLearned||[]).join("\n") }));
    setAiResult(null);
  };

  const completeness = (d) => {
    const keys = ["title","facts","background","decisionRationale","outcome"];
    const filled = keys.filter(k => d[k] && d[k].trim()).length;
    return Math.round((filled / keys.length) * 100);
  };

  const isReviewDue = (d) => {
    if (!d.reviewDate) return false;
    const diff = Math.floor((new Date(d.reviewDate+"T00:00:00") - new Date(todayISO+"T00:00:00")) / 86400000);
    return diff <= 7;
  };

  // ── DETAIL / EDIT VIEW ─────────────────────────────────────────────────────
  if (view === "form") {
    const prov = form.province || "QC";

    return (
      <div style={{ maxWidth:860, margin:"0 auto" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16, flexWrap:"wrap" }}>
          <button onClick={()=>{ setView("list"); setForm({...EMPTY_DECISION}); setEditId(null); }} style={{ ...css.btn(C.textM,true), padding:"6px 12px", fontSize:11 }}>← Retour</button>
          <div style={{ flex:1, fontSize:16, fontWeight:700, color:C.text }}>{editId ? "Modifier la décision" : "Nouvelle décision"}</div>
          {editId && <button onClick={()=>deleteDecision(editId)} style={{ ...css.btn(C.red,true), padding:"6px 14px", fontSize:11 }}>🗑 Supprimer</button>}
        </div>

        {/* Section 1: Metadata */}
        <Card style={{ marginBottom:12 }}>
          <SecHead icon="📋" label="Métadonnées" color={C.blue}/>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:10 }}>
            <div><Mono color={C.textD} size={9}>Titre de la décision *</Mono>
              <input value={form.title} onChange={SF("title")} placeholder="Ex: Avis disciplinaire — retard chronique" style={{ ...css.input, marginTop:5 }} {...focusStyle}/></div>
            <div><Mono color={C.textD} size={9}>Date de décision</Mono>
              <input type="date" value={form.decisionDate} onChange={SF("decisionDate")} style={{ ...css.input, marginTop:5 }}/></div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginBottom:10 }}>
            <div><Mono color={C.textD} size={9}>Type</Mono>
              <select value={form.decisionType} onChange={SF("decisionType")} style={{ ...css.select, marginTop:5 }}>
                {DECISION_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
            <div><Mono color={C.textD} size={9}>Niveau de risque</Mono>
              <select value={form.riskLevel} onChange={SF("riskLevel")} style={{ ...css.select, marginTop:5 }}>
                {DECISION_RISK.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
            <div><Mono color={C.textD} size={9}>Province</Mono>
              <ProvinceSelect value={form.province} onChange={SF("province")} style={{ marginTop:5, width:"100%" }}/></div>
            <div><Mono color={C.textD} size={9}>Statut</Mono>
              <select value={form.status} onChange={SF("status")} style={{ ...css.select, marginTop:5 }}>
                {DECISION_STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12 }}>
            <div><Mono color={C.textD} size={9}>Gestionnaire</Mono>
              <input value={form.managerName} onChange={SF("managerName")} placeholder="Nom" style={{ ...css.input, marginTop:5 }} {...focusStyle}/></div>
            <div><Mono color={C.textD} size={9}>Employé (optionnel)</Mono>
              <input value={form.employeeName} onChange={SF("employeeName")} placeholder="Nom" style={{ ...css.input, marginTop:5 }} {...focusStyle}/></div>
            <div><Mono color={C.textD} size={9}>Dossier lié</Mono>
              {(data.cases||[]).length === 0
                ? <div style={{ ...css.input, marginTop:5, color:C.textD, fontSize:11, display:"flex", alignItems:"center" }}>Aucun cas disponible</div>
                : <select value={form.linkedCaseId} onChange={SF("linkedCaseId")} style={{ ...css.select, marginTop:5 }}>
                    <option value="">— Aucun —</option>
                    {(data.cases||[]).map(c => <option key={c.id} value={c.id}>{`[${String(c.id).slice(-5)}] ${c.title||"(sans titre)"}${c.director?" — "+c.director:""}`}</option>)}
                  </select>}
              {form.linkedCaseId && onNavigate && (data.cases||[]).some(c => c.id === form.linkedCaseId) && (
                <button onClick={()=>onNavigate("cases",{focusCaseId:form.linkedCaseId})} style={{ marginTop:5, background:"none", border:`1px solid ${C.blue}44`, borderRadius:5, padding:"3px 9px", fontSize:10, color:C.blue, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>↗ Ouvrir le dossier</button>
              )}
            </div>
            <div><Mono color={C.textD} size={9}>Enquête liée (ID)</Mono>
              <input value={form.linkedInvestigationId} onChange={SF("linkedInvestigationId")} placeholder="ID investigation" style={{ ...css.input, marginTop:5 }} {...focusStyle}/>
              {form.linkedInvestigationId && onNavigate && (data.investigations||[]).some(inv => inv.id === form.linkedInvestigationId) && (
                <button onClick={()=>onNavigate("investigation",{focusInvestigationId:form.linkedInvestigationId})} style={{ marginTop:5, background:"none", border:`1px solid ${C.purple}44`, borderRadius:5, padding:"3px 9px", fontSize:10, color:C.purple, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>↗ Ouvrir l'enquête</button>
              )}
            </div>
          </div>
        </Card>

        {/* Section 2: Context & Facts */}
        <Card style={{ marginBottom:12 }}>
          <SecHead icon="📝" label="Contexte et faits" color={C.purple}/>
          <Mono color={C.textD} size={9}>Faits établis</Mono>
          <textarea rows={3} value={form.facts} onChange={SF("facts")} placeholder="Faits objectifs, documentés, vérifiables..." style={{ ...css.textarea, marginTop:5 }} {...focusStyle}/>
          <div style={{ marginTop:10 }}><Mono color={C.textD} size={9}>Contexte / historique</Mono></div>
          <textarea rows={3} value={form.background} onChange={SF("background")} placeholder="Historique, contexte organisationnel, événements antérieurs..." style={{ ...css.textarea, marginTop:5 }} {...focusStyle}/>
          <div style={{ marginTop:10 }}><Mono color={C.textD} size={9}>Éléments clés considérés</Mono></div>
          <textarea rows={2} value={form.keyInputs} onChange={SF("keyInputs")} placeholder="Politiques, précédents, avis juridiques, données..." style={{ ...css.textarea, marginTop:5 }} {...focusStyle}/>
        </Card>

        {/* Section 3: Options considérées */}
        <Card style={{ marginBottom:12 }}>
          <SecHead icon="🔀" label="Options considérées" color={C.amber}/>
          {form.options.map((opt,i) => (
            <div key={opt.id} style={{ background:C.surf, border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 14px", marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <Mono color={C.amber} size={9}>Option {i+1}</Mono>
                <button onClick={()=>removeOption(opt.id)} style={{ background:"none", border:"none", color:C.red, cursor:"pointer", fontSize:14 }}>✕</button>
              </div>
              <input value={opt.title} onChange={setOpt(opt.id,"title")} placeholder="Titre de l'option" style={{ ...css.input, marginBottom:6 }} {...focusStyle}/>
              <textarea rows={2} value={opt.description} onChange={setOpt(opt.id,"description")} placeholder="Description détaillée" style={{ ...css.textarea, marginBottom:6 }} {...focusStyle}/>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                <div><Mono color={C.em} size={8}>Avantages</Mono><textarea rows={2} value={opt.pros} onChange={setOpt(opt.id,"pros")} style={{ ...css.textarea, marginTop:4, fontSize:12 }} {...focusStyle}/></div>
                <div><Mono color={C.red} size={8}>Inconvénients</Mono><textarea rows={2} value={opt.cons} onChange={setOpt(opt.id,"cons")} style={{ ...css.textarea, marginTop:4, fontSize:12 }} {...focusStyle}/></div>
                <div><Mono color={C.amber} size={8}>Risques</Mono><textarea rows={2} value={opt.risks} onChange={setOpt(opt.id,"risks")} style={{ ...css.textarea, marginTop:4, fontSize:12 }} {...focusStyle}/></div>
              </div>
            </div>
          ))}
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={addOption} style={{ ...css.btn(C.amber,true), padding:"7px 14px", fontSize:11 }}>+ Ajouter une option</button>
            <button onClick={()=>runAI("options",buildGenerateOptionsPrompt)} disabled={!!aiLoading} style={{ ...css.btn(C.purple,true), padding:"7px 14px", fontSize:11, opacity:aiLoading?.5:1 }}>
              {aiLoading==="options"?"⏳ Génération...":"🤖 Générer 3 options avec l'IA"}</button>
          </div>
          {aiResult?.key==="options" && (
            <div style={{ background:C.surf, border:`1px solid ${C.purple}44`, borderRadius:8, padding:12, marginTop:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                <Mono color={C.purple} size={9}>Options générées par l'IA</Mono>
                <button onClick={()=>applyGeneratedOptions(aiResult.data.options)} style={{ ...css.btn(C.em), padding:"5px 12px", fontSize:11 }}>✓ Appliquer</button>
              </div>
              {(aiResult.data.options||[]).map((o,i)=><div key={i} style={{ marginBottom:8 }}><div style={{ fontSize:13, fontWeight:600, color:C.text }}>{o.title}</div><div style={{ fontSize:12, color:C.textM, marginTop:2 }}>{o.description}</div></div>)}
            </div>
          )}
        </Card>

        {/* Section 4: Décision retenue */}
        <Card style={{ marginBottom:12 }}>
          <SecHead icon="✅" label="Décision retenue" color={C.em}/>
          <Mono color={C.textD} size={9}>Option sélectionnée</Mono>
          {form.options.length > 0 ? (
            <select value={form.selectedOption} onChange={SF("selectedOption")} style={{ ...css.select, marginTop:5 }}>
              <option value="">— Sélectionner —</option>
              {form.options.map(o=><option key={o.id} value={o.title}>{o.title||"(sans titre)"}</option>)}
            </select>
          ) : (
            <input value={form.selectedOption} onChange={SF("selectedOption")} placeholder="Décision retenue" style={{ ...css.input, marginTop:5 }} {...focusStyle}/>
          )}
          <div style={{ marginTop:10 }}><Mono color={C.textD} size={9}>Justification</Mono></div>
          <textarea rows={3} value={form.decisionRationale} onChange={SF("decisionRationale")} placeholder="Pourquoi cette option a été retenue..." style={{ ...css.textarea, marginTop:5 }} {...focusStyle}/>
          <div style={{ marginTop:10 }}><Mono color={C.textD} size={9}>Facteurs décisifs</Mono></div>
          <textarea rows={2} value={form.decisionFactors} onChange={SF("decisionFactors")} placeholder="Un facteur par ligne..." style={{ ...css.textarea, marginTop:5 }} {...focusStyle}/>
          <div style={{ display:"flex", gap:8, marginTop:10 }}>
            <button onClick={()=>runAI("challenge",buildChallengeDecisionPrompt)} disabled={!!aiLoading} style={{ ...css.btn(C.red,true), padding:"7px 14px", fontSize:11, opacity:aiLoading?.5:1 }}>
              {aiLoading==="challenge"?"⏳ Analyse...":"🔴 Challenger cette décision"}</button>
            <button onClick={()=>runAI("rationale",buildDecisionRationalePrompt)} disabled={!!aiLoading} style={{ ...css.btn(C.blue,true), padding:"7px 14px", fontSize:11, opacity:aiLoading?.5:1 }}>
              {aiLoading==="rationale"?"⏳ Rédaction...":"📝 Rédiger la justification"}</button>
          </div>
          {aiResult?.key==="challenge" && (
            <div style={{ background:C.red+"08", border:`1px solid ${C.red}33`, borderRadius:8, padding:14, marginTop:10 }}>
              <Mono color={C.red} size={9}>Challenge IA</Mono>
              {aiResult.data.blindSpots?.length>0 && <div style={{ marginTop:8 }}><Mono color={C.amber} size={8}>Angles morts</Mono>{aiResult.data.blindSpots.map((b,i)=><div key={i} style={{ fontSize:12, color:C.text, marginTop:4 }}>• {b}</div>)}</div>}
              {aiResult.data.objections?.length>0 && <div style={{ marginTop:8 }}><Mono color={C.purple} size={8}>Objections probables</Mono>{aiResult.data.objections.map((o,i)=><div key={i} style={{ marginTop:6 }}><div style={{ fontSize:12, color:C.amber, fontWeight:600 }}>{o.from}: {o.objection}</div><div style={{ fontSize:12, color:C.em, marginTop:2 }}>→ {o.response}</div></div>)}</div>}
              {aiResult.data.worstCaseScenario && <div style={{ marginTop:8 }}><Mono color={C.red} size={8}>Pire scénario</Mono><div style={{ fontSize:12, color:C.text, marginTop:4 }}>{aiResult.data.worstCaseScenario}</div></div>}
              {aiResult.data.recommendation && <div style={{ marginTop:8, fontSize:12, color:C.em, fontStyle:"italic" }}>{aiResult.data.recommendation}</div>}
              <button onClick={()=>setAiResult(null)} style={{ ...css.btn(C.textM,true), padding:"4px 10px", fontSize:10, marginTop:8 }}>Fermer</button>
            </div>
          )}
          {aiResult?.key==="rationale" && (
            <div style={{ background:C.blue+"08", border:`1px solid ${C.blue}33`, borderRadius:8, padding:14, marginTop:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <Mono color={C.blue} size={9}>Justification IA</Mono>
                <button onClick={()=>applyRationale(aiResult.data)} style={{ ...css.btn(C.em), padding:"5px 12px", fontSize:11 }}>✓ Appliquer</button>
              </div>
              <div style={{ fontSize:12, color:C.text, lineHeight:1.7 }}>{aiResult.data.rationale}</div>
              {aiResult.data.legalBasis && <div style={{ marginTop:6, fontSize:11, color:C.blue }}>📋 {aiResult.data.legalBasis}</div>}
              {aiResult.data.precedentNote && <div style={{ marginTop:4, fontSize:11, color:C.amber }}>⚠ {aiResult.data.precedentNote}</div>}
            </div>
          )}
        </Card>

        {/* Section 5: Risques anticipés */}
        <Card style={{ marginBottom:12 }}>
          <SecHead icon="⚠️" label="Risques anticipés" color={C.red}/>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {[["legalRisk","Risque légal"],["employeeRelationsRisk","Relations employés"],["managerCapabilityRisk","Capacité gestionnaire"],["organizationalRisk","Risque organisationnel"],["precedentRisk","Risque de précédent"]].map(([k,label])=>(
              <div key={k}><Mono color={C.textD} size={8}>{label}</Mono>
                <textarea rows={2} value={form.anticipatedRisks[k]||""} onChange={setRisk(k)} placeholder={label+"..."} style={{ ...css.textarea, marginTop:4, fontSize:12 }} {...focusStyle}/></div>
            ))}
            <div style={{ gridColumn:"1 / -1" }}><Mono color={C.em} size={8}>Plan de mitigation</Mono>
              <textarea rows={2} value={form.anticipatedRisks.mitigationPlan||""} onChange={setRisk("mitigationPlan")} placeholder="Mesures de mitigation prévues..." style={{ ...css.textarea, marginTop:4, fontSize:12 }} {...focusStyle}/></div>
          </div>
        </Card>

        {/* Section 6: Legal Notes */}
        <Card style={{ marginBottom:12 }}>
          <SecHead icon="⚖️" label={`Notes légales — ${prov}`} color={C.blue}/>
          <div style={{ fontSize:11, color:C.textM, marginBottom:10, padding:"6px 10px", background:C.surf, borderRadius:6 }}>
            {getLegalContext(prov)}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <div><Mono color={C.textD} size={8}>Notes légales</Mono>
              <textarea rows={2} value={form.legalNotes.legalNotes||""} onChange={setLegal("legalNotes")} placeholder="Points légaux pertinents..." style={{ ...css.textarea, marginTop:4, fontSize:12 }} {...focusStyle}/></div>
            <div><Mono color={C.textD} size={8}>Cadre applicable</Mono>
              <textarea rows={2} value={form.legalNotes.applicableFramework||""} onChange={setLegal("applicableFramework")} placeholder="Lois, normes, politiques..." style={{ ...css.textarea, marginTop:4, fontSize:12 }} {...focusStyle}/></div>
            <div><Mono color={C.textD} size={8}>Sources consultées</Mono>
              <textarea rows={2} value={form.legalNotes.consultedSources||""} onChange={setLegal("consultedSources")} placeholder="Juriste, CNESST, politique interne..." style={{ ...css.textarea, marginTop:4, fontSize:12 }} {...focusStyle}/></div>
            <div><Mono color={C.textD} size={8}>Précautions légales</Mono>
              <textarea rows={2} value={form.legalNotes.legalCautions||""} onChange={setLegal("legalCautions")} placeholder="Points d'attention, risques juridiques..." style={{ ...css.textarea, marginTop:4, fontSize:12 }} {...focusStyle}/></div>
          </div>
        </Card>

        {/* Section 7: Outcome & Follow-up */}
        <Card style={{ marginBottom:12 }}>
          <SecHead icon="📊" label="Résultat et suivi" color={C.teal}/>
          <Mono color={C.textD} size={9}>Résultat observé</Mono>
          <textarea rows={2} value={form.outcome} onChange={SF("outcome")} placeholder="Résultat concret après la décision..." style={{ ...css.textarea, marginTop:5 }} {...focusStyle}/>
          <div style={{ marginTop:10 }}><Mono color={C.textD} size={9}>Actions de suivi</Mono></div>
          <textarea rows={2} value={form.followUpActions} onChange={SF("followUpActions")} placeholder="Prochaines étapes, échéances..." style={{ ...css.textarea, marginTop:5 }} {...focusStyle}/>
          <div style={{ marginTop:10 }}><Mono color={C.textD} size={9}>Date de révision</Mono></div>
          <input type="date" value={form.reviewDate} onChange={SF("reviewDate")} style={{ ...css.input, marginTop:5, maxWidth:200 }}/>
        </Card>

        {/* Section 8: Rétrospective */}
        <Card style={{ marginBottom:12 }}>
          <SecHead icon="🔄" label="Rétrospective" color={C.purple}/>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <div><Mono color={C.em} size={8}>Ce qui a fonctionné</Mono>
              <textarea rows={2} value={form.whatWorked} onChange={SF("whatWorked")} placeholder="Points positifs..." style={{ ...css.textarea, marginTop:4, fontSize:12 }} {...focusStyle}/></div>
            <div><Mono color={C.red} size={8}>Ce qui a été manqué</Mono>
              <textarea rows={2} value={form.whatWasMissed} onChange={SF("whatWasMissed")} placeholder="Angles morts, erreurs..." style={{ ...css.textarea, marginTop:4, fontSize:12 }} {...focusStyle}/></div>
          </div>
          <div style={{ marginTop:10 }}><Mono color={C.textD} size={9}>Referais-tu la même chose ?</Mono></div>
          <textarea rows={2} value={form.wouldDoSameAgain} onChange={SF("wouldDoSameAgain")} placeholder="Oui/Non et pourquoi..." style={{ ...css.textarea, marginTop:5 }} {...focusStyle}/>
          <div style={{ marginTop:10 }}><Mono color={C.textD} size={9}>Leçons et notes rétrospectives</Mono></div>
          <textarea rows={2} value={form.retrospective} onChange={SF("retrospective")} placeholder="Leçons apprises pour les prochaines décisions..." style={{ ...css.textarea, marginTop:5 }} {...focusStyle}/>
          <button onClick={()=>runAI("retro",buildDecisionRetrospectivePrompt)} disabled={!!aiLoading} style={{ ...css.btn(C.purple,true), padding:"7px 14px", fontSize:11, marginTop:10, opacity:aiLoading?.5:1 }}>
            {aiLoading==="retro"?"⏳ Analyse...":"🔄 Analyser le résultat avec l'IA"}</button>
          {aiResult?.key==="retro" && (
            <div style={{ background:C.purple+"08", border:`1px solid ${C.purple}33`, borderRadius:8, padding:14, marginTop:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <Mono color={C.purple} size={9}>Rétrospective IA</Mono>
                <button onClick={()=>applyRetrospective(aiResult.data)} style={{ ...css.btn(C.em), padding:"5px 12px", fontSize:11 }}>✓ Appliquer</button>
              </div>
              {aiResult.data.whatWorkedWell?.length>0 && <div style={{ marginBottom:6 }}><Mono color={C.em} size={8}>Positif</Mono>{aiResult.data.whatWorkedWell.map((w,i)=><div key={i} style={{ fontSize:12, color:C.text, marginTop:2 }}>✓ {w}</div>)}</div>}
              {aiResult.data.whatWasMissed?.length>0 && <div style={{ marginBottom:6 }}><Mono color={C.red} size={8}>Manqué</Mono>{aiResult.data.whatWasMissed.map((w,i)=><div key={i} style={{ fontSize:12, color:C.text, marginTop:2 }}>✗ {w}</div>)}</div>}
              {aiResult.data.wouldDoSameAgain && <div style={{ fontSize:12, color:C.amber, fontStyle:"italic" }}>{aiResult.data.wouldDoSameAgain}</div>}
            </div>
          )}
        </Card>

        {aiError && <div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7, padding:"8px 12px", marginBottom:12, fontSize:12, color:C.red }}>⚠ {aiError}</div>}

        <div style={{ position:"sticky", bottom:0, background:C.bg, borderTop:`1px solid ${C.border}`, padding:"12px 0", display:"flex", gap:10, zIndex:10 }}>
          <button onClick={save} disabled={!form.title.trim()} style={{ ...css.btn(C.em), flex:1, opacity:form.title.trim()?1:.4 }}>
            💾 {editId ? "Enregistrer" : "Créer la décision"}</button>
          <button onClick={()=>{ setView("list"); setForm({...EMPTY_DECISION}); setEditId(null); }} style={{ ...css.btn(C.textM,true) }}>Annuler</button>
        </div>
      </div>
    );
  }

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  const filtered = decisions.filter(d => {
    if (filterStatus !== "all" && d.status !== filterStatus) return false;
    if (filterType !== "all" && d.decisionType !== filterType) return false;
    if (filterProvince !== "all" && d.province !== filterProvince) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(d.title||"").toLowerCase().includes(q) && !(d.managerName||"").toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a,b) => (b.updatedAt||b.createdAt||"").localeCompare(a.updatedAt||a.createdAt||""));

  return (
    <div style={{ maxWidth:900, margin:"0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>Decision Log RH</div>
          <div style={{ fontSize:12, color:C.textM }}>{decisions.length} décision(s) documentée(s)</div>
        </div>
        <button onClick={openNew} style={css.btn(C.em)}>+ Nouvelle décision</button>
      </div>

      <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Rechercher..." style={{ ...css.input, maxWidth:220, fontSize:12 }} {...focusStyle}/>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ ...css.select, maxWidth:140, fontSize:12 }}>
          <option value="all">Tous statuts</option>
          {DECISION_STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={filterType} onChange={e=>setFilterType(e.target.value)} style={{ ...css.select, maxWidth:150, fontSize:12 }}>
          <option value="all">Tous types</option>
          {DECISION_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={filterProvince} onChange={e=>setFilterProvince(e.target.value)} style={{ ...css.select, maxWidth:100, fontSize:12 }}>
          <option value="all">Prov.</option>
          {PROVINCES.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {filtered.length === 0 && <div style={{ textAlign:"center", padding:40, color:C.textD, fontSize:13 }}>
        {decisions.length === 0 ? "Aucune décision documentée. Clique sur \"+ Nouvelle décision\" pour commencer." : "Aucun résultat pour ces filtres."}
      </div>}

      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
        {filtered.map(d => {
          const riskDef = DECISION_RISK.find(r=>r.value===d.riskLevel) || DECISION_RISK[1];
          const statusDef = DECISION_STATUSES.find(s=>s.value===d.status) || DECISION_STATUSES[0];
          const typeDef = DECISION_TYPES.find(t=>t.value===d.decisionType) || DECISION_TYPES[5];
          const comp = completeness(d);
          const reviewDue = isReviewDue(d);
          const linkedCase = d.linkedCaseId ? (data.cases||[]).find(c => c.id === d.linkedCaseId) : null;
          const linkedInv = d.linkedInvestigationId ? (data.investigations||[]).find(inv => inv.id === d.linkedInvestigationId) : null;

          return (
            <div key={d.id} style={{ background:C.surfL, border:`1px solid ${riskDef.color}28`, borderLeft:`3px solid ${riskDef.color}`, borderRadius:8, padding:"12px 14px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, flexWrap:"wrap" }}>
                <button onClick={()=>openEdit(d)} style={{ flex:1, background:"none", border:"none", cursor:"pointer", textAlign:"left", padding:0, fontFamily:"'DM Sans',sans-serif" }}>
                  <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{d.title||"(sans titre)"}</span>
                </button>
                <Badge label={riskDef.label} color={riskDef.color}/>
                <Badge label={typeDef.label} color={C.blue} size={9}/>
                <Badge label={statusDef.label} color={statusDef.color} size={9}/>
                {d.province && <ProvinceBadge province={d.province}/>}
                {reviewDue && <Badge label="Review due" color={C.red} size={9}/>}
                {linkedCase && onNavigate && (
                  <button onClick={(e)=>{e.stopPropagation();onNavigate("cases",{focusCaseId:linkedCase.id});}} title={linkedCase.title||"Dossier lié"} style={{ background:"none", border:`1px solid ${C.blue}44`, borderRadius:4, padding:"1px 7px", fontSize:9, color:C.blue, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>↗ Case</button>
                )}
                {linkedInv && onNavigate && (
                  <button onClick={(e)=>{e.stopPropagation();onNavigate("investigation",{focusInvestigationId:linkedInv.id});}} title={linkedInv.title||"Enquête liée"} style={{ background:"none", border:`1px solid ${C.purple}44`, borderRadius:4, padding:"1px 7px", fontSize:9, color:C.purple, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>↗ Enquête</button>
                )}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:12, fontSize:11, color:C.textM }}>
                {d.managerName && <span>{d.managerName}</span>}
                {d.decisionDate && <span>{fmtDate(d.decisionDate)}</span>}
                <span style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:4 }}>
                  <div style={{ width:40, height:4, background:C.border, borderRadius:2, overflow:"hidden" }}>
                    <div style={{ width:`${comp}%`, height:"100%", background:comp>=80?C.em:comp>=50?C.amber:C.textD, borderRadius:2 }}/>
                  </div>
                  <span style={{ fontSize:10 }}>{comp}%</span>
                </span>
                <button onClick={(e)=>{e.stopPropagation();duplicate(d);}} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:5, padding:"2px 8px", fontSize:10, color:C.textM, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>⧉ Dupliquer</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
