// Source: HRBP_OS.jsx L.2007-2147
import { useState, useEffect } from "react";
import { C, css, RISK, DELAY_C } from '../theme.js';
import { callAI } from '../api/index.js';
import { normalizeRisk } from '../utils/normalize.js';
import { SIGNAL_SP } from '../prompts/signals.js';
import Badge from '../components/Badge.jsx';
import Card from '../components/Card.jsx';
import Mono from '../components/Mono.jsx';
import AILoader from '../components/AILoader.jsx';
import { useT } from '../lib/i18n.js';

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

export default function ModuleSignals({ data, onSave, focusSignalId, onClearFocus }) {
  const { t } = useT();
  const [view, setView] = useState("list");
  const [signalText, setSignalText] = useState("");
  const [source, setSource] = useState("meeting");
  const [director, setDirector] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(false);
  const [signalPrompt, setSignalPrompt] = useState("");
  const [signalDate, setSignalDate] = useState(() => new Date().toISOString().split("T")[0]);

  // ── Inter-module focus: auto-open a specific signal on mount ────────────────
  useEffect(() => {
    if (!focusSignalId) return;
    const target = (data.signals || []).find(s => s.id === focusSignalId);
    if (target) { setResult(target.analysis); setSaved(true); setView("result"); }
    if (onClearFocus) onClearFocus();
  }, [focusSignalId]); // eslint-disable-line

  const signals = data.signals || [];

  const analyze = async () => {
    if (signalText.trim().length < 20) return;
    setLoading(true); setError(""); setResult(null); setSaved(false);
    try {
      const prompt = `SOURCE: ${source}\nDIRECTEUR/CONTEXTE: ${director||"Non spécifié"}\n\nSIGNAL:\n${signalText}`;
      const parsed = await callAI(SIGNAL_SP, prompt);
      setResult(parsed);
      setView("result");
    } catch(e) { setError("Erreur: " + e.message); }
    finally { setLoading(false); }
  };

  const saveSignal = () => {
    if (!result || saved) return;
    const today = new Date().toISOString().split("T")[0];
    const s = { id:Date.now().toString(), savedAt: signalDate || today, dateCreated: today,
      source, director, signal:signalText, analysis:result };
    onSave("signals", [...signals, s]);
    setSaved(true);
  };

  if (view === "result" && result) return (
    <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <button onClick={() => { setView("list"); setResult(null); setSignalText(""); }}
          style={{ ...css.btn(C.textM, true), padding:"6px 12px", fontSize:11 }}>{t("signals.back")}</button>
        <div style={{ flex:1, fontSize:16, fontWeight:700, color:C.text }}>{result.title}</div>
        <button onClick={saveSignal} disabled={saved} style={{ ...css.btn(saved?C.textD:C.em), padding:"8px 16px", fontSize:12 }}>
          {saved ? t("signals.saved") : t("signals.save")}
        </button>
      </div>

      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        <RiskBadge level={result.severity}/>
        <Badge label={result.category} color={C.purple}/>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <Card>
          <SecHead icon="🔍" label={t("signals.section.interpretation")} color={C.purple}/>
          <div style={{ fontSize:13, color:C.text, lineHeight:1.7 }}>{result.interpretation}</div>
          {result.rootCause && <div style={{ marginTop:10, fontSize:12, color:C.textM }}>
            <span style={{ color:C.amber }}>{t("signals.rootCause")}</span>{result.rootCause}
          </div>}
        </Card>
        <Card>
          <SecHead icon="⚡" label={t("signals.section.verdict")} color={C.em}/>
          <div style={{ fontSize:13, color:C.text, lineHeight:1.7, fontStyle:"italic" }}>{result.verdict}</div>
        </Card>
        {result.actions?.length > 0 && <Card>
          <SecHead icon="🎯" label={t("signals.section.actions")} color={C.em}/>
          {result.actions.map((a,i) => <div key={i} style={{ display:"flex", gap:8, marginBottom:8 }}>
            <Badge label={a.delay} color={DELAY_C[a.delay]||C.blue} size={10}/>
            <span style={{ fontSize:13, color:C.text }}>{a.action}</span>
          </div>)}
        </Card>}
        {result.risks?.length > 0 && <Card>
          <SecHead icon="⚠" label={t("signals.section.risks")} color={C.red}/>
          {result.risks.map((r,i) => <div key={i} style={{ display:"flex", gap:8, marginBottom:6 }}>
            <RiskBadge level={r.level}/>
            <span style={{ fontSize:13, color:C.text }}>{r.risk}</span>
          </div>)}
        </Card>}
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth:820, margin:"0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>{t("signals.title")}</div>
          <div style={{ fontSize:12, color:C.textM }}>{signals.length} · {t("signals.history")}</div>
        </div>
      </div>

      {/* New signal */}
      <Card style={{ marginBottom:20 }}>
        <SecHead icon="📡" label={t("signals.new")} color={C.purple}/>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>
          <div>
            <Mono color={C.textD}>{t("signals.source")}</Mono>
            <select value={source} onChange={e=>setSource(e.target.value)} style={{ ...css.select, marginTop:6 }}>
              {[{v:"meeting",l:t("signals.source.meeting")},{ v:"corridor",l:t("signals.source.corridor")},{v:"slack",l:t("signals.source.slack")},
                {v:"hr_report",l:t("signals.source.hr_report")},{v:"manager",l:t("signals.source.manager")},{v:"other",l:t("signals.source.other")}].map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
          <div>
            <Mono color={C.textD}>{t("signals.directorLabel")}</Mono>
            <input value={director} onChange={e=>setDirector(e.target.value)}
              placeholder={t("signals.directorPh")} style={{ ...css.input, marginTop:6 }}
              onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
          </div>
          <div>
            <Mono color={C.textD}>{t("signals.date")}</Mono>
            <input type="date" value={signalDate} onChange={e=>setSignalDate(e.target.value)}
              style={{ ...css.input, marginTop:6 }}
              onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
          </div>
        </div>
        <Mono color={C.textD}>{t("signals.description")}</Mono>
        <textarea rows={4} value={signalText} onChange={e=>setSignalText(e.target.value)}
          placeholder={t("signals.descriptionPh")}
          style={{ ...css.textarea, marginTop:6 }}
          onFocus={e=>e.target.style.borderColor=C.em+"60"} onBlur={e=>e.target.style.borderColor=C.border}/>
        {error && <div style={{ background:C.red+"15", border:`1px solid ${C.red}33`, borderRadius:7,
          padding:"8px 12px", margin:"10px 0", fontSize:12, color:C.red }}>⚠ {error}</div>}
        {loading ? <AILoader label={t("signals.analyzing")} /> : (
          <button onClick={analyze} disabled={signalText.trim().length<20}
            style={{ ...css.btn(C.purple), width:"100%", marginTop:12, opacity:signalText.trim().length>=20?1:.4 }}>
            {t("signals.analyze")}
          </button>
        )}
      </Card>

      {/* Signal history */}
      {signals.length > 0 && <>
        <Mono color={C.textD} size={9}>{t("signals.history")}</Mono>
        <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:7 }}>
          {signals.slice().reverse().map((s,i) => {
            const r = RISK[s.analysis?.severity]||RISK["Modéré"];
            return <div key={i} onClick={() => { if(s.analysis){ setResult(s.analysis); setSaved(true); setView("result"); } }}
              style={{ background:C.surfL, border:`1px solid ${r.color}28`,
              borderLeft:`3px solid ${r.color}`, borderRadius:8, padding:"12px 14px",
              cursor: s.analysis ? "pointer" : "default", transition:"background .15s" }}
              onMouseEnter={e => { if(s.analysis) e.currentTarget.style.background=C.surfL+"cc"; }}
              onMouseLeave={e => { e.currentTarget.style.background=C.surfL; }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <span style={{ fontSize:13, fontWeight:500, color:C.text }}>{s.analysis?.title||s.signal?.substring(0,50)}</span>
                <RiskBadge level={s.analysis?.severity||"Modéré"}/>
              </div>
              <div style={{ fontSize:11, color:C.textM }}>{s.director && `${s.director} · `}{s.savedAt}</div>
            </div>;
          })}
        </div>
      </>}
    </div>
  );
}
