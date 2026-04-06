// Source: HRBP_OS.jsx L.6353-6744
import { useState } from "react";
import { C, css } from '../theme.js';
import { callAIJson } from '../api/index.js';
import { fmtDate, normKey } from '../utils/format.js';
import { normalizeRisk } from '../utils/normalize.js';
import { PORTFOLIO_ASSESS_SP } from '../prompts/portfolio.js';
import Badge from '../components/Badge.jsx';
import Card from '../components/Card.jsx';
import Mono from '../components/Mono.jsx';

// Inline data constant (Source: L.6356-6360)
const EMPTY_MANAGER = {
  id:"", name:"", team:"", level:3,
  risk:"Modéré", pressure:"Moderee", type:"Solide",
  topIssue:"", hrbpAction:"", lastInteraction:"", notes:""
};

// Inline editor for a portfolio entry — at module scope so React never remounts it
// on re-render (avoids focus loss in the input fields).
function InlineEdit({ form, setForm, onSave, onCancel }) {
  const FF = (k, v) => setForm(p => ({...p, [k]: v}));
  return (
    <div style={{padding:"12px 14px", background:C.surfLL, borderTop:`1px solid ${C.border}`,
      display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8}}>
      <div>
        <Mono color={C.textD} size={8}>Risque</Mono>
        <select value={form.risk||"Modéré"} onChange={e=>FF("risk",e.target.value)}
          style={{...css.select, marginTop:4, fontSize:12, padding:"5px 8px"}}>
          {["Critique","Élevé","Modéré","Faible"].map(r=><option key={r}>{r}</option>)}
        </select>
      </div>
      <div>
        <Mono color={C.textD} size={8}>Type</Mono>
        <select value={form.type||"Solide"} onChange={e=>FF("type",e.target.value)}
          style={{...css.select, marginTop:4, fontSize:12, padding:"5px 8px"}}>
          {["Solide","Évitant","Surchargé","Micromanager","Politique","En développement"].map(t=><option key={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <Mono color={C.textD} size={8}>Pression</Mono>
        <select value={form.pressure||"Moderee"} onChange={e=>FF("pressure",e.target.value)}
          style={{...css.select, marginTop:4, fontSize:12, padding:"5px 8px"}}>
          <option value="Elevee">Élevée</option>
          <option value="Moderee">Modérée</option>
          <option value="Faible">Faible</option>
        </select>
      </div>
      <div style={{gridColumn:"1/-1"}}>
        <Mono color={C.textD} size={8}>Enjeu</Mono>
        <input value={form.topIssue||""} onChange={e=>FF("topIssue",e.target.value)}
          placeholder="Ex: Évite les feedbacks difficiles"
          style={{...css.input, marginTop:4, fontSize:12, padding:"5px 8px"}}/>
      </div>
      <div style={{gridColumn:"1/-1"}}>
        <Mono color={C.textD} size={8}>Action HRBP</Mono>
        <input value={form.hrbpAction||""} onChange={e=>FF("hrbpAction",e.target.value)}
          placeholder="Ex: Coaching conversation difficile"
          style={{...css.input, marginTop:4, fontSize:12, padding:"5px 8px"}}/>
      </div>
      <div style={{display:"flex", gap:8, gridColumn:"1/-1", marginTop:4}}>
        <button onClick={onSave}   style={{...css.btn(C.em),    padding:"7px 16px", fontSize:12}}>✓ Enregistrer</button>
        <button onClick={onCancel} style={{...css.btn(C.textM, true), padding:"7px 12px", fontSize:12}}>Annuler</button>
      </div>
    </div>
  );
}

export default function ModulePortfolio({ data, onSave }) {
  const managers = data.portfolio || [];
  const [expandedId, setExpandedId] = useState(null);
  const [form, setForm]             = useState({});
  const [riskFilter, setRiskFilter] = useState("Tous");
  const [typeFilter, setTypeFilter] = useState("Tous");
  const [search, setSearch]         = useState("");
  const [assessing, setAssessing]   = useState(null);
  const [assessPrompt, setAssessPrompt] = useState(null);
  const [adding, setAdding]         = useState(false);
  const [newForm, setNewForm]       = useState({...EMPTY_MANAGER});
  const [deletedQueue, setDeletedQueue] = useState([]); // [{m, timer}] for undo

  const RISK_ORDER_P = {"Critique":0,"Élevé":1,"Eleve":1,"Modéré":2,"Modere":2,"Faible":3};
  const riskC = (r) => ({"Critique":C.red,"Élevé":C.amber,"Eleve":C.amber,"Modéré":C.blue,"Modere":C.blue,"Faible":C.em}[r]||C.textD);
  const TYPE_ICON = {"Solide":"✅","Evitant":"🫥","Évitant":"🫥","Surcharge":"🔥","Surchargé":"🔥","Micromanager":"🔬","Politique":"🎭","En developpement":"🌱","En développement":"🌱"};
  const pressLabel = {"Elevee":"🔴","Élevée":"🔴","Moderee":"🟡","Modérée":"🟡","Faible":"🟢"};

  const saveEdit = (id) => {
    onSave("portfolio", managers.map(m=>m.id===id?{...m,...form}:m));
    setExpandedId(null); setForm({});
  };

  const saveNew = () => {
    if (!newForm.name?.trim()) return;
    onSave("portfolio", [...managers, {...newForm, id:Date.now().toString(), lastInteraction:new Date().toISOString().split("T")[0]}]);
    setAdding(false); setNewForm({...EMPTY_MANAGER});
  };

  // Undo-based delete
  const del = (m) => {
    onSave("portfolio", managers.filter(x=>x.id!==m.id));
    const timer = setTimeout(() => {
      setDeletedQueue(q=>q.filter(x=>x.m.id!==m.id));
    }, 4000);
    setDeletedQueue(q=>[...q, {m, timer}]);
  };

  const undoDel = (m) => {
    setDeletedQueue(q=>{
      const item = q.find(x=>x.m.id===m.id);
      if (item) clearTimeout(item.timer);
      return q.filter(x=>x.m.id!==m.id);
    });
    onSave("portfolio", [...managers, m].sort((a,b)=>(RISK_ORDER_P[a.risk]||9)-(RISK_ORDER_P[b.risk]||9)));
  };

  const openEdit = (m) => {
    if (expandedId===m.id){setExpandedId(null);setForm({});return;}
    setExpandedId(m.id);
    setForm({name:m.name,team:m.team||"",risk:m.risk||"Modéré",pressure:m.pressure||"Moderee",
      type:m.type||"Solide",topIssue:m.topIssue||"",hrbpAction:m.hrbpAction||"",
      lastInteraction:m.lastInteraction||"",notes:m.notes||""});
  };

  const assessFromData = async (m) => {
    const mData=(data.meetings||[]).filter(x=>normKey(x.director)===normKey(m.name)).slice(-5);
    const cData=(data.cases||[]).filter(x=>normKey(x.director)===normKey(m.name)).slice(-5);
    if (!mData.length&&!cData.length){alert("Aucune donnée trouvée pour ce gestionnaire.");return;}
    const ctx=[
      mData.length&&`MEETINGS:\n${mData.map(x=>`- ${fmtDate(x.savedAt)} Risk:${x.analysis?.overallRisk} ${x.analysis?.overallRiskRationale||""}`).join("\n")}`,
      cData.length&&`CASES:\n${cData.map(x=>`- ${x.title} | ${x.riskLevel} | ${x.situation||""}`).join("\n")}`,
    ].filter(Boolean).join("\n\n");
    setAssessing(m.id);
    try {
      const p = await callAIJson(PORTFOLIO_ASSESS_SP, `Gestionnaire: ${m.name}\n\n${ctx}`, 500);
      onSave("portfolio", managers.map(x=>x.id===m.id?{...x,
        risk:normalizeRisk(p.riskAssessment)||x.risk, pressure:p.pressureLevel||x.pressure,
        type:p.managerType||x.type, topIssue:p.topIssue||x.topIssue,
        hrbpAction:p.recommendedAction||x.hrbpAction,
        lastInteraction:new Date().toISOString().split("T")[0]}:x));
    } catch(e){ alert("Erreur: "+e.message); }
    finally{ setAssessing(null); }
  };

  const importAssessResponse = (parsed, managerId) => {
    const p = parsed;
    onSave("portfolio", managers.map(x=>x.id===managerId?{...x,
      risk:normalizeRisk(p.riskAssessment)||x.risk, pressure:p.pressureLevel||x.pressure,
      type:p.managerType||x.type, topIssue:p.topIssue||x.topIssue,
      hrbpAction:p.recommendedAction||x.hrbpAction,
      lastInteraction:new Date().toISOString().split("T")[0]}:x));
    setAssessPrompt(null);
  };

  // "Where do I spend my next 5 HRBP hours?" — top 3
  const topFocus = [...managers]
    .map(m => {
      let score = 0;
      const ro = RISK_ORDER_P[m.risk]||3;
      score += (3-ro)*30; // risk weight
      const days = m.lastInteraction ? Math.floor((Date.now()-new Date(m.lastInteraction).getTime())/86400000) : 99;
      if (days>21) score += 20;
      else if (days>14) score += 10;
      if (m.pressure==="Elevee"||m.pressure==="Élevée") score += 15;
      if (m.type==="Évitant"||m.type==="Evitant") score += 10;
      if (m.type==="Surchargé"||m.type==="Surcharge") score += 8;
      return {...m, _score:score, _days:days};
    })
    .filter(m=>m._score>10)
    .sort((a,b)=>b._score-a._score)
    .slice(0,3);

  const focusReason = (m) => {
    const parts = [];
    if (m.risk==="Critique") parts.push("risque critique");
    else if (m.risk==="Élevé"||m.risk==="Eleve") parts.push("risque élevé");
    if (m._days>21) parts.push(`${m._days}j sans contact`);
    else if (m._days>14) parts.push(`${m._days}j sans contact`);
    if (m.pressure==="Elevee"||m.pressure==="Élevée") parts.push("pression élevée");
    if (m.type==="Évitant"||m.type==="Evitant") parts.push("pattern évitant");
    if (m.type==="Surchargé"||m.type==="Surcharge") parts.push("débordé");
    return parts.slice(0,2).join(" · ")||"Priorité";
  };

  const RISK_FILTERS = ["Tous","Critique","Élevé","Modéré","Faible"];
  const TYPE_FILTERS = [
    {val:"Tous",label:"Tous"},
    {val:"Évitant",label:"Évitant"},
    {val:"Surchargé",label:"Débordé"},
    {val:"Micromanager",label:"Micro"},
    {val:"Politique",label:"Politique"},
  ];

  const filtered = managers
    .filter(m=>{
      if(riskFilter!=="Tous"&&normalizeRisk(m.risk)!==riskFilter&&m.risk!==riskFilter) return false;
      if(typeFilter!=="Tous"&&m.type!==typeFilter&&!(typeFilter==="Évitant"&&m.type==="Evitant")&&!(typeFilter==="Surchargé"&&m.type==="Surcharge")) return false;
      if(search&&!m.name.toLowerCase().includes(search.toLowerCase())&&!(m.team||"").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a,b)=>(RISK_ORDER_P[a.risk]||9)-(RISK_ORDER_P[b.risk]||9));

  return (
    <div style={{maxWidth:900,margin:"0 auto"}}>
      {/* Undo toast */}
      {deletedQueue.map(({m})=>(
        <div key={m.id} style={{position:"fixed",bottom:20,right:20,zIndex:9999,
          background:C.surfL,border:`1px solid ${C.border}`,borderRadius:8,
          padding:"10px 16px",display:"flex",gap:12,alignItems:"center",
          boxShadow:"0 4px 20px #0004",fontFamily:"'DM Sans',sans-serif"}}>
          <span style={{fontSize:12,color:C.textM}}>{m.name} supprimé</span>
          <button onClick={()=>undoDel(m)}
            style={{...css.btn(C.em),padding:"4px 12px",fontSize:11}}>Annuler</button>
        </div>
      ))}

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <div style={{flex:1}}>
          <span style={{fontSize:16,fontWeight:700,color:C.text}}>Portfolio</span>
          <span style={{fontSize:12,color:C.textM,marginLeft:10}}>
            {managers.length} gestionnaires · {managers.filter(m=>m.risk==="Critique"||m.risk==="Élevé"||m.risk==="Eleve").length} à risque élevé+
          </span>
        </div>
        <button onClick={()=>{setAdding(v=>!v);setNewForm({...EMPTY_MANAGER});}}
          style={{...css.btn(adding?C.textM:C.em,adding),padding:"7px 16px",fontSize:12}}>
          {adding?"✕ Annuler":"➕ Ajouter"}
        </button>
      </div>

      {/* Quick add */}
      {adding&&(
        <div style={{background:C.em+"08",border:`1px solid ${C.em}30`,borderRadius:9,
          padding:"12px 14px",marginBottom:12,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <div style={{gridColumn:"span 2"}}>
            <Mono color={C.textD} size={8}>Nom *</Mono>
            <input value={newForm.name||""} onChange={e=>setNewForm(f=>({...f,name:e.target.value}))}
              placeholder="Prénom ou identifier" autoFocus
              style={{...css.input,marginTop:4,fontSize:12,padding:"6px 9px"}}/>
          </div>
          <div>
            <Mono color={C.textD} size={8}>Équipe</Mono>
            <input value={newForm.team||""} onChange={e=>setNewForm(f=>({...f,team:e.target.value}))}
              placeholder="Ex: Data, Infra..."
              style={{...css.input,marginTop:4,fontSize:12,padding:"6px 9px"}}/>
          </div>
          <div>
            <Mono color={C.textD} size={8}>Risque</Mono>
            <select value={newForm.risk||"Modéré"} onChange={e=>setNewForm(f=>({...f,risk:e.target.value}))}
              style={{...css.select,marginTop:4,fontSize:12,padding:"5px 8px"}}>
              {["Critique","Élevé","Modéré","Faible"].map(r=><option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <Mono color={C.textD} size={8}>Type</Mono>
            <select value={newForm.type||"Solide"} onChange={e=>setNewForm(f=>({...f,type:e.target.value}))}
              style={{...css.select,marginTop:4,fontSize:12,padding:"5px 8px"}}>
              {["Solide","Évitant","Surchargé","Micromanager","Politique","En développement"].map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{display:"flex",gap:8,gridColumn:"1/-1",alignItems:"flex-end"}}>
            <input value={newForm.topIssue||""} onChange={e=>setNewForm(f=>({...f,topIssue:e.target.value}))}
              placeholder="Enjeu principal (optionnel)"
              style={{...css.input,fontSize:12,padding:"6px 9px",flex:1}}/>
            <button onClick={saveNew} disabled={!newForm.name?.trim()}
              style={{...css.btn(!newForm.name?.trim()?C.textD:C.em),padding:"7px 16px",fontSize:12,
                flexShrink:0,opacity:newForm.name?.trim()?1:0.5}}>
              Ajouter ✓
            </button>
          </div>
        </div>
      )}

      {/* ── WHERE TO SPEND MY NEXT 5 HRBP HOURS ── */}
      {topFocus.length>0&&(
        <div style={{background:"linear-gradient(135deg,#ef444412,#f59e0b08)",
          border:`1px solid ${C.red}25`,borderRadius:10,padding:"14px 16px",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <span style={{fontSize:14}}>🎯</span>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:C.text}}>Où passer mes 5 prochaines heures HRBP ?</div>
              <div style={{fontSize:11,color:C.textD}}>Score basé sur le risque, l'inactivité et le pattern</div>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {topFocus.map((m,i)=>{
              const rc=riskC(m.risk);
              return (
                <div key={m.id} style={{display:"flex",gap:10,alignItems:"center",
                  padding:"9px 12px",background:C.surfL,borderRadius:8,
                  borderLeft:`3px solid ${rc}`}}>
                  <div style={{width:22,height:22,background:rc+"22",border:`1px solid ${rc}44`,
                    borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:12,fontWeight:800,color:rc,flexShrink:0}}>{i+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:C.text}}>
                      {TYPE_ICON[m.type]||""} {m.name}
                      {m.team&&<span style={{fontSize:11,color:C.textM,fontWeight:400,marginLeft:6}}>{m.team}</span>}
                    </div>
                    <div style={{fontSize:11,color:C.textD,marginTop:2}}>{focusReason(m)}</div>
                    {m.hrbpAction&&<div style={{fontSize:11,color:C.em,marginTop:2}}>→ {m.hrbpAction}</div>}
                  </div>
                  <button onClick={()=>openEdit(m)}
                    style={{...css.btn(C.textM,true),padding:"4px 10px",fontSize:11,flexShrink:0}}>✏</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters — risk + type pills */}
      <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{display:"flex",gap:4}}>
          {RISK_FILTERS.map(r=>(
            <button key={r} onClick={()=>setRiskFilter(r)}
              style={{padding:"3px 10px",borderRadius:5,fontSize:11,cursor:"pointer",
                fontFamily:"'DM Sans',sans-serif",border:"none",
                background:riskFilter===r?C.em+"22":C.surfL,
                color:riskFilter===r?C.em:C.textM,
                fontWeight:riskFilter===r?600:400,
                outline:riskFilter===r?`1px solid ${C.em}55`:"none"}}>{r}</button>
          ))}
        </div>
        <div style={{width:1,height:16,background:C.border,margin:"0 2px"}}/>
        <div style={{display:"flex",gap:4}}>
          {TYPE_FILTERS.map(({val,label})=>(
            <button key={val} onClick={()=>setTypeFilter(val)}
              style={{padding:"3px 10px",borderRadius:5,fontSize:11,cursor:"pointer",
                fontFamily:"'DM Sans',sans-serif",border:"none",
                background:typeFilter===val?C.purple+"22":C.surfL,
                color:typeFilter===val?C.purple:C.textM,
                fontWeight:typeFilter===val?600:400,
                outline:typeFilter===val?`1px solid ${C.purple}55`:"none"}}>{label}</button>
          ))}
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Nom ou équipe..."
          style={{...css.input,marginLeft:"auto",maxWidth:150,fontSize:12,padding:"4px 9px"}}/>
        <Mono color={C.textD} size={8}>{filtered.length}/{managers.length}</Mono>
      </div>

      {managers.length===0&&(
        <div style={{textAlign:"center",padding:"50px 20px",color:C.textD}}>
          <div style={{fontSize:14,color:C.textM,marginBottom:8}}>Portfolio vide</div>
          <button onClick={()=>setAdding(true)} style={{...css.btn(C.em),padding:"9px 20px"}}>➕ Ajouter</button>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {filtered.map(m=>{
          const rc=riskC(m.risk); const isExpanded=expandedId===m.id;
          const isAssessing=assessing===m.id;
          const days=m.lastInteraction?Math.floor((Date.now()-new Date(m.lastInteraction).getTime())/86400000):null;
          return (
            <div key={m.id} style={{background:C.surfL,border:`1px solid ${isExpanded?C.em+"55":C.border}`,
              borderLeft:`3px solid ${rc}`,borderRadius:8,overflow:"hidden"}}>
              <div style={{display:"flex",gap:10,alignItems:"center",padding:"10px 12px"}}>
                <div style={{flex:"0 0 175px"}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.text}}>{TYPE_ICON[m.type]||"👤"} {m.name}</div>
                  {m.team&&<div style={{fontSize:11,color:C.textM}}>{m.team}</div>}
                </div>
                <div style={{display:"flex",gap:4,flex:"0 0 auto"}}>
                  <div style={{background:rc+"20",border:`1px solid ${rc}40`,borderRadius:5,
                    padding:"2px 8px",fontSize:10,fontWeight:700,color:rc}}>{m.risk||"—"}</div>
                  {m.pressure&&<span style={{fontSize:13}}>{pressLabel[m.pressure]||""}</span>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  {m.topIssue&&<div style={{fontSize:12,color:C.textM,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    <span style={{color:C.amber}}>⚑ </span>{m.topIssue}
                  </div>}
                  {m.hrbpAction&&<div style={{fontSize:11,color:C.em,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    → {m.hrbpAction}
                  </div>}
                </div>
                <div style={{display:"flex",gap:5,alignItems:"center",flexShrink:0}}>
                  {days!==null&&<Mono color={days>21?C.amber:C.textD} size={8}>{days}j</Mono>}
                  <button onClick={()=>assessFromData(m)} disabled={!!assessing}
                    title="Réévaluer depuis le OS"
                    style={{background:"none",border:`1px solid ${C.border}`,borderRadius:5,
                      padding:"3px 7px",cursor:"pointer",fontSize:11,color:C.textD,
                      opacity:assessing&&assessing!==m.id?0.4:1}}>{isAssessing?"…":"🔄"}</button>
                  <button onClick={()=>openEdit(m)}
                    style={{...css.btn(isExpanded?C.em:C.textM,!isExpanded),padding:"4px 10px",fontSize:11}}>
                    {isExpanded?"✕":"✏"}
                  </button>
                  <button onClick={()=>del(m)}
                    style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:C.textD,padding:"2px"}}>✕</button>
                </div>
              </div>
              {isExpanded&&<InlineEdit
                form={form}
                setForm={setForm}
                onSave={()=>saveEdit(m.id)}
                onCancel={()=>{setExpandedId(null);setForm({});}}
              />}
            </div>
          );
        })}
        {filtered.length===0&&managers.length>0&&(
          <div style={{textAlign:"center",padding:"30px",color:C.textD,fontSize:13}}>Aucun résultat.</div>
        )}
      </div>
    </div>
  );
}
