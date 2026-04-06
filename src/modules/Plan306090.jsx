// Source: HRBP_OS.jsx L.6751-7311
import { useState } from "react";
import { C, css } from '../theme.js';
import { callAIJson } from '../api/index.js';
import { fmtDate } from '../utils/format.js';
import { PLAN_306090_SP } from '../prompts/plan306090.js';
import Badge from '../components/Badge.jsx';
import Card from '../components/Card.jsx';
import Mono from '../components/Mono.jsx';
import AILoader from '../components/AILoader.jsx';
import ProvinceSelect from '../components/ProvinceSelect.jsx';
import ProvinceBadge from '../components/ProvinceBadge.jsx';

// Inline data constants (Source: L.6817-6831)
const PLAN_TYPES = [
  { id:"new_hire",           label:"🆕 Nouvel employé" },
  { id:"promotion",          label:"⬆ Promotion" },
  { id:"internal_move",      label:"🔄 Mobilité interne" },
  { id:"first_time_manager", label:"👤 Gestionnaire première fois" },
  { id:"critical_role",      label:"⚡ Transition rôle critique" },
];

const RISK_C_306 = (r) => ({"Critique":C.red,"Eleve":C.amber,"Élevé":C.amber,"Modere":C.blue,"Modéré":C.blue,"Faible":C.em}[r]||C.blue);

const PHASE_META = [
  { key:"days30", label:"30 jours", theme:"Apprendre + Observer", color:"#06b6d4", icon:"🔍" },
  { key:"days60", label:"60 jours", theme:"Contribuer + Connecter", color:"#8b5cf6", icon:"🤝" },
  { key:"days90", label:"90 jours", theme:"Diriger + Livrer", color:"#10b981", icon:"🚀" },
];

// PhaseTab at module scope — prevents remount on every render of Module306090.
// Receives `result` as a prop instead of reading it from closure.
function PhaseTab({ phaseKey, result }) {
  const meta = PHASE_META.find(p => p.key === phaseKey);
  const ph = result?.[phaseKey];
  if (!ph) return null;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* Phase header */}
      <div style={{padding:"12px 16px",background:meta.color+"15",
        border:`1px solid ${meta.color}30`,borderRadius:9,
        borderLeft:`4px solid ${meta.color}`}}>
        <div style={{fontSize:11,color:meta.color,fontFamily:"'DM Mono',monospace",
          letterSpacing:1,marginBottom:4}}>{meta.label.toUpperCase()}</div>
        <div style={{fontSize:15,fontWeight:700,color:C.text}}>{ph.theme||meta.theme}</div>
      </div>

      {/* Goals */}
      {(ph.goals||[]).map((g,i)=>(
        <Card key={i} style={{borderLeft:`3px solid ${meta.color}`}}>
          <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:10}}>
            <span style={{color:meta.color,marginRight:8,fontFamily:"'DM Mono',monospace",
              fontSize:10}}>G{i+1}</span>{g.goal}
          </div>
          {(g.actions||[]).length>0&&(
            <div style={{marginBottom:10}}>
              <Mono color={C.textD} size={8}>ACTIONS</Mono>
              <div style={{marginTop:6,display:"flex",flexDirection:"column",gap:4}}>
                {g.actions.map((a,j)=>(
                  <div key={j} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                    <span style={{color:meta.color,flexShrink:0,fontSize:10,marginTop:2}}>→</span>
                    <span style={{fontSize:12,color:C.textM,lineHeight:1.6}}>{a}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{padding:"6px 10px",background:meta.color+"10",
            border:`1px solid ${meta.color}25`,borderRadius:6}}>
            <span style={{fontSize:10,color:meta.color,fontWeight:700}}>✓ Succès: </span>
            <span style={{fontSize:12,color:C.text}}>{g.success}</span>
          </div>
        </Card>
      ))}

      {/* Watchouts + Manager questions */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {(ph.watchouts||[]).length>0&&(
          <Card style={{borderLeft:`3px solid ${C.amber}`}}>
            <Mono color={C.amber} size={9}>SIGNAUX D'ALERTE HRBP</Mono>
            <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:5}}>
              {ph.watchouts.map((w,i)=>(
                <div key={i} style={{display:"flex",gap:7,alignItems:"flex-start"}}>
                  <span style={{color:C.amber,flexShrink:0,fontSize:11}}>⚠</span>
                  <span style={{fontSize:12,color:C.textM,lineHeight:1.55}}>{w}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
        {(ph.managerQuestions||[]).length>0&&(
          <Card style={{borderLeft:`3px solid ${C.purple}`}}>
            <Mono color={C.purple} size={9}>QUESTIONS GESTIONNAIRE</Mono>
            <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:5}}>
              {ph.managerQuestions.map((q,i)=>(
                <div key={i} style={{display:"flex",gap:7,alignItems:"flex-start"}}>
                  <span style={{color:C.purple,flexShrink:0,fontSize:11}}>Q</span>
                  <span style={{fontSize:12,color:C.textM,lineHeight:1.55,fontStyle:"italic"}}>"{q}"</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function Module306090({ data, onSave }) {
  const plans = data.plans306090 || [];
  const [view, setView]         = useState("list");   // list | form | result
  const [tab, setTab]           = useState("summary");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [result, setResult]     = useState(null);
  const [saved, setSaved]       = useState(false);
  const [copied, setCopied]     = useState(false);
  const [activePlan, setActivePlan] = useState(null);
  const [generatedPrompt, setGeneratedPrompt] = useState("");

  const [form, setForm] = useState({
    employeeName:"", role:"", team:"", manager:"",
    province:"", startDate:"", planType:"new_hire", context:""
  });

  const FF = (k,v) => setForm(f=>({...f,[k]:v}));

  const generate = async () => {
    if (!form.employeeName.trim() || !form.role.trim()) return;
    const prov = form.province || data.profile?.defaultProvince || "QC";
    const typeLabel = PLAN_TYPES.find(t=>t.id===form.planType)?.label || form.planType;
    const up = `TYPE DE TRANSITION: ${typeLabel}
EMPLOYE: ${form.employeeName}
ROLE: ${form.role}
EQUIPE: ${form.team||"Non specifie"}
GESTIONNAIRE: ${form.manager||"Non specifie"}
PROVINCE: ${prov}
DATE DE DEBUT: ${form.startDate||"Non specifiee"}
CONTEXTE: ${form.context||"Aucun contexte additionnel"}`;
    setLoading(true); setError(""); setResult(null); setSaved(false);
    try {
      const parsed = await callAIJson(PLAN_306090_SP, up, 3500);
      setResult(parsed); setTab("summary"); setView("result");
    } catch(e) { setError("Erreur: "+e.message); }
    finally { setLoading(false); }
  };

  const importPlanResponse = (parsed) => {
    setResult(parsed);
    setTab("summary");
    setView("result");
  };

  const savePlan = () => {
    if (!result || saved) return;
    const entry = {
      id: Date.now().toString(),
      savedAt: new Date().toISOString().split("T")[0],
      ...form,
      province: form.province || data.profile?.defaultProvince || "QC",
      output: result,
    };
    onSave("plans306090", [...plans, entry]);
    setSaved(true);
  };

  const copyPlan = () => {
    if (!result) return;
    const r = result;
    const phaseTxt = PHASE_META.map(p => {
      const ph = r[p.key];
      if (!ph) return "";
      const goalsTxt = (ph.goals||[]).map(g =>
        `  • ${g.goal}\n${(g.actions||[]).map(a=>`    - ${a}`).join("\n")}\n    → Succès: ${g.success}`
      ).join("\n");
      return `${p.label} — ${p.theme}\n${goalsTxt}`;
    }).join("\n\n");

    const checkTxt = (r.checkpoints||[]).map(c =>
      `Checkpoint ${c.timing} — ${c.focus}\n${(c.questions||[]).map(q=>`  • ${q}`).join("\n")}`
    ).join("\n\n");

    const txt = `Plan 30-60-90 — ${form.employeeName}
Rôle: ${form.role}${form.team?` | ${form.team}`:""}
Gestionnaire: ${form.manager||"N/A"}
Début: ${form.startDate||"N/A"}
Type: ${PLAN_TYPES.find(t=>t.id===form.planType)?.label||form.planType}

${r.summary?.headline||""}

${phaseTxt}

Checkpoints HRBP
${checkTxt}`;

    const ta = document.createElement("textarea");
    ta.value = txt; ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta);
    setCopied(true); setTimeout(()=>setCopied(false),2000);
  };

  const openArchived = (plan) => {
    setForm({
      employeeName:plan.employeeName, role:plan.role, team:plan.team||"",
      manager:plan.manager||"", province:plan.province||"QC",
      startDate:plan.startDate||"", planType:plan.planType||"new_hire",
      context:plan.context||""
    });
    setResult(plan.output);
    setActivePlan(plan);
    setSaved(true);
    setTab("summary");
    setView("result");
  };

  // ── TABS for result ──────────────────────────────────────────────────────
  const TABS = [
    {id:"summary",    label:"📋 Résumé"},
    {id:"days30",     label:"🔍 30 jours"},
    {id:"days60",     label:"🤝 60 jours"},
    {id:"days90",     label:"🚀 90 jours"},
    {id:"checkpoints",label:"✅ Checkpoints"},
    {id:"copy",       label:"📄 Copier"},
  ];

  // ── LIST VIEW ───────────────────────────────────────────────────────────
  if (view==="list") return (
    <div style={{maxWidth:860,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div>
          <div style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:4}}>Plans 30-60-90</div>
          <div style={{fontSize:12,color:C.textM}}>Transitions de rôle · {plans.length} plan{plans.length!==1?"s":""} archivé{plans.length!==1?"s":""}</div>
        </div>
        <button onClick={()=>{setForm({employeeName:"",role:"",team:"",manager:"",province:data.profile?.defaultProvince||"QC",startDate:"",planType:"new_hire",context:""});setResult(null);setSaved(false);setError("");setView("form");}}
          style={{...css.btn(C.em),padding:"9px 20px",fontSize:13}}>
          + Nouveau plan
        </button>
      </div>

      {plans.length===0?(
        <div style={{textAlign:"center",padding:"60px 20px"}}>
          <div style={{fontSize:40,marginBottom:14}}>📅</div>
          <div style={{fontSize:14,color:C.textM,marginBottom:6}}>Aucun plan archivé</div>
          <div style={{fontSize:12,color:C.textD,maxWidth:380,margin:"0 auto 20px",lineHeight:1.7}}>
            Crée un plan 30-60-90 pour accompagner une transition — embauche, promotion, mobilité ou premier rôle de gestionnaire.
          </div>
          <button onClick={()=>setView("form")} style={{...css.btn(C.em),padding:"10px 24px"}}>+ Nouveau plan</button>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {[...plans].reverse().map((plan,i)=>{
            const rc = RISK_C_306(plan.output?.summary?.transitionRisk);
            const typeLabel = PLAN_TYPES.find(t=>t.id===plan.planType)?.label||plan.planType;
            return (
              <button key={plan.id||i} onClick={()=>openArchived(plan)}
                style={{background:C.surfL,border:`1px solid ${rc}28`,
                  borderLeft:`3px solid ${rc}`,borderRadius:8,
                  padding:"12px 14px",cursor:"pointer",textAlign:"left",
                  fontFamily:"'DM Sans',sans-serif"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.text}}>{plan.employeeName}</div>
                  <div style={{display:"flex",gap:6}}>
                    <div style={{background:rc+"20",border:`1px solid ${rc}40`,
                      borderRadius:5,padding:"2px 7px",fontSize:9,fontWeight:700,color:rc}}>
                      {plan.output?.summary?.transitionRisk||"—"}
                    </div>
                    <ProvinceBadge province={plan.province}/>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{fontSize:11,color:C.textM}}>{plan.role}</span>
                  {plan.team&&<span style={{fontSize:11,color:C.textD}}>· {plan.team}</span>}
                  <Badge label={typeLabel} color={C.blue} size={9}/>
                  <Mono color={C.textD} size={8} style={{marginLeft:"auto"}}>{fmtDate(plan.savedAt)}</Mono>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── FORM VIEW ───────────────────────────────────────────────────────────
  if (view==="form") return (
    <div style={{maxWidth:720,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={()=>setView("list")} style={{...css.btn(C.textM,true),padding:"6px 12px",fontSize:11}}>← Retour</button>
        <div style={{fontSize:16,fontWeight:700,color:C.text}}>Nouveau plan 30-60-90</div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        {[["Nom de l'employé *","employeeName","Ex: Marie Tremblay"],
          ["Rôle / Titre *","role","Ex: Team Lead – Développement"],
          ["Équipe / Fonction","team","Ex: IT Infrastructure"],
          ["Gestionnaire","manager","Ex: Jean Dupont"],
        ].map(([label,key,ph])=>(
          <div key={key}>
            <Mono color={C.textD} size={9}>{label}</Mono>
            <input value={form[key]} onChange={e=>FF(key,e.target.value)}
              placeholder={ph} style={{...css.input,marginTop:5}}
              onFocus={e=>e.target.style.borderColor=C.em+"60"}
              onBlur={e=>e.target.style.borderColor=C.border}/>
          </div>
        ))}
        <div>
          <Mono color={C.textD} size={9}>Date de début</Mono>
          <input type="date" value={form.startDate} onChange={e=>FF("startDate",e.target.value)}
            style={{...css.input,marginTop:5}}/>
        </div>
        <div>
          <Mono color={C.textD} size={9}>Province</Mono>
          <ProvinceSelect value={form.province||data.profile?.defaultProvince||"QC"}
            onChange={e=>FF("province",e.target.value)}
            style={{marginTop:5,width:"100%"}}/>
        </div>
      </div>

      <div style={{marginBottom:12}}>
        <Mono color={C.textD} size={9}>Type de transition</Mono>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>
          {PLAN_TYPES.map(t=>(
            <button key={t.id} onClick={()=>FF("planType",t.id)}
              style={{padding:"6px 12px",borderRadius:6,fontSize:12,cursor:"pointer",
                fontFamily:"'DM Sans',sans-serif",border:"none",
                background:form.planType===t.id?C.em+"22":C.surfL,
                color:form.planType===t.id?C.em:C.textM,
                fontWeight:form.planType===t.id?700:400,
                outline:form.planType===t.id?`1px solid ${C.em}55`:"none"}}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{marginBottom:16}}>
        <Mono color={C.textD} size={9}>Contexte / Notes</Mono>
        <textarea rows={4} value={form.context} onChange={e=>FF("context",e.target.value)}
          placeholder="Ex: Employé senior promu au rôle de gestionnaire d'équipe. Forte crédibilité technique mais peu d'expérience en gestion de personnes. Équipe sous pression de livraison."
          style={{...css.textarea,marginTop:5,fontSize:13}}
          onFocus={e=>e.target.style.borderColor=C.em+"60"}
          onBlur={e=>e.target.style.borderColor=C.border}/>
      </div>

      {error&&<div style={{background:C.red+"15",border:`1px solid ${C.red}33`,borderRadius:7,
        padding:"9px 14px",marginBottom:12,fontSize:12,color:C.red}}>⚠ {error}</div>}

      {loading?<AILoader label="Génération du plan 30-60-90…"/>:(
        <button onClick={generate}
          disabled={!form.employeeName.trim()||!form.role.trim()}
          style={{...css.btn(C.em),width:"100%",padding:"13px",fontSize:14,
            opacity:form.employeeName.trim()&&form.role.trim()?1:.4,
            boxShadow:form.employeeName.trim()?`0 4px 20px ${C.em}30`:"none"}}>
          📅 Générer le plan 30-60-90
        </button>
      )}
    </div>
  );

  // ── RESULT VIEW ─────────────────────────────────────────────────────────
  return (
    <div style={{maxWidth:860,margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
        <button onClick={()=>setView("list")} style={{...css.btn(C.textM,true),padding:"6px 12px",fontSize:11}}>← Retour</button>
        <div style={{flex:1}}>
          <div style={{fontSize:15,fontWeight:700,color:C.text}}>{form.employeeName}</div>
          <div style={{fontSize:11,color:C.textM}}>{form.role}{form.team?` · ${form.team}`:""}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={copyPlan}
            style={{...css.btn(copied?C.em:C.textM,true),padding:"7px 14px",fontSize:12}}>
            {copied?"✓ Copié":"📋 Copier"}
          </button>
          <button onClick={savePlan} disabled={saved}
            style={{...css.btn(saved?C.textD:C.em),padding:"7px 16px",fontSize:12,opacity:saved?.5:1}}>
            {saved?"✓ Archivé":"💾 Archiver"}
          </button>
        </div>
      </div>

      {/* 3-phase strip */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
        {PHASE_META.map(p=>(
          <div key={p.key} style={{padding:"10px 14px",background:p.color+"12",
            border:`1px solid ${p.color}25`,borderRadius:8,textAlign:"center",cursor:"pointer"}}
            onClick={()=>setTab(p.key)}>
            <div style={{fontSize:18,marginBottom:4}}>{p.icon}</div>
            <div style={{fontSize:11,fontWeight:700,color:p.color}}>{p.label}</div>
            <div style={{fontSize:10,color:C.textD,marginTop:2}}>{p.theme}</div>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{display:"flex",gap:2,borderBottom:`1px solid ${C.border}`,marginBottom:14,overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{background:"none",border:"none",cursor:"pointer",padding:"7px 13px",
              fontSize:11,fontWeight:tab===t.id?700:400,
              color:tab===t.id?C.em:C.textM,whiteSpace:"nowrap",
              borderBottom:`2px solid ${tab===t.id?C.em:"transparent"}`,
              marginBottom:-1,fontFamily:"'DM Sans',sans-serif"}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Summary tab */}
      {tab==="summary"&&result?.summary&&(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <Card style={{borderLeft:`4px solid ${RISK_C_306(result.summary.transitionRisk)}`}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <div style={{background:RISK_C_306(result.summary.transitionRisk)+"22",
                border:`1px solid ${RISK_C_306(result.summary.transitionRisk)}44`,
                borderRadius:6,padding:"4px 12px",fontSize:12,fontWeight:700,
                color:RISK_C_306(result.summary.transitionRisk)}}>
                Risque: {result.summary.transitionRisk}
              </div>
              <Badge label={PLAN_TYPES.find(t=>t.id===form.planType)?.label||form.planType} color={C.blue}/>
              <ProvinceBadge province={form.province||data.profile?.defaultProvince||"QC"}/>
            </div>
            <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:8}}>{result.summary.headline}</div>
            <div style={{fontSize:13,color:C.textM,lineHeight:1.7,fontStyle:"italic"}}>{result.summary.hrbpNote}</div>
          </Card>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[["Employé",form.employeeName],["Rôle",form.role],
              ["Équipe",form.team],["Gestionnaire",form.manager],
              ["Début",form.startDate?fmtDate(form.startDate):"N/A"],
            ].filter(([,v])=>v).map(([l,v])=>(
              <div key={l} style={{padding:"8px 12px",background:C.surfLL,borderRadius:7}}>
                <Mono color={C.textD} size={8}>{l}</Mono>
                <div style={{fontSize:13,color:C.text,marginTop:3}}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase tabs */}
      {(tab==="days30"||tab==="days60"||tab==="days90")&&<PhaseTab phaseKey={tab} result={result}/>}

      {/* Checkpoints tab */}
      {tab==="checkpoints"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {(result?.checkpoints||[]).map((c,i)=>{
            const meta = PHASE_META[i]||PHASE_META[0];
            return (
              <Card key={i} style={{borderLeft:`3px solid ${meta.color}`}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <div style={{background:meta.color+"22",border:`1px solid ${meta.color}44`,
                    borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:700,color:meta.color}}>
                    {c.timing}
                  </div>
                  <div style={{fontSize:13,fontWeight:600,color:C.text}}>{c.focus}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {(c.questions||[]).map((q,j)=>(
                    <div key={j} style={{display:"flex",gap:8,padding:"6px 10px",
                      background:C.surfLL,borderRadius:6}}>
                      <span style={{color:meta.color,flexShrink:0,fontSize:11}}>Q</span>
                      <span style={{fontSize:12,color:C.textM,fontStyle:"italic"}}>"{q}"</span>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Copy tab */}
      {tab==="copy"&&(
        <div>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
            <button onClick={copyPlan}
              style={{...css.btn(copied?C.em:C.blue),padding:"7px 18px",fontSize:12}}>
              {copied?"✓ Copié !":"📋 Copier le plan complet"}
            </button>
          </div>
          <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,
            padding:"14px 16px",fontSize:12,color:C.textM,lineHeight:1.85,
            whiteSpace:"pre-wrap",fontFamily:"'DM Mono',monospace",
            maxHeight:480,overflowY:"auto"}}>
{`Plan 30-60-90 — ${form.employeeName}
Rôle: ${form.role}${form.team?` | ${form.team}`:""}
Gestionnaire: ${form.manager||"N/A"} | Début: ${form.startDate?fmtDate(form.startDate):"N/A"}
Type: ${PLAN_TYPES.find(t=>t.id===form.planType)?.label||form.planType}
Risque de transition: ${result?.summary?.transitionRisk||"—"}

${result?.summary?.headline||""}
${result?.summary?.hrbpNote||""}

${PHASE_META.map(p=>{
  const ph = result?.[p.key];
  if(!ph) return "";
  const goalsTxt = (ph.goals||[]).map((g,i)=>
    `  ${i+1}. ${g.goal}\n${(g.actions||[]).map(a=>`     → ${a}`).join("\n")}\n     ✓ ${g.success}`
  ).join("\n");
  return `━━━ ${p.label} — ${ph.theme||p.theme} ━━━\n${goalsTxt}\n\nAlertes HRBP:\n${(ph.watchouts||[]).map(w=>`  ⚠ ${w}`).join("\n")}\n\nQuestions gestionnaire:\n${(ph.managerQuestions||[]).map(q=>`  • "${q}"`).join("\n")}`;
}).join("\n\n")}

━━━ CHECKPOINTS ━━━
${(result?.checkpoints||[]).map(c=>`${c.timing} — ${c.focus}\n${(c.questions||[]).map(q=>`  • ${q}`).join("\n")}`).join("\n\n")}`}
          </div>
        </div>
      )}
    </div>
  );
}
