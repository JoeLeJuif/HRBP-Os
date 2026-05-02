// ── Employees CRUD ───────────────────────────────────────────────────────────
// Reads/writes public.employees. RLS enforces super_admin → all rows,
// admin/hrbp → rows in their org (active only), disabled → no rows.
//
// organization_id is *always* derived from the caller's profile — never
// from input. This makes cross-org inserts structurally impossible at the
// JS layer; RLS WITH CHECK provides defense-in-depth at the DB. Super_admin
// follows the same path: their employee is created in their own assigned
// org (HRBP OS in current seed).
//
// Return shapes:
//   listEmployees(opts?)          → { ok:true, employees:[...] } | { ok:false, reason, error? }
//   getEmployee(id)               → { ok:true, employee } | { ok:false, reason, error? }
//   createEmployee(input)         → { ok:true, employee } | { ok:false, reason, error? }
//   updateEmployee(id, patch)     → { ok:true, employee } | { ok:false, reason, error? }
//   deleteEmployee(id)            → { ok:true } | { ok:false, reason, error? }
//
// NOT wired into the app yet — same isolation policy as supabaseStore /
// caseTasks. No module imports this file.

import { supabase } from "../lib/supabase.js";
import { bestEffortAudit, AUDIT_ACTIONS } from "./auditLog.js";

const NO_CLIENT = { ok: false, reason: "no-client" };

// Session helpers — same pattern as supabaseStore.js. Cached per-session so
// repeated CRUD calls don't re-query the profile row.
async function getSessionUserId() {
  if (!supabase || !supabase.auth || typeof supabase.auth.getSession !== "function") return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return (data && data.session && data.session.user && data.session.user.id) || null;
  } catch {
    return null;
  }
}

let _cachedOrgUserId = null;
let _cachedOrgId = null;
async function getSessionOrgId(sessionUserId) {
  if (!supabase || !sessionUserId) return null;
  if (_cachedOrgUserId === sessionUserId) return _cachedOrgId;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", sessionUserId)
      .maybeSingle();
    if (error) return null;
    _cachedOrgUserId = sessionUserId;
    _cachedOrgId = data && data.organization_id ? data.organization_id : null;
    return _cachedOrgId;
  } catch {
    return null;
  }
}

const EMPLOYEE_COLS =
  "id, organization_id, employee_number, full_name, job_title, department, " +
  "manager_name, location, employment_status, created_at, updated_at";

const STATUSES = ["active", "on_leave", "terminated"];

const PATCHABLE = [
  "employee_number", "full_name", "job_title", "department",
  "manager_name", "location", "employment_status",
];

export async function listEmployees(opts = {}) {
  if (!supabase) return NO_CLIENT;
  let q = supabase.from("employees").select(EMPLOYEE_COLS);
  if (opts.organization_id) q = q.eq("organization_id", opts.organization_id);
  if (opts.status) {
    if (!STATUSES.includes(opts.status)) return { ok: false, reason: "invalid-status" };
    q = q.eq("employment_status", opts.status);
  }
  if (opts.department) q = q.eq("department", opts.department);
  q = q.order("full_name", { ascending: true });
  const { data, error } = await q;
  if (error) return { ok: false, reason: "query-error", error };
  return { ok: true, employees: data ?? [] };
}

export async function getEmployee(id) {
  if (!supabase) return NO_CLIENT;
  if (!id) return { ok: false, reason: "invalid-id" };
  const { data, error } = await supabase
    .from("employees")
    .select(EMPLOYEE_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, reason: "query-error", error };
  if (!data)  return { ok: false, reason: "not-found" };
  return { ok: true, employee: data };
}

export async function createEmployee(input) {
  if (!supabase) return NO_CLIENT;
  if (!input || typeof input !== "object") return { ok: false, reason: "invalid-input" };

  const fullName = typeof input.full_name === "string" ? input.full_name.trim() : "";
  if (!fullName) return { ok: false, reason: "invalid-full-name" };

  // organization_id is auto-derived from the caller's profile; any input.org_id
  // is silently ignored. RLS WITH CHECK still enforces this server-side, so
  // bypassing the JS layer would still hit a 42501.
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) return { ok: false, reason: "not-authenticated" };
  const orgId = await getSessionOrgId(sessionUserId);
  if (!orgId) return { ok: false, reason: "no-org" };

  const status = input.employment_status && STATUSES.includes(input.employment_status)
    ? input.employment_status
    : "active";

  const row = {
    organization_id:   orgId,
    full_name:         fullName,
    employee_number:   input.employee_number || null,
    job_title:         input.job_title       || null,
    department:        input.department      || null,
    manager_name:      input.manager_name    || null,
    location:          input.location        || null,
    employment_status: status,
  };

  const { data, error } = await supabase
    .from("employees")
    .insert(row)
    .select(EMPLOYEE_COLS)
    .maybeSingle();
  if (error) return { ok: false, reason: "insert-error", error };
  void bestEffortAudit({
    action: AUDIT_ACTIONS.EMPLOYEE_CREATED,
    entity_type: "employee",
    entity_id: data && data.id ? data.id : "",
  });
  return { ok: true, employee: data };
}

export async function updateEmployee(id, patch) {
  if (!supabase) return NO_CLIENT;
  if (!id) return { ok: false, reason: "invalid-id" };
  if (!patch || typeof patch !== "object") return { ok: false, reason: "invalid-patch" };

  // organization_id is intentionally not patchable here — moving an employee
  // between orgs is a privileged action that should go through a dedicated
  // path (RLS would also block any org the caller doesn't own).
  const allowed = {};
  for (const key of PATCHABLE) {
    if (patch[key] === undefined) continue;
    if (key === "full_name") {
      const t = typeof patch.full_name === "string" ? patch.full_name.trim() : "";
      if (!t) return { ok: false, reason: "invalid-full-name" };
      allowed.full_name = t;
    } else if (key === "employment_status") {
      if (!STATUSES.includes(patch.employment_status)) {
        return { ok: false, reason: "invalid-status" };
      }
      allowed.employment_status = patch.employment_status;
    } else {
      // Empty string clears optional text fields to NULL for tidy storage.
      const v = patch[key];
      allowed[key] = v === "" ? null : v;
    }
  }
  if (Object.keys(allowed).length === 0) return { ok: false, reason: "empty-patch" };
  allowed.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("employees")
    .update(allowed)
    .eq("id", id)
    .select(EMPLOYEE_COLS)
    .maybeSingle();
  if (error) return { ok: false, reason: "update-error", error };
  void bestEffortAudit({
    action: AUDIT_ACTIONS.EMPLOYEE_UPDATED,
    entity_type: "employee",
    entity_id: id,
  });
  return { ok: true, employee: data };
}

export async function deleteEmployee(id) {
  if (!supabase) return NO_CLIENT;
  if (!id) return { ok: false, reason: "invalid-id" };
  const { error } = await supabase
    .from("employees")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, reason: "delete-error", error };
  return { ok: true };
}

export const EMPLOYMENT_STATUSES = STATUSES;
