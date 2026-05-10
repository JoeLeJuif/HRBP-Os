// Source: HRBP_OS.jsx L.3785-3870
import { useState } from "react";
import { C, css } from '../theme.js';
import { callAI } from '../api/index.js';
import { isLegalSensitive, buildLegalPromptContext } from '../utils/legal.js';
import { normalizeRisk } from '../utils/normalize.js';
import { RISK } from '../theme.js';
import { COACHING_SP } from '../prompts/coaching.js';
import { useT } from '../lib/i18n.js';
import Badge from '../components/Badge.jsx';
import Card from '../components/Card.jsx';
import Mono from '../components/Mono.jsx';
import AILoader from '../components/AILoader.jsx';

// Inline shared helpers (used in multiple modules, to be reviewed at Bloc 7)
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

// Scenario keys — labels resolved via t() at render time so they react to language changes.
const COACHING_SCENARIOS = [
  {id:"perf",       icon:"📉", labelKey:"coaching.scenario.perf",        color:C.amber},
  {id:"conflict",   icon:"⚡", labelKey:"coaching.scenario.conflict",    color:C.red},
  {id:"newmgr",     icon:"🌱", labelKey:"coaching.scenario.newmgr",      color:C.em},
  {id:"delegation", icon:"🔄", labelKey:"coaching.scenario.delegation", color:C.blue},
  {id:"micro",      icon:"🔬", labelKey:"coaching.scenario.micro",       color:C.purple},
  {id:"feedback",   icon:"💬", labelKey:"coaching.scenario.feedback",    color:C.teal},
  {id:"retention",  icon:"✈",  labelKey:"coaching.scenario.retention",  color:C.red},
  {id:"credibility",icon:"🎯", labelKey:"coaching.scenario.credibility", color:C.amber},
];

export default function ModuleCoaching({ data, onSave }) {
  const { t } = useT();
  const [view, setView] = useState("list");
  const [scenario, setScenario] = useState("perf");
  const [managerDesc, setManagerDesc] = useState("");
  const [situation, setSituation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const plans = data.coaching || [];

  const generate = async () => {
    if (situation.trim().length < 30) return;
    const sc = COACHING_SCENARIOS.find(s=>s.id===scenario);
    const _coachProv = data.profile?.defaultProvince || "QC";
    setLoading(true); setError(""); setResult(null); setSaved(false);
    try {
      const _coachLegal = isLegalSensitive(situation + " " + (sc ? t(sc.labelKey) : ""))
        ? `\n${buildLegalPromptContext(_coachProv)}\n` : "";
      const parsed = await callAI(COACHING_SP, `SCÉNARIO: ${sc ? t(sc.labelKey) : ""}\nPROFIL: ${managerDesc||"Non spécifié"}${_coachLegal}\nSITUATION:\n${situation}`);
      setResult(parsed); setView("result");
    } catch(e) { setError(t("coaching.errorPrefix") + e.message); } finally { setLoading(false); }
  };

  const savePlan = () => {
    if (!result || saved) return;
    onSave("coaching", [...plans, { id:Date.now().toString(), savedAt:new Date().toISOString().split("T")[0], scenario, managerDesc, situation, result }]);
    setSaved(true);
  };

  if (view === "result" && result) return (
    <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <button onClick={() => { setView("list"); setResult(null); setSituation(""); }} style={{ ...css.btn(C.textM,true), padding:"6px 12px", fontSize:11 }}>{t("coaching.back")}</button>
        <div style={{ flex:1, fontSize:16, fontWeight:700, color:C.text }}>{result.coachingFocus}</div>
        <button onClick={savePlan} disabled={saved} style={{ ...css.btn(saved?C.textD:C.em), padding:"8px 16px", fontSize:12 }}>{saved?t("coaching.archived"):t("coaching.archive")}</button>
      </div>
      <div style={{ display:"flex", gap:8, marginBottom:14 }}><Badge label={result.managerProfile?.archetype||""} color={C.blue}/><Badge label={result.managerProfile?.maturité||""} color={C.textM}/><Badge label={result.recommendedFramework} color={C.em}/></div>
      <Card style={{ marginBottom:10, borderLeft:`3px solid ${C.purple}` }}><SecHead icon="🧠" label={t("coaching.section.diagnostic")} color={C.purple}/><div style={{ fontSize:13, color:C.text, lineHeight:1.7 }}>{result.managerProfile?.diagnosis}</div><div style={{ marginTop:8, fontSize:12, color:C.textM }}>{t("coaching.frameworkLabel")}<span style={{ color:C.em, fontWeight:600 }}>{result.recommendedFramework}</span> — {result.frameworkRationale}</div></Card>
      <Card style={{ marginBottom:10 }}><SecHead icon="💬" label={t("coaching.section.script")} color={C.teal}/>
        {[[t("coaching.script.opening"),result.conversationScript?.opening,C.em],[t("coaching.script.mainQuestion"),result.conversationScript?.mainQuestion,C.blue],[t("coaching.script.checkIn"),result.conversationScript?.checkIn,C.textM],[t("coaching.script.closing"),result.conversationScript?.closing,C.amber]].map(([l,v,col],i) => v?<div key={i} style={{ marginBottom:10 }}><Mono color={C.textD} size={9}>{l}</Mono><div style={{ fontSize:13, color:col, lineHeight:1.7, marginTop:4, fontStyle:"italic" }}>"{v}"</div></div>:null)}
      </Card>
      <Card style={{ marginBottom:10 }}><SecHead icon="❓" label={t("coaching.section.questions")} color={C.blue}/>
        {result.coachingQuestions?.map((q,i) => <div key={i} style={{ marginBottom:10, paddingBottom:8, borderBottom:i<result.coachingQuestions.length-1?`1px solid ${C.border}`:"none" }}><div style={{ fontSize:13, color:C.text, fontStyle:"italic", marginBottom:4 }}>"{q.question}"</div><div style={{ fontSize:11, color:C.textM }}><span style={{ color:C.em }}>💡 </span>{q.intent}</div></div>)}
      </Card>
      <Card style={{ marginBottom:10 }}><SecHead icon="📅" label={t("coaching.section.followUp")} color={C.amber}/>
        <div style={{ marginBottom:8 }}><Mono color={C.textD} size={9}>{t("coaching.followUp.next")}</Mono><div style={{ fontSize:13, color:C.text, marginTop:4 }}>{result.followUpPlan?.nextCheckIn}</div></div>
        <div style={{ marginBottom:8 }}><Mono color={C.textD} size={9}>{t("coaching.followUp.success")}</Mono>{result.followUpPlan?.successCriteria?.map((s,i)=><div key={i} style={{ display:"flex", gap:8, marginTop:4 }}><div style={{ width:5,height:5,borderRadius:"50%",background:C.em,flexShrink:0,marginTop:6 }}/><span style={{ fontSize:12,color:C.text }}>{s}</span></div>)}</div>
        <div><Mono color={C.textD} size={9}>{t("coaching.followUp.escalation")}</Mono><div style={{ fontSize:12, color:C.red, marginTop:4 }}>{result.followUpPlan?.escalationTrigger}</div></div>
      </Card>
      {result.watchouts?.length>0&&<Card style={{ marginBottom:10, borderLeft:`3px solid ${C.red}` }}><SecHead icon="⚠" label={t("coaching.section.watchouts")} color={C.red}/>{result.watchouts.map((w,i)=><div key={i} style={{ display:"flex", gap:8, marginBottom:6 }}><div style={{ width:5,height:5,borderRadius:"50%",background:C.red,flexShrink:0,marginTop:6 }}/><span style={{ fontSize:12,color:C.text }}>{w}</span></div>)}</Card>}
      {result.hrbpNotes&&<Card style={{ borderLeft:`3px solid ${C.textD}` }}><Mono color={C.textD} size={9}>{t("coaching.section.notes")}</Mono><div style={{ fontSize:12, color:C.textM, fontStyle:"italic", lineHeight:1.65, marginTop:6 }}>{result.hrbpNotes}</div></Card>}
    </div>
  );

  return (
    <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ marginBottom:20 }}><div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>{t("coaching.title")}</div><div style={{ fontSize:12, color:C.textM }}>{plans.length} {t("coaching.subtitle.suffix")}</div></div>
      <Card style={{ marginBottom:20 }}>
        <SecHead icon="🤝" label={t("coaching.section.newPlan")} color={C.teal}/>
        <Mono color={C.textD} size={9}>{t("coaching.label.scenario")}</Mono>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginTop:8, marginBottom:12 }}>
          {COACHING_SCENARIOS.map(s=><button key={s.id} onClick={()=>setScenario(s.id)} style={{ background:scenario===s.id?s.color+"22":"none", color:scenario===s.id?s.color:C.textM, border:`1px solid ${scenario===s.id?s.color+"55":C.border}`, borderRadius:7, padding:"8px 6px", fontSize:11, fontWeight:scenario===s.id?600:400, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", textAlign:"center" }}><div style={{ fontSize:16, marginBottom:3 }}>{s.icon}</div>{t(s.labelKey)}</button>)}
        </div>
        <div style={{ marginBottom:12 }}><Mono color={C.textD} size={9}>{t("coaching.label.managerProfile")}</Mono><input value={managerDesc} onChange={e=>setManagerDesc(e.target.value)} placeholder={t("coaching.ph.managerProfile")} style={{ ...css.input, marginTop:6 }} onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/></div>
        <Mono color={C.textD} size={9}>{t("coaching.label.situation")}</Mono>
        <textarea rows={4} value={situation} onChange={e=>setSituation(e.target.value)} placeholder={t("coaching.ph.situation")} style={{ ...css.textarea, marginTop:6 }} onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
        {error&&<div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7, padding:"8px 12px", margin:"10px 0", fontSize:12, color:C.red }}>⚠ {error}</div>}
        {loading?<AILoader label={t("coaching.loader")}/>:<button onClick={generate} disabled={situation.trim().length<30} style={{ ...css.btn(C.teal), width:"100%", marginTop:12, opacity:situation.trim().length>=30?1:.4 }}>{t("coaching.button.generate")}</button>}
      </Card>
      {plans.length>0&&<><Mono color={C.textD} size={9}>{t("coaching.archivedPlans")}</Mono><div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:7 }}>{plans.slice().reverse().map((p,i)=>{ const sc=COACHING_SCENARIOS.find(s=>s.id===p.scenario); return <button key={i} onClick={()=>{ setResult(p.result); setSaved(true); setView("result"); }} style={{ background:C.surfL, border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 14px", cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", gap:12 }}><span style={{ fontSize:18 }}>{sc?.icon||"🤝"}</span><div style={{ flex:1 }}><div style={{ fontSize:13, color:C.text, fontWeight:500 }}>{p.result?.coachingFocus}</div><div style={{ fontSize:11, color:C.textM }}>{sc?t(sc.labelKey):""} · {p.savedAt}</div></div><Badge label={p.result?.recommendedFramework||""} color={C.em}/></button>; })}</div></>}
    </div>
  );
}
