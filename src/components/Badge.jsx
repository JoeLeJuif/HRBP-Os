// Source: HRBP_OS.jsx L.194-198

export default function Badge({ label, color, size=10 }) {
  return <span style={{ background:color+"22", color, border:`1px solid ${color}44`,
    borderRadius:4, padding:"2px 8px", fontSize:size, fontWeight:600,
    fontFamily:"'DM Mono',monospace", letterSpacing:.4, whiteSpace:"nowrap" }}>{label}</span>;
}
