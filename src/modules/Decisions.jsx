// Source: HRBP_OS.jsx L.3686-3776
import { useState } from "react";
import { C, css, RISK } from '../theme.js';
import { callAI } from '../api/index.js';
import { isLegalSensitive, buildLegalPromptContext } from '../utils/legal.js';
import { normalizeRisk } from '../utils/normalize.js';
import { STRATEGY_SP } from '../prompts/decisions.js';
import Badge from '../components/Badge.jsx';
import Card from '../components/Card.jsx';
import Mono from '../components/Mono.jsx';
import AILoader from '../components/AILoader.jsx';

// Inline shared helpers not in components/ (used in multiple modules, extracted at Bloc 7)
function RiskBadge({ level }) {
  const norm = normalizeRisk(level);
  const r = RISK[norm] || RISK["Modéré"];
  return <Badge label={norm} color={r.color} />;
}
function SecHead({ icon, label, color=C.em }) {
  return <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, paddingBottom:8, borderBottom:`1px solid ${color}28` }}>
    <span style={{ fontSize:14 }}>{icon}</span>
    <Mono size={10} color={color}>{label}</Mono>
  </div>;
}

export default function ModuleDecisions({ data, onSave }) {
  const [view, setView] = useState("list");
  const [issue, setIssue] = useState("");
  const [context, setContext] = useState("");
  const [category, setCategory] = useState("Rétention");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const decisions = data.decisions || [];
  const UC = { "Critique":C.red, "Élevée":C.amber, "Modérée":C.blue, "Planifiée":C.em };

  const generate = async () => {
    if (issue.trim().length < 20) return;
    const _stratProv = data.profile?.defaultProvince || "QC";
    setLoading(true); setError(""); setResult(null); setSaved(false);
    try {
      const _stratLegal = isLegalSensitive(issue + " " + context)
        ? `\n${buildLegalPromptContext(_stratProv)}\n` : "";
      const p = `ENJEU RH:\n${issue}\n\nCATÉGORIE: ${category}\n${context?`CONTEXTE: ${context}`:""}${_stratLegal}`;
      const parsed = await callAI(STRATEGY_SP, p);
      setResult(parsed); setView("result");
    } catch(e) { setError("Erreur: " + e.message); } finally { setLoading(false); }
  };

  const saveDecision = () => {
    if (!result || saved) return;
    onSave("decisions", [...decisions, { id:Date.now().toString(), savedAt:new Date().toISOString().split("T")[0], issue, result }]);
    setSaved(true);
  };

  if (view === "result" && result) return (
    <div style={{ maxWidth:860, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <button onClick={() => { setView("list"); setResult(null); setIssue(""); }} style={{ ...css.btn(C.textM,true), padding:"6px 12px", fontSize:11 }}>← Retour</button>
        <div style={{ flex:1, fontSize:16, fontWeight:700, color:C.text }}>{result.issueTitle}</div>
        <button onClick={saveDecision} disabled={saved} style={{ ...css.btn(saved?C.textD:C.em), padding:"8px 16px", fontSize:12 }}>{saved?"✓ Archivé":"💾 Archiver"}</button>
      </div>
      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
        <RiskBadge level={result.businessImpact?.overallRisk||"Modéré"}/><Badge label={result.issueCategory} color={C.blue}/><Badge label={result.urgencyLevel} color={UC[result.urgencyLevel]||C.amber}/>
      </div>
      <Card style={{ marginBottom:12, borderLeft:`3px solid ${C.em}` }}><SecHead icon="🎯" label="Résumé exécutif" color={C.em}/><div style={{ fontSize:13, color:C.text, lineHeight:1.7 }}>{result.executiveSummary}</div></Card>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
        <Card><SecHead icon="🔍" label="Causes racines" color={C.purple}/>
          {result.rootCauses?.map((r,i) => <div key={i} style={{ marginBottom:10 }}><div style={{ display:"flex", gap:6, marginBottom:4 }}><Badge label={r.confidence} color={r.confidence==="Élevée"?C.red:C.amber}/><Badge label={r.layer} color={C.purple}/></div><div style={{ fontSize:13, color:C.text, fontWeight:500 }}>{r.hypothesis}</div><div style={{ fontSize:11, color:C.textM, marginTop:3 }}>{r.evidence}</div></div>)}
        </Card>
        <Card><SecHead icon="⚠" label="Risques" color={C.red}/>
          {result.risks?.map((r,i) => <div key={i} style={{ marginBottom:8 }}><div style={{ display:"flex", gap:6, marginBottom:4 }}><Badge label={r.category} color={C.amber}/><Badge label={r.probability} color={r.probability==="Élevée"?C.red:C.amber}/></div><div style={{ fontSize:12, color:C.text }}>{r.risk}</div>{r.legalRef&&<div style={{ fontSize:10, color:C.blue, marginTop:2 }}>📋 {r.legalRef}</div>}<div style={{ fontSize:11, color:C.em, marginTop:2 }}>→ {r.mitigation}</div></div>)}
        </Card>
      </div>
      <Card style={{ marginBottom:12 }}><SecHead icon="🏆" label="Stratégie recommandée" color={C.em}/>
        <div style={{ fontSize:14, fontWeight:700, color:C.em, marginBottom:8 }}>{result.recommendedStrategy?.headline}</div>
        <div style={{ fontSize:13, color:C.text, lineHeight:1.7, marginBottom:8 }}>{result.recommendedStrategy?.rationale}</div>
        <div style={{ fontSize:11, color:C.textM, fontStyle:"italic" }}>Succès dans 90j: {result.recommendedStrategy?.successDefinition}</div>
      </Card>
      <Card style={{ marginBottom:12 }}><SecHead icon="📋" label="Plan d'action" color={C.blue}/>
        {result.actionPlan?.map((ph,i) => <div key={i} style={{ marginBottom:14 }}>
          <div style={{ display:"flex", gap:8, marginBottom:8 }}><Badge label={ph.phase} color={i===0?C.red:i===1?C.amber:C.em}/><Mono color={C.textD} size={9}>{ph.timeline}</Mono></div>
          {ph.actions?.map((a,j) => <div key={j} style={{ display:"flex", gap:10, marginBottom:6, paddingLeft:12 }}><div style={{ width:5,height:5,borderRadius:"50%",background:C.blue,flexShrink:0,marginTop:7 }}/><div><div style={{ fontSize:13, color:C.text }}>{a.action}</div><div style={{ fontSize:10, color:C.textM, marginTop:2 }}>Owner: {a.owner} · KPI: {a.kpi}</div></div></div>)}
        </div>)}
      </Card>
      {result.leadershipTalkingPoints?.map((tp,i) => <Card key={i} style={{ marginBottom:10 }}>
        <SecHead icon="🎙️" label={`Talking points — ${tp.audience}`} color={C.purple}/>
        <div style={{ fontSize:12, color:C.em, fontStyle:"italic", marginBottom:8 }}>"{tp.opening}"</div>
        {tp.points?.map((p,j) => <div key={j} style={{ display:"flex", gap:8, marginBottom:5 }}><div style={{ width:5,height:5,borderRadius:"50%",background:C.purple,flexShrink:0,marginTop:6 }}/><span style={{ fontSize:13, color:C.text }}>{p}</span></div>)}
        <div style={{ marginTop:8, fontSize:12, color:C.amber }}>Ask: {tp.ask}</div>
      </Card>)}
      {result.hrbpNotes&&<Card style={{ borderLeft:`3px solid ${C.textD}` }}><Mono color={C.textD} size={9}>Notes internes HRBP</Mono><div style={{ fontSize:12, color:C.textM, fontStyle:"italic", lineHeight:1.65, marginTop:6 }}>{result.hrbpNotes}</div></Card>}
      <div style={{ textAlign:"center", marginTop:14 }}><button onClick={() => { setView("list"); setResult(null); setIssue(""); }} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:7, padding:"8px 20px", fontSize:12, color:C.textD, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>↺ Nouvel enjeu</button></div>
    </div>
  );

  return (
    <div style={{ maxWidth:860, margin:"0 auto" }}>
      <div style={{ marginBottom:20 }}><div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>Décisions & Stratégie</div><div style={{ fontSize:12, color:C.textM }}>{decisions.length} stratégie(s) archivée(s)</div></div>
      <Card style={{ marginBottom:20 }}>
        <SecHead icon="⚖️" label="Analyser un enjeu RH" color={C.red}/>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
          <div><Mono color={C.textD} size={9}>Catégorie</Mono><select value={category} onChange={e=>setCategory(e.target.value)} style={{ ...css.select, marginTop:6 }}>{["Rétention","Leadership","Performance","Culture","Structure","Engagement","Immigration","Talent"].map(c=><option key={c}>{c}</option>)}</select></div>
          <div><Mono color={C.textD} size={9}>Contexte additionnel</Mono><input value={context} onChange={e=>setContext(e.target.value)} placeholder="Ex: post-réorg, urgence légale..." style={{ ...css.input, marginTop:6 }} onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/></div>
        </div>
        <Mono color={C.textD} size={9}>Décris l'enjeu RH à analyser</Mono>
        <textarea rows={5} value={issue} onChange={e=>setIssue(e.target.value)} placeholder="Ex: Gestionnaire qui évite les conversations de performance depuis 3 mois..." style={{ ...css.textarea, marginTop:6 }} onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
        {error&&<div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7, padding:"8px 12px", margin:"10px 0", fontSize:12, color:C.red }}>⚠ {error}</div>}
        {loading?<AILoader label="Génération de la stratégie"/>:<button onClick={generate} disabled={issue.trim().length<20} style={{ ...css.btn(C.red), width:"100%", marginTop:12, opacity:issue.trim().length>=20?1:.4 }}>⚖️ Générer la stratégie RH</button>}
      </Card>
      {decisions.length>0&&<><Mono color={C.textD} size={9}>Archive des stratégies</Mono><div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:7 }}>{decisions.slice().reverse().map((d,i)=>{ const r=RISK[d.result?.businessImpact?.overallRisk]||RISK["Modéré"]; return <button key={i} onClick={()=>{ setResult(d.result); setSaved(true); setView("result"); }} style={{ background:C.surfL, border:`1px solid ${r.color}28`, borderLeft:`3px solid ${r.color}`, borderRadius:8, padding:"12px 14px", cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif" }}><div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}><span style={{ fontSize:13, fontWeight:500, color:C.text }}>{d.result?.issueTitle}</span><RiskBadge level={d.result?.businessImpact?.overallRisk||"Modéré"}/></div><div style={{ fontSize:11, color:C.textM }}>{d.result?.issueCategory} · {d.savedAt}</div></button>; })}</div></>}
    </div>
  );
}
