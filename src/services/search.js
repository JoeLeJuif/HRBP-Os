// ── Cross-entity search ──────────────────────────────────────────────────────
// Searches public.cases and public.employees with a single ilike-based query.
// No FTS, no ranking, no pagination — basic substring match only.
//
// Scope is delegated entirely to RLS:
//   - cases: per-user (auth.uid()::text = user_id AND is_active())
//   - employees: org-scoped via has_org_access(organization_id) — super_admin
//     all orgs, admin/hrbp own org only, disabled none
// This service does NOT add role-based logic; whatever the caller is allowed
// to read is what gets searched.
//
// Return shape:
//   { ok:true, cases:[...], employees:[...] }
//   { ok:false, reason:string, error?:any }
//
// NOT wired into the app yet — same isolation policy as the other services.

import { supabase } from "../lib/supabase.js";

const NO_CLIENT = { ok: false, reason: "no-client" };

const CASE_COLS =
  "id, status, organization_id, data, created_at, updated_at";
const EMPLOYEE_COLS =
  "id, organization_id, employee_number, full_name, job_title, department, " +
  "manager_name, location, employment_status, created_at, updated_at";

const CASE_STATUSES = ["open", "in_progress", "waiting", "closed", "archived"];

// jsonb text fields searched on cases.data (canonical keys produced by
// normalizeCase). Kept small and explicit — adding more here is cheap.
const CASE_TEXT_FIELDS = [
  "title", "employee", "director", "department", "situation", "notes",
];

// Escape ilike wildcards (% _) and backslash so user input is treated as a
// literal substring. Also strip characters that would break PostgREST's .or()
// syntax: comma, parens, and stray quotes.
function sanitizePattern(s) {
  return String(s)
    .replace(/[\\%_]/g, m => "\\" + m)
    .replace(/[,()"]/g, "");
}

export async function searchHRBP(query, filters = {}) {
  if (!supabase) return NO_CLIENT;

  const q = typeof query === "string" ? query.trim() : "";
  const f = filters && typeof filters === "object" ? filters : {};

  const limit = Number.isFinite(f.limit) && f.limit > 0
    ? Math.min(Math.floor(f.limit), 200)
    : 50;

  const entity = f.entity || "all";
  if (entity !== "all" && entity !== "cases" && entity !== "employees") {
    return { ok: false, reason: "invalid-entity" };
  }
  const wantCases     = entity === "all" || entity === "cases";
  const wantEmployees = entity === "all" || entity === "employees";

  if (f.status && CASE_STATUSES.indexOf(f.status) === -1) {
    return { ok: false, reason: "invalid-status" };
  }

  // Empty query + no filters → nothing to search for. Avoid returning the
  // whole table by accident.
  const hasCaseFilter     = Boolean(f.status);
  const hasEmployeeFilter = Boolean(f.department);
  if (!q && !hasCaseFilter && !hasEmployeeFilter) {
    return { ok: true, cases: [], employees: [] };
  }

  const pattern = q ? `%${sanitizePattern(q)}%` : null;
  const out = { ok: true, cases: [], employees: [] };

  if (wantCases) {
    let cq = supabase
      .from("cases")
      .select(CASE_COLS)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (f.status) cq = cq.eq("status", f.status);
    if (pattern) {
      // OR across known jsonb text fields. PostgREST `.or()` syntax:
      //   field.op.value,field.op.value
      const orClause = CASE_TEXT_FIELDS
        .map(field => `data->>${field}.ilike.${pattern}`)
        .join(",");
      cq = cq.or(orClause);
    }
    const { data, error } = await cq;
    if (error) return { ok: false, reason: "cases-query-error", error };
    out.cases = data ?? [];
  }

  if (wantEmployees) {
    let eq = supabase
      .from("employees")
      .select(EMPLOYEE_COLS)
      .order("full_name", { ascending: true })
      .limit(limit);
    if (f.department) eq = eq.eq("department", f.department);
    if (pattern) {
      eq = eq.or(
        `full_name.ilike.${pattern},` +
        `employee_number.ilike.${pattern},` +
        `department.ilike.${pattern}`
      );
    }
    const { data, error } = await eq;
    if (error) return { ok: false, reason: "employees-query-error", error };
    out.employees = data ?? [];
  }

  return out;
}
