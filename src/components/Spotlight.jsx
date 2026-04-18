// ── Spotlight — Global search (Cmd/Ctrl+K) ──────────────────────────────────
// Recherche rapide sur cases / meetings / decisions / investigations.
// Ouvre l'item via onNavigate(module, { focus*Id }).

import { useState, useEffect, useMemo, useRef } from "react";
import { C, css } from '../theme.js';
import Mono from './Mono.jsx';

const TYPE_META = {
  case:          { label:"Case",     color:C.blue,   module:"cases",         focusKey:"focusCaseId" },
  meeting:       { label:"Meeting",  color:C.em,     module:"meetings",      focusKey:"focusMeetingId" },
  decision:      { label:"Décision", color:C.red,    module:"decisions",     focusKey:"focusDecisionId" },
  investigation: { label:"Enquête",  color:"#7a1e2e",module:"investigation", focusKey:"focusInvestigationId" },
};

function normalize(data) {
  const out = [];
  (data?.cases || []).forEach(c => {
    if (!c?.id) return;
    out.push({
      id: c.id,
      type: "case",
      label: c.title || "(cas sans titre)",
      meta: [c.director, c.employee].filter(Boolean).join(" · "),
    });
  });
  (data?.meetings || []).forEach(m => {
    if (!m?.id) return;
    out.push({
      id: m.id,
      type: "meeting",
      label: m.analysis?.meetingTitle || m.title || "(meeting sans titre)",
      meta: [m.director, m.savedAt].filter(Boolean).join(" · "),
    });
  });
  (data?.decisions || []).forEach(d => {
    if (!d?.id) return;
    out.push({
      id: d.id,
      type: "decision",
      label: d.title || "(décision sans titre)",
      meta: d.decisionDate || d.createdAt || "",
    });
  });
  (data?.investigations || []).forEach(i => {
    if (!i?.id) return;
    out.push({
      id: i.id,
      type: "investigation",
      label: i.title || "(enquête sans titre)",
      meta: i.savedAt || i.createdAt || "",
    });
  });
  return out;
}

export default function Spotlight({ data, onNavigate }) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const [sel, setSel]     = useState(0);
  const inputRef = useRef(null);

  // Toggle on Cmd/Ctrl+K, close on Escape
  useEffect(() => {
    const onKey = (e) => {
      const isK = (e.key === "k" || e.key === "K");
      if ((e.metaKey || e.ctrlKey) && isK) {
        e.preventDefault();
        setOpen(o => !o);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Reset state when closing; focus input when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const items = useMemo(() => normalize(data), [data]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 30);
    return items.filter(it => {
      const hay = (it.label + " " + (it.meta || "")).toLowerCase();
      return hay.includes(q);
    }).slice(0, 30);
  }, [items, query]);

  // Keep selection in range
  useEffect(() => { if (sel >= results.length) setSel(0); }, [results, sel]);

  const choose = (it) => {
    if (!it) return;
    const meta = TYPE_META[it.type];
    if (!meta) return;
    onNavigate?.(meta.module, { [meta.focusKey]: it.id });
    setOpen(false);
  };

  const onInputKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => Math.min(s+1, Math.max(0, results.length-1))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel(s => Math.max(s-1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(results[sel]); }
  };

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      style={{ position:"fixed", inset:0, background:"#00000088", zIndex:10000,
        display:"flex", alignItems:"flex-start", justifyContent:"center", paddingTop:"15vh",
        fontFamily:"'DM Sans',sans-serif" }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width:560, maxWidth:"90vw", background:C.surf,
          border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden",
          boxShadow:"0 20px 60px #0008" }}>
        <div style={{ padding:"10px 12px", borderBottom:`1px solid ${C.border}`,
          display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:14 }}>🔍</span>
          <input ref={inputRef} value={query}
            onChange={e => { setQuery(e.target.value); setSel(0); }}
            onKeyDown={onInputKey}
            placeholder="Rechercher cas, meetings, décisions, enquêtes…"
            style={{ ...css.input, background:"transparent", border:"none", padding:0, fontSize:14 }} />
          <Mono color={C.textD} size={8}>ESC</Mono>
        </div>
        <div style={{ maxHeight:"50vh", overflowY:"auto" }}>
          {results.length === 0 ? (
            <div style={{ padding:"24px 16px", textAlign:"center", color:C.textD, fontSize:12 }}>
              Aucun résultat
            </div>
          ) : results.map((it, i) => {
            const meta = TYPE_META[it.type];
            const active = i === sel;
            return (
              <div key={it.type+":"+it.id}
                onMouseEnter={() => setSel(i)}
                onClick={() => choose(it)}
                style={{ display:"flex", alignItems:"center", gap:10,
                  padding:"9px 14px", cursor:"pointer",
                  background: active ? meta.color+"18" : "transparent",
                  borderLeft:`2px solid ${active ? meta.color : "transparent"}` }}>
                <span style={{ display:"inline-block", minWidth:78,
                  fontSize:9, fontWeight:600, letterSpacing:1.2, textTransform:"uppercase",
                  fontFamily:"'DM Mono',monospace", color: meta.color }}>
                  {meta.label}
                </span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, color:C.text, whiteSpace:"nowrap",
                    overflow:"hidden", textOverflow:"ellipsis" }}>{it.label}</div>
                  {it.meta && (
                    <div style={{ fontSize:11, color:C.textD, whiteSpace:"nowrap",
                      overflow:"hidden", textOverflow:"ellipsis" }}>{it.meta}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding:"7px 14px", borderTop:`1px solid ${C.border}`,
          display:"flex", gap:14, background:C.surfL }}>
          <Mono color={C.textD} size={8}>↑ ↓ Naviguer</Mono>
          <Mono color={C.textD} size={8}>⏎ Ouvrir</Mono>
          <Mono color={C.textD} size={8}>ESC Fermer</Mono>
          <div style={{ marginLeft:"auto" }}>
            <Mono color={C.textD} size={8}>{results.length} résultat{results.length>1?"s":""}</Mono>
          </div>
        </div>
      </div>
    </div>
  );
}
