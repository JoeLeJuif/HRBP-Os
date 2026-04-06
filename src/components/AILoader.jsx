// Source: HRBP_OS.jsx L.237-243
import { C } from '../theme.js';
import Mono from './Mono.jsx';

export default function AILoader({ label="Analyse en cours" }) {
  return <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"60px 20px", gap:16 }}>
    <div style={{ width:32, height:32, border:`2px solid ${C.surfLL}`, borderTop:`2px solid ${C.em}`,
      borderRadius:"50%", animation:"spin 1s linear infinite" }} />
    <Mono color={C.textD}>{label}</Mono>
  </div>;
}
