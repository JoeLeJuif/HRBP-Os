// Source: HRBP_OS.jsx L.5807-6349
import { useState } from "react";
import { C, css } from '../theme.js';
import { callAIJson } from '../api/index.js';
import { fmtDate, normKey } from '../utils/format.js';
import { normalizeRisk, normalizeAIData } from '../utils/normalize.js';
import { RADAR_SP } from '../prompts/radar.js';
import Badge from '../components/Badge.jsx';
import Card from '../components/Card.jsx';
import Mono from '../components/Mono.jsx';
import AILoader from '../components/AILoader.jsx';
import { isCaseActive } from '../utils/caseStatus.js';

export default function ModuleRadar({ data, onSave }) {
  const [radar, setRadar]     = useState(() => (data.radars||[])[0]?.radar || null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [done, setDone]       = useState({});
  const [week, setWeek]       = useState(0);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [actionFeedback, setActionFeedback] = useState({}); // { idx: "portfolio"|"case" }

  const rC = (r) => ({"Critique":C.red,"Élevé":C.amber,"Eleve":C.amber,"Modéré":C.blue,"Modere":C.blue,"Faible":C.em}[r]||C.textD);
  const dC = (d) => ({"Aujourd hui":C.red,"Aujourd'hui":C.red,"Cette semaine":C.amber,"Sous 30 jours":C.blue}[d]||C.blue);
  const savedRadars = data.radars || [];

  const buildContext = () => {
    const cases    = (data.cases||[]).filter(isCaseActive);
    const meetings = (data.meetings||[]).slice().reverse().slice(0,15);
    const signals  = (data.signals||[]).slice().reverse().slice(0,10);
    // Include previous radar pattern counts for trend comparison
    const prevRadar = savedRadars[0]?.radar;
    const prevPatterns = prevRadar?.patternTracking;
    const prevPatternsCtx = prevPatterns?.length
      ? `\nPATTERN TRACKING PRECEDENT (${fmtDate(savedRadars[0]?.savedAt)||"semaine precedente"}):\n${prevPatterns.map(p=>`- ${p.pattern}: ${p.count} ${p.unit} (${p.trend})`).join("\n")}`
      : "";

    return `DATE: ${new Date().toLocaleDateString("fr-CA")}
CAS ACTIFS (${cases.length}):
${cases.map(c=>`- ${c.title} | ${c.type} | ${c.riskLevel} | ${c.situation||""}`).join("\n")||"Aucun."}
MEETINGS (${meetings.length}):
${meetings.map(m=>`- ${m.meetingType} ${m.director||""} (${fmtDate(m.savedAt)}) Risk:${m.analysis?.overallRisk} ${m.analysis?.overallRiskRationale||""}`).join("\n")||"Aucun."}
SIGNAUX (${signals.length}):
${signals.map(s=>`- ${s.analysis?.category} ${s.analysis?.title} (${s.analysis?.severity})`).join("\n")||"Aucun."}${prevPatternsCtx}`;
  };

  const generate = async () => {
    setLoading(true); setError(""); setDone({}); setActionFeedback({});
    try {
      const parsed = await callAIJson(RADAR_SP, `Genere le radar:\n\n${buildContext()}`, 3500);
      const r = normalizeAIData(parsed);
      setRadar(r); setWeek(0);
      const entry = {id:Date.now().toString(), savedAt:new Date().toISOString().split("T")[0], radar:r};
      if (onSave) onSave("radars", [entry,...savedRadars.slice(0,4)]);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const importRadarResponse = (parsed) => {
    const r = normalizeAIData(parsed);
    setRadar(r); setWeek(0);
    const entry = {id:Date.now().toString(), savedAt:new Date().toISOString().split("T")[0], radar:r};
    if (onSave) onSave("radars", [entry,...savedRadars.slice(0,4)]);
  };

  // Push a risk's associated manager to portfolio
  const pushToPortfolio = (r, idx) => {
    const portfolio = data.portfolio || [];
    const identifier = r.identifier || r.source || "";
    // Try to find existing manager entry
    const existing = portfolio.find(m =>
      identifier && normKey(m.name) === normKey(identifier)
    );
    if (existing) {
      // Update risk level
      const updated = portfolio.map(m => m.id===existing.id
        ? {...m, risk: normalizeRisk(r.level)||m.risk, topIssue: r.title||m.topIssue, lastInteraction: new Date().toISOString().split("T")[0]}
        : m
      );
      onSave("portfolio", updated);
      setActionFeedback(f=>({...f, [idx]:"updated"}));
    } else {
      // Create new portfolio entry from risk
      const newMgr = {
        id: Date.now().toString(),
        name: identifier || r.title?.substring(0,20) || "À identifier",
        team: "",
        risk: normalizeRisk(r.level) || "Élevé",
        pressure: "Moderee",
        type: "Solide",
        topIssue: r.title || "",
        hrbpAction: r.urgency ? `Adresser avant: ${r.urgency}` : "",
        lastInteraction: new Date().toISOString().split("T")[0],
        notes: r.description || "",
      };
      onSave("portfolio", [...portfolio, newMgr]);
      setActionFeedback(f=>({...f, [idx]:"added"}));
    }
    setTimeout(() => setActionFeedback(f=>{const n={...f};delete n[idx];return n;}), 3000);
  };

  // Convert risk to case
  const convertToCase = (r, idx) => {
    const cases = data.cases || [];
    const newCase = {
      id: Date.now().toString(),
      title: r.title || "Risque identifié — Org Radar",
      type: r.category==="Performance"?"performance":r.category==="Retention"||r.category==="Rétention"?"retention":"conflict_ee",
      riskLevel: normalizeRisk(r.level) || "Élevé",
      status: "open",
      director: r.identifier || "",
      employee: "",
      department: "",
      openDate: new Date().toISOString().split("T")[0],
      situation: `${r.description || ""}${r.evidence ? "\nPreuve: " + r.evidence : ""}`,
      interventionsDone: "",
      hrPosition: r.urgentAction || "",
      nextFollowUp: "",
      notes: `Créé depuis Org Radar — ${new Date().toLocaleDateString("fr-CA")}`,
      actions: [],
      updatedAt: new Date().toISOString().split("T")[0],
    };
    onSave("cases", [...cases, newCase]);
    setActionFeedback(f=>({...f, [idx]:"case"}));
    setTimeout(() => setActionFeedback(f=>{const n={...f};delete n[idx];return n;}), 3000);
  };

  const displayRadar = week===0 ? radar : savedRadars[week-1]?.radar;
  const riskCount = {Critique:0,Eleve:0,Modere:0};
  (displayRadar?.topRisks||[]).forEach(r=>{
    const k=r.level==="Élevé"||r.level==="Eleve"?"Eleve":r.level==="Modéré"||r.level==="Modere"?"Modere":r.level==="Critique"?"Critique":"Modere";
    if(riskCount[k]!==undefined) riskCount[k]++;
  });

  return (
    <div style={{maxWidth:860,margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <div style={{flex:1}}>
          <span style={{fontSize:16,fontWeight:700,color:C.text}}>Org Radar</span>
          {displayRadar&&<span style={{fontSize:12,color:C.textM,marginLeft:10}}>{displayRadar.weekOf}</span>}
        </div>
        {savedRadars.length>1&&(
          <div style={{display:"flex",gap:4}}>
            {[0,...savedRadars.map((_,i)=>i+1)].slice(0,5).map(i=>(
              <button key={i} onClick={()=>setWeek(i)}
                style={{padding:"4px 10px",borderRadius:5,fontSize:11,cursor:"pointer",
                  fontFamily:"'DM Sans',sans-serif",border:"none",
                  background:week===i?C.em+"22":C.surfL,
                  color:week===i?C.em:C.textD,fontWeight:week===i?700:400}}>
                {i===0?"Actuel":fmtDate(savedRadars[i-1]?.savedAt)||`S-${i}`}
              </button>
            ))}
          </div>
        )}
        {loading?<AILoader label="Analyse…"/>:(
          <button onClick={generate} style={{...css.btn(C.em),padding:"8px 18px",fontSize:12}}>
            🔭 {radar?"Régénérer":"Générer"}
          </button>
        )}
      </div>

      {error&&<div style={{background:C.red+"15",border:`1px solid ${C.red}33`,borderRadius:7,
        padding:"9px 14px",marginBottom:12,fontSize:12,color:C.red}}>⚠ {error}</div>}

      {!displayRadar&&!loading&&(
        <div style={{textAlign:"center",padding:"50px 20px"}}>
          <div style={{fontSize:13,color:C.textM,marginBottom:16}}>
            Génère ton radar hebdomadaire · {(data.cases||[]).filter(isCaseActive).length} cas · {(data.meetings||[]).length} meetings · {(data.signals||[]).length} signaux
          </div>
          <button onClick={generate} style={{...css.btn(C.em),padding:"10px 24px",fontSize:13}}>🔭 Générer le Radar</button>
        </div>
      )}

      {displayRadar&&(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {/* Pulse strip */}
          <div style={{padding:"12px 16px",background:C.surfL,borderRadius:9,
            borderLeft:`4px solid ${rC(displayRadar.overallRisk)}`,
            display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{background:rC(displayRadar.overallRisk)+"22",border:`1px solid ${rC(displayRadar.overallRisk)}44`,
              borderRadius:6,padding:"4px 11px",fontSize:12,fontWeight:700,color:rC(displayRadar.overallRisk),flexShrink:0}}>
              {displayRadar.overallRisk}
            </div>
            <div style={{fontSize:13,color:C.text,flex:1,lineHeight:1.6}}>{displayRadar.executivePulse}</div>
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              {[["Critique",C.red],["Eleve",C.amber],["Modere",C.blue]].map(([k,col])=>
                riskCount[k]>0&&(
                  <div key={k} style={{background:col+"18",border:`1px solid ${col}30`,
                    borderRadius:5,padding:"2px 8px",fontSize:10,color:col,fontWeight:700}}>
                    {riskCount[k]} {k==="Eleve"?"Élevé":k==="Modere"?"Modéré":k}
                  </div>
                )
              )}
            </div>
          </div>

          {/* Theme of the Week */}
          {displayRadar.themeOfWeek && (() => {
            const t = displayRadar.themeOfWeek;
            return (
              <div style={{
                background:`linear-gradient(135deg, ${C.em}0d, ${C.blue}08)`,
                border:`1.5px solid ${C.em}50`,
                borderRadius:10, padding:"16px 18px",
              }}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <span style={{fontSize:16}}>🎯</span>
                  <Mono color={C.em} size={10}>Thème de la semaine</Mono>
                  {t.businessImpact && (
                    <div style={{marginLeft:"auto",fontSize:10,color:C.amber,
                      background:C.amber+"15",border:`1px solid ${C.amber}35`,
                      borderRadius:4,padding:"2px 8px",fontWeight:600,flexShrink:0}}>
                      ⚠ {t.businessImpact}
                    </div>
                  )}
                </div>

                <div style={{fontSize:18,fontWeight:800,color:C.text,marginBottom:8,lineHeight:1.2}}>
                  {t.theme}
                </div>

                <div style={{fontSize:13,color:C.textM,lineHeight:1.65,marginBottom:12,
                  paddingLeft:10,borderLeft:`3px solid ${C.em}40`}}>
                  {t.why}
                </div>

                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {(t.focus||[]).map((f,i) => (
                    <div key={i} style={{display:"flex",gap:9,alignItems:"flex-start"}}>
                      <div style={{width:18,height:18,background:C.em,borderRadius:"50%",
                        flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:10,fontWeight:800,color:C.bg,marginTop:1}}>{i+1}</div>
                      <span style={{fontSize:13,color:C.text,lineHeight:1.6}}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Risks */}
          <Card>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <Mono color={C.red} size={9}>Risques prioritaires</Mono>
              <span style={{fontSize:11,color:C.textD}}>
                {Object.values(done).filter(Boolean).length}/{displayRadar.topRisks?.length||0} traités
              </span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {(displayRadar.topRisks||[]).map((r,i)=>{
                const rc=rC(r.level); const isDone=done[i];
                const fb=actionFeedback[i];
                const TREND={"Hausse":"↑","Stable":"→","Baisse":"↓"};
                const TC={"Hausse":C.red,"Stable":C.textD,"Baisse":C.em};
                // Determine action: if has manager identifier -> portfolio, else -> case
                const hasManager = !!(r.identifier||r.source);
                return (
                  <div key={i} style={{display:"flex",gap:10,padding:"9px 11px",
                    background:isDone?C.surfLL+"80":C.surfLL,
                    borderRadius:8,borderLeft:`3px solid ${isDone?C.textD:rc}`,
                    opacity:isDone?0.5:1,alignItems:"flex-start"}}>
                    <button onClick={()=>setDone(d=>({...d,[i]:!d[i]}))}
                      style={{width:18,height:18,borderRadius:"50%",flexShrink:0,
                        border:`2px solid ${isDone?C.em:rc}`,background:isDone?C.em:"none",
                        cursor:"pointer",marginTop:2,display:"flex",alignItems:"center",
                        justifyContent:"center",fontSize:10,color:"#fff"}}>
                      {isDone?"✓":""}
                    </button>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:3,flexWrap:"wrap"}}>
                        <div style={{background:rc+"20",border:`1px solid ${rc}35`,
                          borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700,color:rc}}>{r.level}</div>
                        <Badge label={r.category} color={C.textD} size={9}/>
                        {r.trend&&<span style={{fontSize:11,color:TC[r.trend],fontWeight:700}}>{TREND[r.trend]} {r.trend}</span>}
                        {r.urgency&&(
                          <div style={{background:dC(r.urgency)+"18",border:`1px solid ${dC(r.urgency)}35`,
                            borderRadius:4,padding:"1px 6px",fontSize:9,color:dC(r.urgency),fontWeight:700}}>
                            {r.urgency}
                          </div>
                        )}
                      </div>
                      <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:3}}>{r.title}</div>
                      <div style={{fontSize:12,color:C.textM,lineHeight:1.55}}>{r.description}</div>
                      {r.evidence&&<div style={{fontSize:11,color:C.textD,marginTop:3}}>→ {r.evidence}</div>}
                    </div>
                    {/* Single action button */}
                    {!isDone&&(
                      <div style={{flexShrink:0}}>
                        {fb?(
                          <div style={{fontSize:10,color:C.em,padding:"4px 8px",fontWeight:600,whiteSpace:"nowrap"}}>
                            {fb==="case"?"✓ Cas créé":fb==="added"?"✓ Ajouté":"✓ Mis à jour"}
                          </div>
                        ):(
                          <button
                            onClick={()=>hasManager?pushToPortfolio(r,i):convertToCase(r,i)}
                            title={hasManager?"Pousser vers Portfolio":"Convertir en cas"}
                            style={{padding:"4px 10px",borderRadius:5,fontSize:10,cursor:"pointer",
                              fontFamily:"'DM Sans',sans-serif",fontWeight:600,
                              background:hasManager?C.teal+"18":C.amber+"18",
                              border:`1px solid ${hasManager?C.teal+"44":C.amber+"44"}`,
                              color:hasManager?C.teal:C.amber,whiteSpace:"nowrap"}}>
                            {hasManager?"→ Portfolio":"→ Cas"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Managers + Patterns — 2 col */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Card>
              <Mono color={C.amber} size={9} style={{display:"block",marginBottom:10}}>Managers à risque</Mono>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {(displayRadar.managersAtRisk||[]).map((m,i)=>{
                  const rc=rC(m.riskLevel);
                  const PTYPES={avoidant:"🫥",toxic_performer:"⚡",overloaded:"🔥",misaligned:"🔀",political:"🎭"};
                  const portfolio=data.portfolio||[];
                  const inPortfolio=portfolio.some(p=>m.identifier&&normKey(p.name)===normKey(m.identifier));
                  return (
                    <div key={i} style={{padding:"9px 11px",background:C.surfLL,borderRadius:8,borderLeft:`3px solid ${rc}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                        <span style={{fontSize:13,fontWeight:600,color:C.text}}>
                          {PTYPES[m.pattern]||""} {m.identifier}
                          {m.team&&<span style={{fontSize:11,color:C.textM,fontWeight:400,marginLeft:6}}>{m.team}</span>}
                        </span>
                        <div style={{display:"flex",gap:5,alignItems:"center",flexShrink:0}}>
                          <div style={{background:rc+"20",border:`1px solid ${rc}40`,
                            borderRadius:5,padding:"2px 7px",fontSize:10,fontWeight:700,color:rc}}>{m.riskLevel}</div>
                          <button onClick={()=>{
                            const radarRisk={...m,title:m.mainSignal,description:m.urgentAction,level:m.riskLevel};
                            pushToPortfolio(radarRisk,-1000-i);
                          }}
                            style={{padding:"3px 8px",borderRadius:5,fontSize:10,cursor:"pointer",
                              fontFamily:"'DM Sans',sans-serif",
                              background:inPortfolio?C.em+"18":C.teal+"18",
                              border:`1px solid ${inPortfolio?C.em+"44":C.teal+"44"}`,
                              color:inPortfolio?C.em:C.teal,fontWeight:600}}>
                            {actionFeedback[-1000-i]?"✓":(inPortfolio?"↑ Portf.":"→ Portf.")}
                          </button>
                        </div>
                      </div>
                      <div style={{fontSize:12,color:C.textM,lineHeight:1.55,marginBottom:4}}>{m.mainSignal}</div>
                      {m.urgentAction&&<div style={{fontSize:11,color:C.em}}>→ {m.urgentAction}</div>}
                    </div>
                  );
                })}
              </div>
            </Card>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <Card>
                <Mono color={C.purple} size={9} style={{display:"block",marginBottom:10}}>Patterns</Mono>
                <div style={{display:"flex",flexDirection:"column",gap:7}}>
                  {(displayRadar.orgPatterns||[]).map((p,i)=>{
                    const rc=rC(p.severity);
                    return (
                      <div key={i} style={{paddingLeft:10,borderLeft:`3px solid ${C.purple}`}}>
                        <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:3}}>
                          <span style={{fontSize:12,fontWeight:600,color:C.text}}>{p.pattern}</span>
                          <div style={{background:rc+"18",borderRadius:4,padding:"1px 6px",fontSize:9,color:rc,fontWeight:700}}>{p.severity}</div>
                        </div>
                        <div style={{fontSize:12,color:C.textM,lineHeight:1.55}}>{p.description}</div>
                      </div>
                    );
                  })}
                </div>
              </Card>
              {displayRadar.positiveSignals?.length>0&&(
                <Card>
                  <Mono color={C.em} size={9} style={{display:"block",marginBottom:8}}>Positifs</Mono>
                  {displayRadar.positiveSignals.map((s,i)=>(
                    <div key={i} style={{fontSize:12,color:C.textM,display:"flex",gap:7,marginBottom:5}}>
                      <span style={{color:C.em,flexShrink:0}}>✓</span>{s}
                    </div>
                  ))}
                </Card>
              )}
            </div>
          </div>

          {/* Pattern Tracking */}
          {displayRadar.patternTracking?.length > 0 && (() => {
            const TREND_META = {
              "Hausse": { icon:"↑", color:C.red },
              "Stable": { icon:"→", color:C.textD },
              "Baisse": { icon:"↓", color:C.em },
            };
            const sev_c = (s) => ({"Critique":C.red,"Eleve":C.amber,"Élevé":C.amber,"Modere":C.blue,"Modéré":C.blue,"Faible":C.em}[s]||C.textD);
            const hasPrev = savedRadars.length > (week===0?1:week+1);
            return (
              <div style={{background:C.surfL,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 18px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <Mono color={C.purple} size={9}>📊 Pattern Tracking</Mono>
                    {hasPrev && (
                      <div style={{background:C.purple+"15",border:`1px solid ${C.purple}30`,
                        borderRadius:4,padding:"1px 7px",fontSize:9,color:C.purple,fontWeight:600}}>
                        vs semaine précédente
                      </div>
                    )}
                  </div>
                  <span style={{fontSize:11,color:C.textD}}>{displayRadar.patternTracking.length} patterns</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:0}}>
                  {displayRadar.patternTracking
                    .sort((a,b)=>({"Critique":0,"Eleve":1,"Modere":2,"Faible":3}[a.severity]||9)-({"Critique":0,"Eleve":1,"Modere":2,"Faible":3}[b.severity]||9))
                    .map((p,i)=>{
                      const tm = TREND_META[p.trend] || {icon:"→",color:C.textD};
                      const sc = sev_c(p.severity);
                      const isLast = i===displayRadar.patternTracking.length-1;
                      return (
                        <div key={i} style={{
                          display:"flex",gap:10,alignItems:"flex-start",
                          padding:"8px 0",
                          borderBottom: isLast ? "none" : `1px solid ${C.border}`,
                        }}>
                          {/* Trend indicator */}
                          <div style={{
                            width:28,flexShrink:0,display:"flex",alignItems:"center",
                            justifyContent:"center",paddingTop:1
                          }}>
                            <span style={{fontSize:15,fontWeight:800,color:tm.color,lineHeight:1}}>{tm.icon}</span>
                          </div>
                          {/* Pattern name + count */}
                          <div style={{flex:"0 0 auto",minWidth:0}}>
                            <span style={{fontSize:13,fontWeight:600,color:C.text}}>{p.pattern}</span>
                            <span style={{
                              fontSize:12,color:sc,fontWeight:700,
                              marginLeft:8,
                              background:sc+"15",border:`1px solid ${sc}30`,
                              borderRadius:4,padding:"0px 6px"
                            }}>{p.count} {p.unit}</span>
                          </div>
                          {/* Trend detail */}
                          <div style={{flex:1,fontSize:12,color:C.textM,lineHeight:1.55,paddingTop:1}}>
                            {p.trendDetail}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })()}

          {/* Actions */}
          <Card style={{borderLeft:`3px solid ${C.em}`}}>
            <Mono color={C.em} size={9} style={{display:"block",marginBottom:10}}>Actions HRBP — 7 jours</Mono>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {(displayRadar.hrbpActions||[])
                .sort((a,b)=>({"Critique":0,"Elevee":1,"Élevée":1,"Normale":2}[a.priority]||9)-({"Critique":0,"Elevee":1,"Élevée":1,"Normale":2}[b.priority]||9))
                .map((a,i)=>{
                  const dc=dC(a.delay);
                  const pc=a.priority==="Critique"?C.red:a.priority==="Elevee"||a.priority==="Élevée"?C.amber:C.textD;
                  return (
                    <div key={i} style={{display:"flex",gap:8,alignItems:"baseline",
                      padding:"7px 10px",background:C.surfLL,borderRadius:7}}>
                      <div style={{background:dc+"18",border:`1px solid ${dc}35`,
                        color:dc,borderRadius:5,padding:"2px 7px",fontSize:9,
                        fontWeight:700,flexShrink:0,whiteSpace:"nowrap"}}>{a.delay}</div>
                      <div style={{fontSize:13,color:C.text,flex:1,lineHeight:1.55}}>{a.action}</div>
                      <Badge label={a.category} color={pc} size={9}/>
                    </div>
                  );
                })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
