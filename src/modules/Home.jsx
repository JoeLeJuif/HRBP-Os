// ── MODULE: HOME — Cockpit HRBP ───────────────────────────────────────────────
import Badge from '../components/Badge.jsx';
import Card  from '../components/Card.jsx';
import Mono  from '../components/Mono.jsx';
import { C, css, RISK } from '../theme.js';
import { normalizeRisk } from '../utils/normalize.js';
import { fmtDate } from '../utils/format.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
const DAY = 86400000;
const daysBetween = (isoA, isoB) => Math.floor((new Date(isoA+"T00:00:00") - new Date(isoB+"T00:00:00")) / DAY);

function SH({ icon, label, color, sub, action }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
      <span style={{ fontSize:12 }}>{icon}</span>
      <Mono size={9} color={color||C.textD}>{label}</Mono>
      {sub && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9,
        color:C.textD, letterSpacing:1.5, textTransform:"uppercase" }}> · {sub}</span>}
      {action && <div style={{ marginLeft:"auto" }}>{action}</div>}
    </div>
  );
}

function Row({ onClick, left, right, sub, accent }) {
  const base = { borderBottom:`1px solid ${C.border}`, padding:"8px 0", cursor:onClick?"pointer":"default", background:"none", border:"none", borderBottomWidth:1, borderBottomStyle:"solid", borderBottomColor:C.border, width:"100%", textAlign:"left", fontFamily:"'DM Sans',sans-serif" };
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} style={base}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
        <span style={{ fontSize:12, fontWeight:500, color:accent||C.text, lineHeight:1.4, flex:1 }}>{left}</span>
        {right && <div style={{ flexShrink:0, display:"flex", gap:4, alignItems:"center" }}>{right}</div>}
      </div>
      {sub && <div style={{ fontSize:10, color:C.textD, marginTop:3, lineHeight:1.4 }}>{sub}</div>}
    </Tag>
  );
}

function Empty({ msg }) {
  return <div style={{ fontSize:11, color:C.textD, fontStyle:"italic", padding:"6px 0" }}>{msg}</div>;
}

// ── Color / label maps ────────────────────────────────────────────────────────
const URGENCY_C = { "Immediat":C.red, "Immédiat":C.red, "Cette semaine":C.amber, "Ce mois":C.blue, "En veille":C.textD };
const SEV_C     = { "Critique":C.red, "Élevé":C.amber, "Eleve":C.amber, "Modéré":C.blue, "Modere":C.blue, "Faible":C.em };
const DEC_RISK_C = { low:C.em, medium:C.amber, high:C.red };
const DEC_RISK_L = { low:"Faible", medium:"Modéré", high:"Élevé" };
const DEC_STATUS_C = { draft:C.textM, decided:C.em, reviewed:C.blue, archived:C.textD };
const DEC_STATUS_L = { draft:"Brouillon", decided:"Décidé", reviewed:"Révisé", archived:"Archivé" };
const DEC_TYPE_L = { discipline:"Discipline", performance:"Performance", organizational:"Organisationnel", talent:"Talent", legal:"Légal", other:"Autre" };

// ── Module ────────────────────────────────────────────────────────────────────
export default function ModuleHome({ data, onNavigate }) {
  const cases     = data.cases     || [];
  const signals   = data.signals   || [];
  const decisions = data.decisions || [];
  const prep1on1  = data.prep1on1  || [];

  const todayISO = new Date().toISOString().split("T")[0];

  // ── Derived collections ────────────────────────────────────────────────────
  const activeCases = cases.filter(c => !["closed","resolved"].includes(c.status));
  const overdueCases = activeCases.filter(c => c.dueDate && c.dueDate < todayISO);
  const pendingSignals = signals.filter(s => !s.actioned);

  const overdueReviews = decisions.filter(d => d.reviewDate && d.reviewDate < todayISO && d.status !== "archived");
  const reviewDueSoon = decisions.filter(d => d.reviewDate && d.reviewDate >= todayISO && daysBetween(d.reviewDate, todayISO) <= 7 && d.status !== "archived");
  const highRiskDecisions = decisions.filter(d => d.riskLevel === "high" && d.status !== "archived");
  const draftDecisions = decisions.filter(d => d.status === "draft");

  const agedSignals = pendingSignals.filter(s => s.savedAt && daysBetween(todayISO, s.savedAt) >= 7);
  const agedCases = activeCases.filter(c => {
    const created = c.createdAt || c.savedAt;
    return created && daysBetween(todayISO, created) >= 14;
  });

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = [
    { label:"Active Cases",    value:activeCases.length,     color:C.blue,  sub:"en cours", nav:"cases" },
    { label:"Overdue Reviews", value:overdueReviews.length,  color:overdueReviews.length>0?C.red:C.textD, sub:overdueReviews.length>0?"⚠ à revoir":"aucun", nav:"decisions" },
    { label:"Urgent Items",    value:overdueCases.length + highRiskDecisions.length, color:(overdueCases.length+highRiskDecisions.length)>0?C.red:C.textD, sub:"high risk / overdue", nav:"cases" },
    { label:"Pending Signals", value:pendingSignals.length,  color:pendingSignals.length>0?C.amber:C.textD, sub:"non traités", nav:"signals" },
  ];

  // ── Focus Today (synthèse courte) ──────────────────────────────────────────
  const focusItems = [];
  if (highRiskDecisions.length > 0)
    focusItems.push({ icon:"⚖", text:`${highRiskDecisions.length} décision${highRiskDecisions.length>1?"s":""} à risque élevé à revoir`, color:C.red, nav:"decisions" });
  if (agedSignals.length > 0)
    focusItems.push({ icon:"📡", text:`${agedSignals.length} signal${agedSignals.length>1?"aux":""} non traité${agedSignals.length>1?"s":""} depuis plus de 7 jours`, color:C.amber, nav:"signals" });
  if (agedCases.length > 0)
    focusItems.push({ icon:"📂", text:`${agedCases.length} dossier${agedCases.length>1?"s":""} actif${agedCases.length>1?"s":""} depuis plus de 14 jours`, color:C.amber, nav:"cases" });
  if (overdueReviews.length > 0)
    focusItems.push({ icon:"🔄", text:`${overdueReviews.length} suivi${overdueReviews.length>1?"s":""} en retard sur le Decision Log`, color:C.red, nav:"decisions" });
  if (overdueCases.length > 0)
    focusItems.push({ icon:"⏰", text:`${overdueCases.length} dossier${overdueCases.length>1?"s":""} avec échéance dépassée`, color:C.red, nav:"cases" });

  const topFocus = focusItems.slice(0, 4);
  const calmState = topFocus.length === 0
    ? (activeCases.length > 0
        ? `Aucun point critique aujourd'hui. ${activeCases.length} dossier${activeCases.length>1?"s":""} actif${activeCases.length>1?"s":""} à suivre cette semaine.`
        : "Aucun point critique aujourd'hui.")
    : null;

  // ── Attention Required ─────────────────────────────────────────────────────
  const attentionItems = [];
  overdueCases.forEach(c => attentionItems.push({
    sortKey:0, type:"case", id:c.id, title:c.title||"(dossier)",
    sub:[c.director, c.dueDate && `échéance ${fmtDate(c.dueDate)}`].filter(Boolean).join(" · "),
    badge:{ label:"⚠ retard", color:C.red }, nav:"cases",
  }));
  overdueReviews.forEach(d => attentionItems.push({
    sortKey:1, type:"decision", id:d.id, title:d.title||"(décision)",
    sub:[d.managerName, `review ${fmtDate(d.reviewDate)}`].filter(Boolean).join(" · "),
    badge:{ label:"Review due", color:C.red }, nav:"decisions",
  }));
  highRiskDecisions.filter(d => !overdueReviews.includes(d)).forEach(d => attentionItems.push({
    sortKey:2, type:"decision", id:d.id, title:d.title||"(décision)",
    sub:[DEC_TYPE_L[d.decisionType]||d.decisionType, d.managerName].filter(Boolean).join(" · "),
    badge:{ label:"Risque élevé", color:C.red }, nav:"decisions",
  }));
  agedSignals.slice(0, 4).forEach(s => attentionItems.push({
    sortKey:3, type:"signal", id:s.id,
    title:s.analysis?.title || (s.signal||"Signal").substring(0, 60),
    sub:[s.analysis?.category, s.savedAt && `il y a ${daysBetween(todayISO, s.savedAt)}j`].filter(Boolean).join(" · "),
    badge:{ label:s.analysis?.severity||"En attente", color:SEV_C[s.analysis?.severity]||C.amber }, nav:"signals",
  }));
  agedCases.filter(c => !overdueCases.includes(c)).slice(0, 3).forEach(c => {
    const age = c.createdAt || c.savedAt;
    attentionItems.push({
      sortKey:4, type:"case", id:c.id, title:c.title||"(dossier)",
      sub:[c.director, age && `ouvert depuis ${daysBetween(todayISO, age)}j`].filter(Boolean).join(" · "),
      badge:{ label:"Aging", color:C.amber }, nav:"cases",
    });
  });
  const attentionTop = attentionItems.sort((a,b)=>a.sortKey-b.sortKey).slice(0, 6);

  // ── Recent Decisions ───────────────────────────────────────────────────────
  const recentDecisions = [...decisions]
    .sort((a,b)=> (b.updatedAt||b.createdAt||b.decisionDate||"").localeCompare(a.updatedAt||a.createdAt||a.decisionDate||""))
    .slice(0, 4);

  // ── Managers to Watch ──────────────────────────────────────────────────────
  const managerMap = new Map();
  const touch = (name, key) => {
    if (!name) return;
    const k = name.trim();
    if (!k) return;
    const cur = managerMap.get(k) || { name:k, cases:0, signals:0, decisions:0, highRisk:0 };
    cur[key]++;
    managerMap.set(k, cur);
  };
  activeCases.forEach(c => touch(c.director, "cases"));
  pendingSignals.forEach(s => {
    const mgr = s.managerName || s.analysis?.person || s.person;
    touch(mgr, "signals");
  });
  decisions.forEach(d => {
    touch(d.managerName, "decisions");
    if (d.riskLevel === "high") {
      const cur = managerMap.get((d.managerName||"").trim());
      if (cur) cur.highRisk++;
    }
  });
  const managers = [...managerMap.values()]
    .map(m => ({ ...m, total:m.cases+m.signals+m.decisions }))
    .filter(m => m.total >= 2 || m.highRisk > 0)
    .sort((a,b) => (b.highRisk-a.highRisk) || (b.total-a.total))
    .slice(0, 5);

  // ── Recommended Actions ────────────────────────────────────────────────────
  const reco = [];
  if (draftDecisions.length > 0)
    reco.push({ icon:"⚖", label:`Compléter ${draftDecisions.length} décision${draftDecisions.length>1?"s":""} en brouillon`, color:C.red, nav:"decisions" });
  if (pendingSignals.length > 0)
    reco.push({ icon:"📡", label:`Traiter ${pendingSignals.length} signal${pendingSignals.length>1?"aux":""} en attente`, color:C.purple, nav:"signals" });
  if (overdueCases.length > 0)
    reco.push({ icon:"📂", label:`Relancer ${overdueCases.length} dossier${overdueCases.length>1?"s":""} en retard`, color:C.amber, nav:"cases" });
  if (prep1on1.length === 0 || !prep1on1.some(p => p.date && p.date >= todayISO))
    reco.push({ icon:"🗂️", label:"Préparer un prochain 1:1", color:C.blue, nav:"prep1on1" });
  reco.push({ icon:"📊", label:"Générer un Weekly Brief", color:C.em, nav:"brief" });
  reco.push({ icon:"🎙️", label:"Analyser une réunion", color:C.blue, nav:"meetings" });
  const recommended = reco.slice(0, 6);

  // ── Summary headline ───────────────────────────────────────────────────────
  const criticalCount = overdueCases.length + overdueReviews.length + highRiskDecisions.length;
  const headline = criticalCount > 0
    ? `${criticalCount} item${criticalCount>1?"s":""} critique${criticalCount>1?"s":""} — ${activeCases.length} dossier${activeCases.length>1?"s":""} actif${activeCases.length>1?"s":""}`
    : `${activeCases.length} dossier${activeCases.length>1?"s":""} actif${activeCases.length>1?"s":""} · ${pendingSignals.length} signal${pendingSignals.length>1?"aux":""} en attente`;

  return (
    <div style={{ maxWidth:1100, margin:"0 auto", fontFamily:"'DM Sans',sans-serif" }}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ marginBottom:16, paddingTop:16 }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:12, flexWrap:"wrap" }}>
          <div style={{ fontSize:22, fontWeight:800, color:C.text, letterSpacing:-.5 }}>HRBP OS</div>
          <div style={{ fontSize:12, color:C.textM }}>{headline}</div>
          <span style={{ marginLeft:"auto", fontSize:11, color:C.textD }}>
            {new Date().toLocaleDateString("fr-CA",{ weekday:"long", year:"numeric", month:"long", day:"numeric" })}
          </span>
        </div>
      </div>

      {/* ── KPI strip ────────────────────────────────────────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:16 }}>
        {kpis.map((s,i) => (
          <button key={i} onClick={()=>onNavigate(s.nav)} style={{
            background:C.surf, border:`1px solid ${s.value>0 ? s.color+"44" : C.border}`,
            borderRadius:8, padding:"12px 14px", textAlign:"left", cursor:"pointer",
            fontFamily:"'DM Sans',sans-serif", transition:"border-color .15s, background .15s" }}
            onMouseEnter={e=>{ e.currentTarget.style.borderColor=s.color; }}
            onMouseLeave={e=>{ e.currentTarget.style.borderColor=s.value>0?s.color+"44":C.border; }}>
            <div style={{ fontSize:24, fontWeight:800, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:10, fontWeight:600, color:C.text, marginTop:2 }}>{s.label}</div>
            <div style={{ fontSize:9, color:C.textD, marginTop:2 }}>{s.sub}</div>
          </button>
        ))}
      </div>

      {/* ── Focus Today ──────────────────────────────────────────────────── */}
      <Card style={{ marginBottom:14, borderLeft:`3px solid ${topFocus.length>0?C.red:C.em}` }}>
        <SH icon="🎯" label="FOCUS TODAY" color={topFocus.length>0?C.red:C.em}/>
        {calmState && <div style={{ fontSize:13, color:C.text, lineHeight:1.5 }}>{calmState}</div>}
        {topFocus.length > 0 && (
          <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
            {topFocus.map((f,i) => (
              <button key={i} onClick={()=>onNavigate(f.nav)} style={{
                display:"flex", alignItems:"center", gap:10, padding:"6px 0",
                background:"none", border:"none", cursor:"pointer", textAlign:"left",
                fontFamily:"'DM Sans',sans-serif", borderBottom: i<topFocus.length-1?`1px solid ${C.border}`:"none" }}>
                <span style={{ fontSize:14 }}>{f.icon}</span>
                <span style={{ fontSize:12, color:C.text, flex:1, lineHeight:1.4 }}>{f.text}</span>
                <span style={{ fontSize:12, color:f.color }}>→</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* ── Main grid ────────────────────────────────────────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>

        {/* Left : Attention Required */}
        <Card>
          <SH icon="⚠" label="ATTENTION REQUIRED" color={C.amber}
            sub={attentionTop.length > 0 ? `${attentionTop.length} item${attentionTop.length>1?"s":""}` : ""}/>
          {attentionTop.length === 0 && <Empty msg="Aucun point critique aujourd'hui."/>}
          {attentionTop.map((it,i) => (
            <Row key={it.type+it.id+i}
              onClick={()=>onNavigate(it.nav)}
              left={it.title}
              sub={it.sub}
              right={<Badge label={it.badge.label} color={it.badge.color} size={9}/>}
            />
          ))}
        </Card>

        {/* Right : Recent Decisions */}
        <Card>
          <SH icon="⚖" label="RECENT DECISIONS" color={C.purple}
            action={decisions.length>0 && <button onClick={()=>onNavigate("decisions")} style={{ background:"none", border:"none", color:C.purple, fontSize:10, cursor:"pointer", fontFamily:"'DM Mono',monospace", letterSpacing:1 }}>VOIR TOUT →</button>}/>
          {recentDecisions.length === 0 && <Empty msg="Aucune décision récente à afficher."/>}
          {recentDecisions.map((d,i) => {
            const isReviewDue = d.reviewDate && d.reviewDate < todayISO;
            const isReviewSoon = reviewDueSoon.includes(d);
            return <Row key={d.id||i}
              onClick={()=>onNavigate("decisions")}
              left={d.title||"(sans titre)"}
              sub={[DEC_TYPE_L[d.decisionType]||d.decisionType, d.managerName, d.decisionDate && fmtDate(d.decisionDate)].filter(Boolean).join(" · ")}
              right={
                <div style={{ display:"flex", gap:4 }}>
                  <Badge label={DEC_RISK_L[d.riskLevel]||"—"} color={DEC_RISK_C[d.riskLevel]||C.textD} size={9}/>
                  <Badge label={DEC_STATUS_L[d.status]||d.status} color={DEC_STATUS_C[d.status]||C.textD} size={9}/>
                  {isReviewDue && <Badge label="Review due" color={C.red} size={9}/>}
                  {!isReviewDue && isReviewSoon && <Badge label="Review 7j" color={C.amber} size={9}/>}
                </div>
              }
            />;
          })}
        </Card>

      </div>

      {/* ── Managers to Watch ────────────────────────────────────────────── */}
      {managers.length > 0 && (
        <Card style={{ marginBottom:14 }}>
          <SH icon="👥" label="MANAGERS TO WATCH" color={C.blue}
            action={<button onClick={()=>onNavigate("portfolio")} style={{ background:"none", border:"none", color:C.blue, fontSize:10, cursor:"pointer", fontFamily:"'DM Mono',monospace", letterSpacing:1 }}>PORTFOLIO →</button>}/>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap:8 }}>
            {managers.map((m,i) => {
              const reason = m.highRisk > 0 ? `${m.highRisk} décision${m.highRisk>1?"s":""} à risque élevé`
                : m.cases >= 2 ? `${m.cases} dossiers actifs`
                : m.signals >= 2 ? `${m.signals} signaux en attente`
                : `${m.total} items actifs`;
              const accent = m.highRisk > 0 ? C.red : m.cases >= 2 ? C.amber : C.blue;
              return (
                <button key={i} onClick={()=>onNavigate("portfolio")} style={{
                  background:C.surfL, border:`1px solid ${accent}28`, borderLeft:`3px solid ${accent}`,
                  borderRadius:8, padding:"10px 12px", cursor:"pointer", textAlign:"left",
                  fontFamily:"'DM Sans',sans-serif" }}>
                  <div style={{ fontSize:12, fontWeight:600, color:C.text, marginBottom:3 }}>{m.name}</div>
                  <div style={{ fontSize:10, color:C.textD, marginBottom:6 }}>{reason}</div>
                  <div style={{ display:"flex", gap:6, fontSize:9, color:C.textM, fontFamily:"'DM Mono',monospace", letterSpacing:.5 }}>
                    <span>{m.cases}C</span>
                    <span>·</span>
                    <span>{m.signals}S</span>
                    <span>·</span>
                    <span>{m.decisions}D</span>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Recommended Actions ──────────────────────────────────────────── */}
      <div style={{ marginBottom:16 }}>
        <div style={{ marginBottom:10 }}>
          <Mono size={9} color={C.textD}>RECOMMENDED ACTIONS</Mono>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {recommended.map((q,i) => (
            <button key={i} onClick={()=>onNavigate(q.nav)}
              style={{ background:C.surf, border:`1px solid ${C.border}`,
                borderRadius:7, padding:"9px 14px", cursor:"pointer",
                fontFamily:"'DM Sans',sans-serif",
                display:"flex", alignItems:"center", gap:7,
                transition:"border-color .15s, background .15s" }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = q.color;
                e.currentTarget.style.background  = q.color + "12";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = C.border;
                e.currentTarget.style.background  = C.surf;
              }}>
              <span style={{ fontSize:13 }}>{q.icon}</span>
              <span style={{ fontSize:11, fontWeight:600, color:C.text }}>{q.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
