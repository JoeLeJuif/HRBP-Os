// ── Case tasks CRUD ──────────────────────────────────────────────────────────
// Reads/writes public.case_tasks. RLS enforces super_admin → all rows,
// admin/hrbp → rows in their org (active only), disabled → no rows.
//
// organization_id is *always* derived from the parent case — both at the
// service layer (read parent.organization_id pre-insert) and server-side
// via the case_tasks_set_org BEFORE INSERT/UPDATE trigger that pins the
// column to the parent's value. Callers cannot override it.
//
// Return shapes:
//   listCaseTasks(caseId)        → { ok:true, tasks:[...] } | { ok:false, reason, error? }
//   createCaseTask(input)        → { ok:true, task } | { ok:false, reason, error? }
//   updateCaseTask(id, patch)    → { ok:true, task } | { ok:false, reason, error? }
//   deleteCaseTask(id)           → { ok:true } | { ok:false, reason, error? }
//
// NOT wired into the app yet — same isolation policy as supabaseStore.

import { supabase } from "../lib/supabase.js";
import { bestEffortAudit, AUDIT_ACTIONS } from "./auditLog.js";

const NO_CLIENT = { ok: false, reason: "no-client" };

const TASK_COLS = "id, case_id, organization_id, title, assigned_to, due_date, status, created_at, updated_at";
const STATUSES  = ["open", "done", "cancelled"];

export async function listCaseTasks(caseId) {
  if (!supabase) return NO_CLIENT;
  if (!caseId) return { ok: false, reason: "invalid-case-id" };
  const { data, error } = await supabase
    .from("case_tasks")
    .select(TASK_COLS)
    .eq("case_id", String(caseId))
    .order("created_at", { ascending: true });
  if (error) return { ok: false, reason: "query-error", error };
  return { ok: true, tasks: data ?? [] };
}

export async function createCaseTask(input) {
  if (!supabase) return NO_CLIENT;
  if (!input || typeof input !== "object") return { ok: false, reason: "invalid-input" };
  const caseId = input.case_id ? String(input.case_id) : null;
  const title  = typeof input.title === "string" ? input.title.trim() : "";
  if (!caseId) return { ok: false, reason: "invalid-case-id" };
  if (!title)  return { ok: false, reason: "invalid-title" };

  const status = input.status && STATUSES.includes(input.status) ? input.status : "open";

  // Derive organization_id from the parent case (RLS-protected SELECT).
  // Cross-org callers cannot see the parent → bail out with parent-not-found
  // before the insert. The DB trigger case_tasks_set_org also pins this
  // server-side, so even if a caller spoofs organization_id, the row's
  // org will always match the parent's.
  const { data: parent, error: parentErr } = await supabase
    .from("cases")
    .select("organization_id")
    .eq("id", caseId)
    .maybeSingle();
  if (parentErr) return { ok: false, reason: "parent-query-error", error: parentErr };
  if (!parent)   return { ok: false, reason: "parent-not-found" };

  const row = {
    case_id: caseId,
    organization_id: parent.organization_id,
    title,
    assigned_to: input.assigned_to || null,
    due_date: input.due_date || null,
    status,
  };

  const { data, error } = await supabase
    .from("case_tasks")
    .insert(row)
    .select(TASK_COLS)
    .maybeSingle();
  if (error) return { ok: false, reason: "insert-error", error };
  void bestEffortAudit({
    action: AUDIT_ACTIONS.TASK_CREATED,
    entity_type: "task",
    entity_id: data && data.id ? data.id : "",
    metadata: { case_id: caseId, status: row.status },
  });
  return { ok: true, task: data };
}

export async function updateCaseTask(id, patch) {
  if (!supabase) return NO_CLIENT;
  if (!id) return { ok: false, reason: "invalid-id" };
  if (!patch || typeof patch !== "object") return { ok: false, reason: "invalid-patch" };

  // organization_id and case_id are intentionally not patchable — the trigger
  // would override them anyway, but callers should not be encouraged to try.
  const allowed = {};
  if (patch.title !== undefined) {
    const t = typeof patch.title === "string" ? patch.title.trim() : "";
    if (!t) return { ok: false, reason: "invalid-title" };
    allowed.title = t;
  }
  if (patch.assigned_to !== undefined) allowed.assigned_to = patch.assigned_to || null;
  if (patch.due_date    !== undefined) allowed.due_date    = patch.due_date    || null;
  if (patch.status      !== undefined) {
    if (!STATUSES.includes(patch.status)) return { ok: false, reason: "invalid-status" };
    allowed.status = patch.status;
  }
  if (Object.keys(allowed).length === 0) return { ok: false, reason: "empty-patch" };
  allowed.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("case_tasks")
    .update(allowed)
    .eq("id", id)
    .select(TASK_COLS)
    .maybeSingle();
  if (error) return { ok: false, reason: "update-error", error };
  // task.completed when patch flips status to 'done', otherwise task.updated.
  // No prior-status read — re-saving an already-done task may double-emit,
  // but that's acceptable noise for a minimal wiring.
  void bestEffortAudit({
    action: allowed.status === "done"
      ? AUDIT_ACTIONS.TASK_COMPLETED
      : AUDIT_ACTIONS.TASK_UPDATED,
    entity_type: "task",
    entity_id: id,
    metadata: { case_id: data && data.case_id ? data.case_id : null },
  });
  return { ok: true, task: data };
}

export async function deleteCaseTask(id) {
  if (!supabase) return NO_CLIENT;
  if (!id) return { ok: false, reason: "invalid-id" };
  const { error } = await supabase
    .from("case_tasks")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, reason: "delete-error", error };
  return { ok: true };
}

export const CASE_TASK_STATUSES = STATUSES;
