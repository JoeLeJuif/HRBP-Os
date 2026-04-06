// Source: HRBP_OS.jsx L.126-134
import { C } from '../theme.js';

export default function ProvinceBadge({ province }) {
  return (
    <span style={{ background:C.surfLL, border:`1px solid ${C.borderL}`,
      borderRadius:4, padding:"1px 6px", fontSize:9, fontWeight:700,
      color:C.textM, fontFamily:"'DM Mono',monospace", letterSpacing:0.5 }}>
      {province||"QC"}
    </span>
  );
}
