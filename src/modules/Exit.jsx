// Source: HRBP_OS.jsx L.3873-3945
import { useState, useEffect } from "react";
import { C, css, DELAY_C } from '../theme.js';
import { normKey } from '../utils/format.js';
import { callAI } from '../api/index.js';
import { buildLegalPromptContext } from '../utils/legal.js';
import { EXIT_SP } from '../prompts/exit.js';
import { useT } from '../lib/i18n.js';
import Badge from '../components/Badge.jsx';
import Card from '../components/Card.jsx';
import Mono from '../components/Mono.jsx';
import AILoader from '../components/AILoader.jsx';
import ProvinceSelect from '../components/ProvinceSelect.jsx';

// Inline shared helpers (used in multiple modules, to be reviewed at Bloc 7)
function SecHead({ icon, label, color=C.em }) {
  return <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, paddingBottom:8, borderBottom:`1px solid ${color}28` }}>
    <span style={{ fontSize:14 }}>{icon}</span>
    <Mono size={10} color={color}>{label}</Mono>
  </div>;
}
function BulletList({ items, color=C.em }) {
  if (!items?.length) return null;
  return <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
    {items.map((item,i) => <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
      <div style={{ width:5, height:5, borderRadius:"50%", background:color, flexShrink:0, marginTop:7 }} />
      <span style={{ fontSize:13, color:C.text, lineHeight:1.65 }}>
        {typeof item==="string" ? item : item.text || JSON.stringify(item)}
      </span>
    </div>)}
  </div>;
}


export default function ModuleExit({ data, onSave, focusExitId, onClearFocus }) {
  const { t } = useT();
  const [view, setView] = useState("list");
  const [exitDate, setExitDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState(""); const [employeeName, setEmployeeName] = useState(""); const [role, setRole] = useState(""); const [tenure, setTenure] = useState(""); const [seniority, setSeniority] = useState(""); const [team, setTeam] = useState(""); const [managerName, setManagerName] = useState(""); const [exitProvince, setExitProvince] = useState("QC");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState(null); const [saved, setSaved] = useState(false);
  // ── Inter-module focus: auto-open a specific exit on mount ──────────────────
  useEffect(() => {
    if (!focusExitId) return;
    const target = (data.exits || []).find(e => e.id === focusExitId);
    if (target) { setResult(target.result); setSaved(true); setView("result"); }
    if (onClearFocus) onClearFocus();
  }, [focusExitId]); // eslint-disable-line

  const exits = data.exits || [];
  const DC = {"Volontaire regrettable":C.red,"Volontaire non regrettable":C.em,"Inconnu":C.textM};
  const SC = {"Positif":C.em,"Neutre":C.blue,"Mitigé":C.amber,"Négatif":C.red,"Critique":C.red};
  const RL = {"Faible":C.em,"Modéré":C.amber,"Élevé":C.red};

  const analyze = async () => {
    if (notes.trim().length < 60) return;
    const _exitProv = exitProvince || data.profile?.defaultProvince || "QC";
    const _exitLegal = buildLegalPromptContext(_exitProv);
    setLoading(true); setError(""); setResult(null); setSaved(false);
    try {
      const parsed = await callAI(EXIT_SP, `${_exitLegal}\n\nPROFIL:\n- Employé: ${employeeName||"non spécifié"}\n- Rôle: ${role||"non spécifié"}\n- Ancienneté: ${tenure||"non spécifiée"}\n- Niveau: ${seniority||"non spécifié"}\n- Équipe: ${team||"non spécifiée"}\n- Gestionnaire: ${managerName||"non spécifié"}\n\nDONNÉES:\n${notes}`);
      setResult(parsed); setView("result");
    } catch(e) { setError(t("exit.errorPrefix") + e.message); } finally { setLoading(false); }
  };

  const saveExit = () => {
    if (!result || saved) return;
    const today = new Date().toISOString().split("T")[0];
    onSave("exits", [...exits, { id:Date.now().toString(), savedAt: exitDate || today, dateCreated: today, employeeName, role, tenure, team, managerName, managerKey:normKey(managerName), province:exitProvince, result }]);
    setSaved(true);
  };

  if (view === "result" && result) return (
    <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <button onClick={()=>{ setView("list"); setResult(null); setNotes(""); }} style={{ ...css.btn(C.textM,true), padding:"6px 12px", fontSize:11 }}>{t("exit.back")}</button>
        <div style={{ flex:1, fontSize:16, fontWeight:700, color:C.text }}>{result.summary?.headline}</div>
        <button onClick={saveExit} disabled={saved} style={{ ...css.btn(saved?C.textD:C.em), padding:"8px 16px", fontSize:12 }}>{saved?t("exit.archived"):t("exit.archive")}</button>
      </div>
      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
        <Badge label={result.summary?.departure_type||""} color={DC[result.summary?.departure_type]||C.textM}/>
        <Badge label={`${t("exit.regrettablePrefix")}${result.summary?.regrettable||"?"}`} color={result.summary?.regrettable==="Oui"?C.red:C.em}/>
        <Badge label={result.summary?.primaryTheme||""} color={C.purple}/>
        {result.employeeProfile?.role&&<Badge label={result.employeeProfile.role} color={C.blue}/>}
      </div>
      <Card style={{ marginBottom:10, borderLeft:`3px solid ${C.em}` }}><SecHead icon="📋" label={t("exit.section.summary")} color={C.em}/><BulletList items={result.summary?.executiveSummary} color={C.em}/>{result.summary?.confidentialityNote&&<div style={{ marginTop:10, fontSize:11, color:C.amber, fontStyle:"italic" }}>🔒 {result.summary.confidentialityNote}</div>}</Card>
      {result.structuredInterview&&<Card style={{ marginBottom:10 }}><SecHead icon="📝" label={t("exit.section.structuredInterview")} color={C.blue}/>{[["🤝",t("exit.interview.integration"),"integration"],["💼",t("exit.interview.jobSatisfaction"),"jobSatisfaction"],["👥",t("exit.interview.colleagueRelations"),"colleagueRelations"],["🎙️",t("exit.interview.managementRelations"),"managementRelations"],["🏢",t("exit.interview.workingConditions"),"workingConditions"]].map(([icon,label,key],i,arr)=>{const s=result.structuredInterview[key]||{};const absent=!s.summary||s.summary==="Non abordé";return(<div key={key} style={{ paddingBottom:i<arr.length-1?12:0,marginBottom:i<arr.length-1?12:0,borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none" }}><div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:6 }}><span style={{ fontSize:13 }}>{icon}</span><span style={{ fontSize:12,fontWeight:600,color:C.text }}>{label}</span>{s.riskLevel&&<Badge label={s.riskLevel} color={RL[s.riskLevel]||C.textM} size={10}/>}</div><div style={{ fontSize:13,color:C.textM,marginBottom:(s.positives?.length||s.irritants?.length)?8:0,fontStyle:absent?"italic":"normal" }}>{s.summary||t("exit.interview.notDiscussed")}</div>{s.positives?.length>0&&<div style={{ marginBottom:s.irritants?.length>0?8:0 }}><Mono color={C.em} size={9}>{t("exit.interview.positives")}</Mono><div style={{ marginTop:4 }}><BulletList items={s.positives} color={C.em}/></div></div>}{s.irritants?.length>0&&<div><Mono color={C.red} size={9}>{t("exit.interview.irritants")}</Mono><div style={{ marginTop:4 }}><BulletList items={s.irritants} color={C.red}/></div></div>}</div>);})}</Card>}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
        <Card><SecHead icon="🔍" label={t("exit.section.reasons")} color={C.purple}/>{result.reasons?.primary?.map((r,i)=><div key={i} style={{ marginBottom:6 }}><Badge label={r.confidence} color={r.confidence==="Élevée"?C.red:C.amber} size={10}/><div style={{ fontSize:13, color:C.text, marginTop:4 }}>{r.reason}</div></div>)}{result.reasons?.statedVsReal&&<div style={{ marginTop:8, fontSize:12, color:C.textM, fontStyle:"italic" }}><span style={{ color:C.amber }}>{t("exit.reasons.statedVsReal")}</span>{result.reasons.statedVsReal}</div>}</Card>
        <Card><SecHead icon="🎙️" label={t("exit.section.feedback")} color={C.red}/><div style={{ marginBottom:8 }}><Badge label={result.management?.overallSentiment||""} color={SC[result.management?.overallSentiment]||C.textM}/></div><div style={{ fontSize:12, color:C.textM, marginBottom:6 }}>{result.management?.managerImpact}</div><div style={{ fontSize:11, color:C.em }}>{t("exit.management.coachingPrefix")}{result.management?.coachingImplication}</div></Card>
      </div>
      {result.signals?.length>0&&<Card style={{ marginBottom:10 }}><SecHead icon="📡" label={t("exit.section.signals")} color={C.purple}/>{result.signals.map((s,i)=><div key={i} style={{ marginBottom:10, paddingBottom:8, borderBottom:i<result.signals.length-1?`1px solid ${C.border}`:"none" }}><div style={{ display:"flex", gap:6, marginBottom:4 }}><Badge label={s.category} color={C.purple} size={10}/><Badge label={s.breadth} color={s.breadth==="Probablement systémique"?C.red:s.breadth==="Potentiellement récurrent"?C.amber:C.em} size={10}/></div><div style={{ fontSize:13, color:C.text }}>{s.signal}</div><div style={{ fontSize:11, color:C.red, marginTop:3 }}>{t("exit.signals.ifUnaddressed")}{s.ifUnaddressed}</div></div>)}</Card>}
      {result.hrbpActions?.length>0&&<Card><SecHead icon="🎯" label={t("exit.section.actions")} color={C.em}/>{result.hrbpActions.map((a,i)=><div key={i} style={{ display:"flex", gap:8, marginBottom:7 }}><Badge label={a.delay} color={DELAY_C[a.delay]||C.blue} size={10}/><span style={{ fontSize:13, color:C.text }}>{a.action}</span></div>)}</Card>}
    </div>
  );

  return (
    <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ marginBottom:20 }}><div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>{t("exit.title")}</div><div style={{ fontSize:12, color:C.textM }}>{exits.length} {t("exit.subtitle.suffix")}</div></div>
      <Card style={{ marginBottom:20 }}>
        <SecHead icon="🚪" label={t("exit.section.analyze")} color={C.textM}/>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:12 }}>
          {[[t("exit.label.employee"),employeeName,setEmployeeName,t("exit.ph.employee")],[t("exit.label.role"),role,setRole,t("exit.ph.role")],[t("exit.label.tenure"),tenure,setTenure,t("exit.ph.tenure")],[t("exit.label.seniority"),seniority,setSeniority,t("exit.ph.seniority")],[t("exit.label.team"),team,setTeam,t("exit.ph.team")],[t("exit.label.manager"),managerName,setManagerName,t("exit.ph.manager")]].map(([l,v,s,ph],i)=><div key={i}><Mono color={C.textD} size={9}>{l}</Mono><input value={v} onChange={e=>s(e.target.value)} placeholder={ph} style={{ ...css.input, marginTop:6 }} onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/></div>)}
          <div><Mono color={C.textD} size={9}>{t("common.province")}</Mono><ProvinceSelect value={exitProvince} onChange={e=>setExitProvince(e.target.value)} style={{ marginTop:6, width:"100%" }}/></div>
          <div><Mono color={C.textD} size={9}>{t("exit.label.date")}</Mono><input type="date" value={exitDate} onChange={e=>setExitDate(e.target.value)} style={{ ...css.input, marginTop:6 }} onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/></div>
        </div>
        <Mono color={C.textD} size={9}>{t("exit.label.notes")}</Mono>
        <textarea rows={8} value={notes} onChange={e=>setNotes(e.target.value)} placeholder={t("exit.ph.notes")} style={{ ...css.textarea, marginTop:6 }} onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
        {error&&<div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7, padding:"8px 12px", margin:"10px 0", fontSize:12, color:C.red }}>⚠ {error}</div>}
        {loading?<AILoader label={t("exit.loader")}/>:<button onClick={analyze} disabled={notes.trim().length<60} style={{ ...css.btn(C.purple), width:"100%", marginTop:12, opacity:notes.trim().length>=60?1:.4 }}>{t("exit.button.analyze")}</button>}
      </Card>
      {exits.length>0&&<><Mono color={C.textD} size={9}>{t("exit.archivedInterviews")}</Mono><div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:7 }}>{exits.slice().reverse().map((e,i)=>{ const dc=DC[e.result?.summary?.departure_type]||C.textM; return <button key={i} onClick={()=>{ setResult(e.result); setSaved(true); setView("result"); }} style={{ background:C.surfL, border:`1px solid ${dc}28`, borderLeft:`3px solid ${dc}`, borderRadius:8, padding:"12px 14px", cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif" }}><div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}><span style={{ fontSize:13, fontWeight:500, color:C.text }}>{e.result?.summary?.headline}</span><Badge label={e.result?.summary?.departure_type||""} color={dc} size={10}/></div><div style={{ fontSize:11, color:C.textM }}>{e.role} · {e.team} · {e.savedAt}</div></button>; })}</div></>}
    </div>
  );
}
