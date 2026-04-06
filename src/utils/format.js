// ── FORMAT UTILS ──────────────────────────────────────────────────────────────
// Source: HRBP_OS.jsx L.51-69

// ISO date storage helper — always store as YYYY-MM-DD
export function toISO(d) {
  if (!d) return new Date().toISOString().split("T")[0];
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  // Handle DD/MM/YYYY (fr-CA locale format)
  const fr = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  try { return new Date(d).toISOString().split("T")[0]; } catch { return d; }
}

// Display date in fr-CA locale from ISO string
export function fmtDate(iso) {
  if (!iso) return "";
  try { return new Date(iso + "T00:00:00").toLocaleDateString("fr-CA"); } catch { return iso; }
}

// Resolve province from item or user profile, fallback to QC
export function getProvince(item, profile) {
  return item?.province || profile?.defaultProvince || "QC";
}

// Normalize a person name to a stable cross-module lookup key
// "Marie Tremblay" → "marie-tremblay" · "Éric Bélanger" → "eric-belanger"
export function normKey(name = "") {
  return (name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}
