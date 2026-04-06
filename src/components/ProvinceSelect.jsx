// Source: HRBP_OS.jsx L.115-124
import { C } from '../theme.js';
import { PROVINCES } from '../utils/legal.js';

export default function ProvinceSelect({ value, onChange, style={} }) {
  return (
    <select value={value||"QC"} onChange={onChange}
      style={{ background:C.surfL, border:`1px solid ${C.border}`, borderRadius:7,
        padding:"9px 10px", color:C.text, fontSize:13,
        fontFamily:"'DM Sans',sans-serif", outline:"none", cursor:"pointer", ...style }}>
      {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
    </select>
  );
}
