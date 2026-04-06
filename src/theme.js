// ── FONTS ─────────────────────────────────────────────────────────────────────
// Inject Google Fonts via link tag (avoids @import issues in artifact context)
if (typeof document !== "undefined" && !document.getElementById("hrbp-fonts")) {
  const link = document.createElement("link");
  link.id = "hrbp-fonts";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap";
  document.head.appendChild(link);
}
export const FONTS = "";

// ── DESIGN TOKENS ─────────────────────────────────────────────────────────────
export const C = {
  bg:"#0c0f16", surf:"#131720", surfL:"#181f2e", surfLL:"#1e2738",
  border:"#1a2840", borderL:"#243350", borderLL:"#2d3f60",
  em:"#10b981", emD:"#065f46", emL:"#34d399",
  red:"#ef4444", redD:"#991b1b",
  amber:"#f59e0b", amberD:"#92400e",
  blue:"#3b82f6", blueD:"#1e40af",
  purple:"#8b5cf6", purpleD:"#5b21b6",
  teal:"#06b6d4", pink:"#ec4899",
  text:"#e2e8f0", textM:"#8899aa", textD:"#3d5068",
};

// ── INVESTIGATION COLOR ────────────────────────────────────────────────────────
export const INV_RED = "#7a1e2e";

// ── RISK MAP ──────────────────────────────────────────────────────────────────
export const RISK = {
  "Critique":{ color:C.red,   bg:"#ef444412" },
  "Élevé":   { color:C.amber, bg:"#f59e0b12" },
  "Eleve":   { color:C.amber, bg:"#f59e0b12" },
  "Modéré":  { color:C.blue,  bg:"#3b82f612" },
  "Modere":  { color:C.blue,  bg:"#3b82f612" },
  "Faible":  { color:C.em,    bg:"#10b98112" },
};

// ── DELAY COLOR MAP ───────────────────────────────────────────────────────────
export const DELAY_C = {
  "Immédiat":C.red, "Immediat":C.red, "24h":C.amber,
  "7 jours":C.blue, "30 jours":C.teal, "Continu":C.em,
  "Hebdo":C.em, "Cette semaine":C.amber, "J0":C.em, "Avant":C.blue,
};

// ── SHARED STYLES ─────────────────────────────────────────────────────────────
export const css = {
  input: { width:"100%", background:C.surfL, border:`1px solid ${C.border}`, borderRadius:7,
    padding:"9px 12px", color:C.text, fontSize:13, fontFamily:"'DM Sans',sans-serif",
    outline:"none", transition:"border-color .15s" },
  textarea: { width:"100%", background:C.surfL, border:`1px solid ${C.border}`, borderRadius:7,
    padding:"10px 13px", color:C.text, fontSize:13, fontFamily:"'DM Sans',sans-serif",
    outline:"none", resize:"vertical", lineHeight:1.7, transition:"border-color .15s" },
  select: { width:"100%", background:C.surfL, border:`1px solid ${C.border}`, borderRadius:7,
    padding:"9px 12px", color:C.text, fontSize:13, fontFamily:"'DM Sans',sans-serif",
    outline:"none", cursor:"pointer" },
  btn: (color=C.em, outline=false) => ({
    background: outline ? "none" : color, color: outline ? color : C.bg,
    border:`1px solid ${color}${outline?"99":""}`, borderRadius:7,
    padding:"9px 18px", fontWeight:600, fontSize:13, cursor:"pointer",
    fontFamily:"'DM Sans',sans-serif", transition:"all .15s",
  }),
  card: { background:C.surfL, border:`1px solid ${C.border}`, borderRadius:10, padding:"16px 18px" },
};
