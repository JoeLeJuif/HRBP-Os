// Source: HRBP_OS.jsx L.208-210
import { css } from '../theme.js';

export default function Card({ children, style={} }) {
  return <div style={{ ...css.card, ...style }}>{children}</div>;
}
