// ── Module: Auto Prompt Engine ────────────────────────────────────────────────
// Source: HRBP_OS.jsx L.8553–9381
// Extraction fidèle — aucune modification de logique

import { useState } from "react";
import { C, css } from '../theme.js';
import Mono from '../components/Mono.jsx';
import { APE_TEMPLATES, detectSituations } from '../utils/situations.js';


// ── Module ────────────────────────────────────────────────────────────────────
export default function ModuleAutoPrompt({ data }) {
  const [selected, setSelected]   = useState(null);   // selected situation
  const [mode, setMode]           = useState(null);   // diagnose|act|say
  const [generated, setGenerated] = useState("");
  const [copied, setCopied]       = useState(false);
  const [variant, setVariant]     = useState(null);   // stronger|direct|executive

  const situations = detectSituations(data);
  const riskC = (r) => ({"Critique":C.red,"Élevé":C.amber,"Eleve":C.amber,"Modéré":C.blue,"Modere":C.blue,"Faible":C.em}[r]||C.textD);

  const generate = (sit, m, vari) => {
    const tpl = APE_TEMPLATES[sit.template];
    if (!tpl) return;
    let base = tpl[m]?.(sit.context) || "";
    if (!base) { setGenerated("Mode non disponible pour ce template."); return; }
    if (vari === "stronger") base += "\n\nSois encore plus direct. Moins de nuances. Plus de conséquences. Ne m'épargne pas.";
    if (vari === "direct")   base += "\n\nRéduis de 30%. Coupe tout ce qui n'est pas actionnable. Reste uniquement les faits et les actes.";
    if (vari === "executive") base += "\n\nReformule pour un VP ou CODIR. Langage business, pas RH. Enjeu organisationnel en premier. Recommandation courte et nette.";
    setGenerated(base);
    setMode(m);
    setVariant(vari||null);
  };

  const selectSit = (sit) => {
    setSelected(sit);
    setGenerated("");
    setMode(null);
    setVariant(null);
  };

  const copy = () => {
    if (!generated) return;
    const ta = document.createElement("textarea");
    ta.value = generated; ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const tpl = selected ? APE_TEMPLATES[selected.template] : null;
  const availableModes = tpl ? ["diagnose","act","say"].filter(m => !!tpl[m]) : [];

  const MODE_META = {
    diagnose: { label:"🔍 Diagnose", desc:"Lire la situation en profondeur", color:C.purple },
    act:      { label:"🎯 Act",      desc:"Plan d'action ou prochaines étapes",  color:C.em },
    say:      { label:"💬 Say",      desc:"Formulation exacte pour la conversation", color:C.blue },
  };

  const URGENCY_C = (u) => ({"Critique":C.red,"Élevé":C.amber,"Eleve":C.amber,"Modéré":C.blue,"Modere":C.blue}[u]||C.textD);

  return (
    <div style={{ maxWidth:900, margin:"0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom:18 }}>
        <div style={{ fontSize:16, fontWeight:700, color:C.text }}>Auto Prompt Engine</div>
        <div style={{ fontSize:12, color:C.textM }}>
          Contexte détecté automatiquement · {situations.length} situation{situations.length!==1?"s":""} identifiée{situations.length!==1?"s":""}
        </div>
      </div>

      {/* Empty state */}
      {situations.length === 0 && (
        <div style={{ textAlign:"center", padding:"60px 20px", color:C.textD }}>
          <div style={{ fontSize:36, marginBottom:14 }}>🔍</div>
          <div style={{ fontSize:14, color:C.textM, marginBottom:6 }}>Aucune situation détectée</div>
          <div style={{ fontSize:12, color:C.textD, maxWidth:380, margin:"0 auto" }}>
            Alimente le OS — ajoute des cas, des meetings, des signaux ou génère un Org Radar pour que le moteur détecte des situations.
          </div>
        </div>
      )}

      {situations.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns: selected ? "320px 1fr" : "1fr", gap:14 }}>

          {/* Left — situation list */}
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            {selected && <Mono color={C.textD} size={8} style={{ display:"block", marginBottom:4 }}>SITUATIONS DÉTECTÉES</Mono>}
            {situations.map((sit, i) => {
              const isSelected = selected?.id === sit.id;
              const uc = URGENCY_C(sit.urgency);
              return (
                <button key={sit.id} onClick={() => selectSit(sit)}
                  style={{ display:"flex", gap:10, alignItems:"flex-start",
                    padding:"10px 12px", borderRadius:8, cursor:"pointer",
                    textAlign:"left", fontFamily:"'DM Sans',sans-serif",
                    background: isSelected ? sit.color+"15" : C.surfL,
                    border:`1px solid ${isSelected ? sit.color+"66" : C.border}`,
                    borderLeft:`3px solid ${isSelected ? sit.color : uc}` }}>
                  <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>{sit.icon}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{sit.title}</div>
                      {sit.confidence && (() => {
                        const cc = {"Élevée":C.em,"Moyenne":C.amber,"Faible":C.textD}[sit.confidence]||C.textD;
                        return <div style={{ background:cc+"18", border:`1px solid ${cc}35`,
                          borderRadius:4, padding:"1px 5px", fontSize:8, color:cc,
                          fontWeight:700, flexShrink:0 }}>
                          {sit.confidence==="Élevée"?"✓ Élevée":sit.confidence==="Moyenne"?"~ Moyenne":"? Faible"}
                        </div>;
                      })()}
                    </div>
                    {sit.whyNow && (
                      <div style={{ fontSize:11, color:C.amber, lineHeight:1.5, marginBottom:4,
                        overflow:"hidden", textOverflow:"ellipsis",
                        display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>
                        ⏱ {sit.whyNow}
                      </div>
                    )}
                    <div style={{ display:"flex", gap:5, marginTop:4, flexWrap:"wrap" }}>
                      <div style={{ background:uc+"18", border:`1px solid ${uc}35`,
                        borderRadius:4, padding:"1px 6px", fontSize:9, color:uc, fontWeight:700 }}>
                        {sit.urgency}
                      </div>
                      <Mono color={C.textD} size={8}>{sit.source}</Mono>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right — generator */}
          {selected && (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {/* Situation detail */}
              <div style={{ padding:"12px 14px", background:selected.color+"0d",
                border:`1px solid ${selected.color}35`, borderRadius:9,
                borderLeft:`4px solid ${selected.color}` }}>
                <div style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:8 }}>
                  <span style={{ fontSize:20 }}>{selected.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:2 }}>{selected.title}</div>
                    <div style={{ fontSize:12, color:C.textM, lineHeight:1.6 }}>{selected.reason}</div>
                  </div>
                  <button onClick={() => { setSelected(null); setGenerated(""); setMode(null); }}
                    style={{ background:"none", border:"none", cursor:"pointer", color:C.textD,
                      fontSize:14, padding:"2px 4px", flexShrink:0 }}>✕</button>
                </div>
                {/* Evidence */}
                {selected.evidence?.length > 0 && (
                  <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:3 }}>
                    {selected.evidence.map((e,i) => (
                      <div key={i} style={{ display:"flex", gap:7, alignItems:"baseline" }}>
                        <span style={{ color:selected.color, fontSize:10, flexShrink:0 }}>·</span>
                        <span style={{ fontSize:11, color:C.textD }}>{e}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Best next move */}
              {selected.bestNextMove && (
                <div style={{ display:"flex", gap:10, alignItems:"flex-start",
                  padding:"10px 14px", background:C.em+"0d",
                  border:`1px solid ${C.em}30`, borderRadius:8 }}>
                  <div style={{ width:22, height:22, background:C.em, borderRadius:5,
                    flexShrink:0, display:"flex", alignItems:"center",
                    justifyContent:"center", fontSize:12, marginTop:1 }}>→</div>
                  <div>
                    <Mono color={C.em} size={8} style={{ display:"block", marginBottom:4 }}>MEILLEUR MOVE EN 10 MINUTES</Mono>
                    <div style={{ fontSize:13, color:C.text, lineHeight:1.65 }}>{selected.bestNextMove}</div>
                  </div>
                </div>
              )}

              {/* Mode selector */}
              <div>
                <Mono color={C.textD} size={8} style={{ display:"block", marginBottom:6 }}>CHOISIR LE MODE</Mono>
                <div style={{ display:"flex", gap:6 }}>
                  {["diagnose","act","say"].map(m => {
                    const meta = MODE_META[m];
                    const avail = availableModes.includes(m);
                    const isActive = mode===m;
                    return (
                      <button key={m}
                        onClick={() => avail && generate(selected, m, null)}
                        disabled={!avail}
                        style={{ flex:1, padding:"10px 8px", borderRadius:8, cursor:avail?"pointer":"not-allowed",
                          fontFamily:"'DM Sans',sans-serif", border:"none",
                          background: isActive ? meta.color : avail ? meta.color+"15" : C.surfLL,
                          color: isActive ? "#fff" : avail ? meta.color : C.textD,
                          opacity: avail ? 1 : 0.35 }}>
                          <div style={{ fontSize:14, marginBottom:3 }}>{meta.label.split(" ")[0]}</div>
                          <div style={{ fontSize:11, fontWeight:700 }}>{meta.label.split(" ").slice(1).join(" ")}</div>
                          <div style={{ fontSize:9, marginTop:2, opacity:0.75,
                            color: isActive?"#fff":meta.color }}>{meta.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Generated prompt */}
              {generated && (
                <div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                    <Mono color={C.textD} size={8}>PROMPT GÉNÉRÉ — PRÊT À COLLER</Mono>
                    <div style={{ display:"flex", gap:5 }}>
                      {/* Variants */}
                      {[
                        {id:"stronger",  label:"⬆ Plus fort"},
                        {id:"direct",    label:"✂ Plus court"},
                        {id:"executive", label:"🎙️ Exec"},
                      ].map(v=>(
                        <button key={v.id}
                          onClick={() => generate(selected, mode, v.id)}
                          style={{ padding:"3px 9px", borderRadius:5, fontSize:10,
                            cursor:"pointer", fontFamily:"'DM Sans',sans-serif",
                            background: variant===v.id ? C.purple+"22" : C.surfLL,
                            border:`1px solid ${variant===v.id ? C.purple+"55" : C.border}`,
                            color: variant===v.id ? C.purple : C.textD }}>
                          {v.label}
                        </button>
                      ))}
                      <button onClick={copy}
                        style={{ ...css.btn(copied?C.em:C.blue),
                          padding:"4px 14px", fontSize:11 }}>
                        {copied ? "✓ Copié" : "📋 Copier"}
                      </button>
                    </div>
                  </div>
                  <div style={{ background:C.bg, border:`1px solid ${C.border}`,
                    borderRadius:8, padding:"13px 15px", fontSize:12, color:C.textM,
                    lineHeight:1.8, whiteSpace:"pre-wrap",
                    fontFamily:"'DM Mono',monospace", maxHeight:380, overflowY:"auto" }}>
                    {generated}
                  </div>
                </div>
              )}

              {/* No mode selected hint */}
              {!generated && (
                <div style={{ textAlign:"center", padding:"30px 20px",
                  color:C.textD, fontSize:12,
                  background:C.surfL, borderRadius:8,
                  border:`1px solid ${C.border}` }}>
                  Choisis un mode ci-dessus pour générer le prompt
                </div>
              )}
            </div>
          )}

          {/* No selection hint when list is shown full-width */}
          {!selected && situations.length > 0 && (
            <div style={{ marginTop:8, textAlign:"center", padding:"20px",
              color:C.textD, fontSize:12 }}>
              Sélectionne une situation pour générer le prompt
            </div>
          )}
        </div>
      )}
    </div>
  );
}
