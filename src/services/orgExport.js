// ── Organization export ──────────────────────────────────────────────────────
// Pulls all org-scoped data the caller can SELECT under RLS and returns a
// single JSON envelope. Tables are queried independently — a missing or
// unreadable table contributes an empty array rather than failing the export.
//
// Return shape:
//   { ok: true,  json: {...}, filename: "hrbp-os-export-YYYY-MM-DD.json" }
//   { ok: false, reason: "no-client" | "not-authenticated" | "no-profile" }

import { supabase } from "../lib/supabase.js";

const JSONB_TABLES = ["cases", "investigations", "meetings", "briefs"];
const FLAT_TABLES  = ["employees", "case_tasks", "audit_logs"];

async function fetchJsonbTable(table, organizationId) {
  try {
    const { data, error } = await supabase
      .from(table)
      .select("id, data, organization_id, created_at, updated_at")
      .eq("organization_id", organizationId);
    if (error || !Array.isArray(data)) return [];
    return data
      .map(r => (r && r.data) ? r.data : null)
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchFlatTable(table, organizationId) {
  try {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("organization_id", organizationId);
    if (error || !Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

export async function buildOrganizationExport() {
  if (!supabase) return { ok: false, reason: "no-client" };

  let sessionUserId = null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return { ok: false, reason: "not-authenticated" };
    sessionUserId = data && data.session && data.session.user && data.session.user.id;
  } catch {
    return { ok: false, reason: "not-authenticated" };
  }
  if (!sessionUserId) return { ok: false, reason: "not-authenticated" };

  let organizationId = null;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", sessionUserId)
      .maybeSingle();
    if (error || !data) return { ok: false, reason: "no-profile" };
    organizationId = data.organization_id || null;
  } catch {
    return { ok: false, reason: "no-profile" };
  }
  if (!organizationId) return { ok: false, reason: "no-profile" };

  const result = {};
  await Promise.all([
    ...JSONB_TABLES.map(async t => { result[t] = await fetchJsonbTable(t, organizationId); }),
    ...FLAT_TABLES.map (async t => { result[t] = await fetchFlatTable (t, organizationId); }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  return {
    ok: true,
    json: {
      exported_at:     new Date().toISOString(),
      organization_id: organizationId,
      exported_by:     sessionUserId,
      data:            result,
    },
    filename: `hrbp-os-export-${today}.json`,
  };
}

export function downloadExportFile(json, filename) {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  try {
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
