// ── MODULE: HOME — Cockpit RH ─────────────────────────────────────────────────
import Badge from '../components/Badge.jsx';
import Card  from '../components/Card.jsx';
import Mono  from '../components/Mono.jsx';
import { C, RISK } from '../theme.js';
import { normalizeRisk } from '../utils/normalize.js';

// ── Shared inline helpers ─────────────────────────────────────────────────────
function RiskBadge({ level }) {
  const r = RISK[normalizeRisk(level)] || RISK["Modéré"];
  return <Badge label={level||"—"} color={r.color} />;
}

// Section header
function SH({ icon, label, color, sub }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
      <span style={{ fontSize:12 }}>{icon}</span>
      <Mono size={9} color={color||C.textD}>{label}</Mono>
      {sub && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9,
        color:C.textD, letterSpacing:1.5, textTransform:"uppercase" }}> · {sub}</span>}
    </div>
  );
}

// Row item — clickable or static
function Row({ left, right, sub, accent }) {
  return (
    <div style={{ borderBottom:`1px solid ${C.border}`, padding:"7px 0" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
        <span style={{ fontSize:12, fontWeight:500, color:accent||C.text, lineHeight:1.4, flex:1 }}>{left}</span>
        {right && <div style={{ flexShrink:0, display:"flex", gap:4, alignItems:"center" }}>{right}</div>}
      </div>
      {sub && <div style={{ fontSize:10, color:C.textD, marginTop:3, lineHeight:1.4 }}>{sub}</div>}
    </div>
  );
}

// ── Color maps ────────────────────────────────────────────────────────────────
const URGENCY_C = { "Immediat":C.red, "Cette semaine":C.amber, "Ce mois":C.blue, "En veille":C.textD };
const EVO_C     = {
  // Brief values (no accent)
  "Nouveau":C.blue, "Persistant":C.amber, "Aggrave":C.red,
  "En amelioration":C.teal, "Resolu":C.textD,
  // Cases values (with accent)
  "En cours":C.amber, "Aggravé":C.red, "En amélioration":C.teal,
  "Bloqué":C.red, "Résolu":C.textD,
};
const CLASSIF_C = { "activeRisk":C.amber, "latentSignal":C.blue, "resolved":C.teal };
const PULSE_C   = { "Sain":C.em, "Fragile":C.amber, "Sous tension":C.red, "En crise":"#7a1e2e" };
const SEV_C     = { "Critique":C.red, "Élevé":C.amber, "Eleve":C.amber, "Modéré":C.blue, "Modere":C.blue, "Faible":C.em };

// ── Module ────────────────────────────────────────────────────────────────────
export default function ModuleHome({ data, onNavigate }) {
  // ── Raw collections ─────────────────────────────────────────────────────────
  const cases         = data.cases         || [];
  const signals       = data.signals       || [];
  const prep1on1      = data.prep1on1      || [];
  const briefs        = data.briefs        || [];
  const nextWeekLocks = data.nextWeekLocks || [];

  // ── Dates ───────────────────────────────────────────────────────────────────
  const todayISO    = new Date().toISOString().split("T")[0];
  const today       = new Date();
  const dow         = today.getDay(); // 0=Sun
  const daysToFri   = dow === 0 ? 5 : (6 - dow);
  const fri         = new Date(today); fri.setDate(today.getDate() + daysToFri);
  const endOfWeekISO = fri.toISOString().split("T")[0];

  // ── Last brief ──────────────────────────────────────────────────────────────
  // Saved as { id, savedAt, brief: <result object> }
  const lastBriefEntry = briefs.length > 0 ? briefs[briefs.length - 1] : null;
  const lastBrief      = lastBriefEntry?.brief || null;
  const briefWeekOf    = lastBrief?.weekOf || null;

  // ── Next week lock ──────────────────────────────────────────────────────────
  // Saved as { id, savedAt, lock: <result object> }
  const lastLockEntry = nextWeekLocks.length > 0 ? nextWeekLocks[nextWeekLocks.length - 1] : null;
  const weekTheme     = lastLockEntry?.lock?.theme || null;

  // ── Cases computed ──────────────────────────────────────────────────────────
  const activeCases       = cases.filter(c => c.status !== "closed" && c.status !== "resolved");
  const overdueCases      = activeCases.filter(c => c.dueDate && c.dueDate < todayISO);
  const immediateNotOvdue = activeCases.filter(c =>
    c.urgency === "Immediat" && !(c.dueDate && c.dueDate < todayISO)
  );
  const thisWeekCases     = activeCases.filter(c =>
    c.dueDate && c.dueDate >= todayISO && c.dueDate <= endOfWeekISO
  );

  // Bloc 1 — overdue first, then immediate (deduped), max 4
  const urgentItems = [...overdueCases, ...immediateNotOvdue].slice(0, 4);

  // Bloc 2 — this week + upcoming preps
  const upcomingPreps = prep1on1.filter(p => p.date && p.date >= todayISO && p.date <= endOfWeekISO);

  // Bloc 4 — leadership + retention from lastBrief, max 3 combined
  const lwItems = lastBrief?.leadershipWatch?.slice(0, 2) || [];
  const rwItems = lastBrief?.retentionWatch?.slice(0, Math.max(1, 3 - lwItems.length)) || [];

  // Signals
  const pendingSignals = signals.filter(s => !s.actioned);

  // ── Stats ───────────────────────────────────────────────────────────────────
  const overdueCount   = overdueCases.length;
  const immediateCount = activeCases.filter(c => c.urgency === "Immediat").length;

  // ── Org pulse + banner ──────────────────────────────────────────────────────
  const orgPulse   = lastBrief?.orgPulse?.overall || null;
  const pulseColor = PULSE_C[orgPulse] || C.textD;
  const bannerText = weekTheme || lastBrief?.orgPulse?.signals?.[0] || null;
  const bannerIsLock = !!weekTheme;

  // ── Quick actions ────────────────────────────────────────────────────────────
  const quickActions = [
    { id:"meetings", icon:"🎙️", label:"Analyser réunion", color:C.blue   },
    { id:"cases",    icon:"📂",  label:"Nouveau dossier",  color:C.amber  },
    { id:"signals",  icon:"📡",  label:"Nouveau signal",   color:C.purple },
    { id:"brief",    icon:"📊",  label:"Weekly Brief",     color:C.em     },
    { id:"prep1on1", icon:"🗂️", label:"Préparer 1:1",     color:C.blue   },
  ];

  // ── Empty state check ────────────────────────────────────────────────────────
  const isEmpty = urgentItems.length === 0 && thisWeekCases.length === 0 &&
    upcomingPreps.length === 0 && !lastBrief && pendingSignals.length === 0;

  return (
    <div style={{ maxWidth:920, margin:"0 auto", fontFamily:"'DM Sans',sans-serif" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom:18, paddingTop:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
          <div style={{ fontSize:22, fontWeight:800, color:C.text, letterSpacing:-.5 }}>HRBP OS</div>
          {orgPulse && <Badge label={orgPulse} color={pulseColor}/>}
          {briefWeekOf && (
            <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:C.textD,
              letterSpacing:1.5, textTransform:"uppercase" }}>
              Brief · {briefWeekOf}
            </span>
          )}
          <span style={{ marginLeft:"auto", fontSize:11, color:C.textD }}>
            {new Date().toLocaleDateString("fr-CA",{ weekday:"long", year:"numeric", month:"long", day:"numeric" })}
          </span>
        </div>

        {/* Banner */}
        {bannerText && (
          <div style={{
            marginTop:10,
            background: bannerIsLock ? C.em+"18" : C.amber+"14",
            border:`1px solid ${bannerIsLock ? C.em+"44" : C.amber+"33"}`,
            borderLeft:`3px solid ${bannerIsLock ? C.em : C.amber}`,
            borderRadius:6, padding:"8px 13px",
            display:"flex", alignItems:"baseline", gap:8
          }}>
            <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9,
              color: bannerIsLock ? C.em : C.amber,
              letterSpacing:1.5, textTransform:"uppercase", flexShrink:0 }}>
              {bannerIsLock ? "SEMAINE →" : "ORG SIGNAL →"}
            </span>
            <span style={{ fontSize:12, color:C.text, lineHeight:1.5 }}>{bannerText}</span>
          </div>
        )}
      </div>

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:18 }}>
        {[
          { label:"Dossiers actifs",    value:activeCases.length,    color:C.blue,
            sub:"en cours" },
          { label:"Échéances dépassées",value:overdueCount,          color:overdueCount  >0?C.red  :C.textD,
            sub:overdueCount  >0?"⚠ action requise":"aucune" },
          { label:"Urgences immédiates",value:immediateCount,        color:immediateCount>0?C.red  :C.textD,
            sub:immediateCount>0?"à traiter":"aucune" },
          { label:"Signaux en attente", value:pendingSignals.length, color:pendingSignals.length>0?C.amber:C.textD,
            sub:"non traités" },
        ].map((s,i) => (
          <div key={i} style={{
            background:C.surf,
            border:`1px solid ${s.value>0 ? s.color+"44" : C.border}`,
            borderRadius:8, padding:"12px 14px"
          }}>
            <div style={{ fontSize:24, fontWeight:800, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:10, fontWeight:600, color:C.text, marginTop:2 }}>{s.label}</div>
            <div style={{ fontSize:9, color:C.textD, marginTop:2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Main 2-col grid ────────────────────────────────────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>

        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

          {/* Bloc 1 — Immédiat + Retard */}
          {urgentItems.length > 0 && (
            <Card style={{ borderLeft:`3px solid ${C.red}` }}>
              <SH icon="🔴" label="IMMÉDIAT + RETARD" color={C.red}
                sub={`${urgentItems.length} dossier${urgentItems.length>1?"s":""}`}/>
              {urgentItems.map((c, i) => {
                const isOverdue = c.dueDate && c.dueDate < todayISO;
                const rObj = RISK[normalizeRisk(c.riskLevel)] || RISK["Modéré"];
                return (
                  <Row key={c.id||i}
                    left={c.title}
                    accent={isOverdue ? C.red : (URGENCY_C[c.urgency] || C.text)}
                    right={
                      isOverdue
                        ? <Badge label="⚠ retard" color={C.red} size={9}/>
                        : <Badge label={c.urgency} color={URGENCY_C[c.urgency]||C.textD} size={9}/>
                    }
                    sub={[
                      c.director,
                      isOverdue && c.dueDate ? `Échéance: ${c.dueDate}` : null,
                      c.riskLevel ? c.riskLevel : null,
                    ].filter(Boolean).join(" · ")}
                  />
                );
              })}
            </Card>
          )}

          {/* Bloc 2 — Cette semaine */}
          {(thisWeekCases.length > 0 || upcomingPreps.length > 0) && (
            <Card>
              <SH icon="📅" label="CETTE SEMAINE" color={C.blue}/>
              {[
                ...thisWeekCases.slice(0, 3).map(c => ({
                  _type:"case", id:c.id,
                  left: c.title,
                  sub: [c.dueDate && `📅 ${c.dueDate}`, c.urgency, c.director].filter(Boolean).join(" · "),
                  right: c.urgency
                    ? <Badge label={c.urgency} color={URGENCY_C[c.urgency]||C.textD} size={9}/>
                    : null,
                })),
                ...upcomingPreps.slice(0, 2).map(p => ({
                  _type:"prep", id:p.id,
                  left: `1:1 · ${p.managerName||"Gestionnaire"}`,
                  sub: [p.date, p.meetingType].filter(Boolean).join(" — "),
                  right: <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9,
                    color:C.blue, letterSpacing:1.5, textTransform:"uppercase" }}>PREP</span>,
                })),
              ].slice(0, 4).map((item, i) => (
                <Row key={item.id||i} left={item.left} sub={item.sub} right={item.right}/>
              ))}
            </Card>
          )}

          {/* Bloc 3 — Top priorités brief */}
          {lastBrief?.topPriorities?.length > 0 && (
            <Card>
              <SH icon="📊" label="TOP PRIORITÉS" color={C.em} sub={briefWeekOf||""}/>
              {lastBrief.topPriorities.slice(0, 3).map((p, i) => (
                <Row key={i}
                  left={p.priority}
                  sub={p.why}
                  right={
                    <div style={{ display:"flex", gap:4 }}>
                      {p.urgency && <Badge label={p.urgency} color={C.amber} size={9}/>}
                      {p.evolution && <Badge label={p.evolution} color={EVO_C[p.evolution]||C.textD} size={9}/>}
                      {p.carryOver && <Badge label="↺" color={C.textD} size={9}/>}
                    </div>
                  }
                />
              ))}
            </Card>
          )}

        </div>

        {/* ── Right column ─────────────────────────────────────────────────── */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

          {/* Bloc 4 — Leadership & Rétention */}
          {(lwItems.length > 0 || rwItems.length > 0) && (
            <Card>
              <SH icon="👁" label="LEADERSHIP & RÉTENTION" color={C.amber} sub={briefWeekOf||""}/>
              {lwItems.map((l, i) => (
                <Row key={"lw"+i}
                  left={l.person}
                  sub={[l.signal, l.action].filter(Boolean).join(" → ")}
                  right={l.evolution && <Badge label={l.evolution} color={EVO_C[l.evolution]||C.textD} size={9}/>}
                />
              ))}
              {rwItems.map((r, i) => (
                <Row key={"rw"+i}
                  left={r.profile}
                  sub={[r.lever, r.window && `Fenêtre: ${r.window}`].filter(Boolean).join(" · ")}
                  right={
                    <div style={{ display:"flex", gap:4 }}>
                      <Badge label={r.risk||"—"} color={r.risk==="Critique"?C.red:r.risk==="Élevé"||r.risk==="Eleve"?C.amber:C.textD} size={9}/>
                      {r.window && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9,
                        color:C.textD, letterSpacing:1.5, textTransform:"uppercase" }}>{r.window}</span>}
                    </div>
                  }
                />
              ))}
            </Card>
          )}

          {/* Bloc 5 — Watchlist */}
          {lastBrief?.watchList?.length > 0 && (
            <Card>
              <SH icon="📡" label="WATCHLIST / LATENTS" color={C.blue} sub={briefWeekOf||""}/>
              {lastBrief.watchList.slice(0, 4).map((w, i) => (
                <Row key={i}
                  left={w.subject}
                  sub={w.note}
                  right={
                    <div style={{ display:"flex", gap:4 }}>
                      <Badge label={w.classification} color={CLASSIF_C[w.classification]||C.textD} size={9}/>
                      {w.evolution && <Badge label={w.evolution} color={EVO_C[w.evolution]||C.textD} size={9}/>}
                      {w.carryOver && <Badge label="↺" color={C.textD} size={9}/>}
                    </div>
                  }
                />
              ))}
            </Card>
          )}

          {/* Bloc 6 — Signaux non traités */}
          {pendingSignals.length > 0 && (
            <Card>
              <SH icon="⚡" label="SIGNAUX NON TRAITÉS" color={C.amber}
                sub={`${pendingSignals.length} en attente`}/>
              {pendingSignals.slice(0, 3).map((s, i) => (
                <Row key={s.id||i}
                  left={s.analysis?.title || s.signal?.substring(0, 60) || "Signal"}
                  sub={[s.analysis?.category, s.savedAt].filter(Boolean).join(" · ")}
                  right={s.analysis?.severity
                    ? <Badge label={s.analysis.severity} color={SEV_C[s.analysis.severity]||C.textD} size={9}/>
                    : null}
                />
              ))}
            </Card>
          )}

          {/* Empty state */}
          {isEmpty && (
            <Card style={{ textAlign:"center", padding:"32px 20px" }}>
              <div style={{ fontSize:30, marginBottom:10 }}>🚀</div>
              <div style={{ fontSize:13, color:C.text, fontWeight:600 }}>Bienvenue dans HRBP OS</div>
              <div style={{ fontSize:11, color:C.textD, marginTop:6, lineHeight:1.6 }}>
                Commence par analyser une réunion ou créer un dossier.
              </div>
            </Card>
          )}

        </div>
      </div>

      {/* ── Quick actions ───────────────────────────────────────────────────── */}
      <div style={{ marginTop:16, paddingBottom:8 }}>
        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:C.textD,
          letterSpacing:1.5, textTransform:"uppercase", display:"block", marginBottom:8 }}>
          Actions rapides
        </span>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {quickActions.map(q => (
            <button key={q.id} onClick={() => onNavigate(q.id)}
              style={{ background:C.surf, border:`1px solid ${C.border}`,
                borderRadius:7, padding:"9px 15px", cursor:"pointer",
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
              <span style={{ fontSize:14 }}>{q.icon}</span>
              <span style={{ fontSize:11, fontWeight:600, color:C.text }}>{q.label}</span>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
