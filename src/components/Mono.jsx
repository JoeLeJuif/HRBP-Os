// Source: HRBP_OS.jsx L.204-206
import { C } from '../theme.js';

export default function Mono({ children, size=9, color=C.textD }) {
  return <span style={{ fontFamily:"'DM Mono',monospace", fontSize:size, color, letterSpacing:1.5, textTransform:"uppercase" }}>{children}</span>;
}
