// ── Audit log ────────────────────────────────────────────────────────────────
// Append-only event log for case/task/employee mutations. Reads/writes
// public.audit_logs. RLS enforces super_admin → all rows, admin/hrbp → rows
// in their org (active only), disabled → no rows. There is no UPDATE/DELETE
// policy — audit rows can't be tampered with from the client.
//
// organization_id is *always* derived from the caller's profile — never from
// input. actor_id is *always* the current session user. Both are auto-stamped
// here; callers only supply { action, entity_type, entity_id, metadata? }.
//
// Return shapes:
//   logAuditEvent(input)  → { ok:true, event } | { ok:false, reason, error? }
//   listAuditEvents(opts?) → { ok:true, events:[...] } | { ok:false, reason, error? }
//
// NOT wired into the app yet — same isolation policy as supabaseStore /
// caseTasks / employees. No module imports this file.

import { supabase } from "../lib/supabase.js";

const NO_CLIENT = { ok: false, reason: "no-client" };

const EVENT_COLS =
  "id, organization_id, actor_id, action, entity_type, entity_id, metadata, created_at";

// Canonical action names. Keeps callers consistent and catches typos at the
// JS layer; not enforced by a DDL CHECK so adding new actions stays cheap.
export const AUDIT_ACTIONS = Object.freeze({
  CASE_CREATED:        "case.created",
  CASE_UPDATED:        "case.updated",
  CASE_STATUS_CHANGED: "case.status_changed",
  CASE_STATE_CHANGED:  "case.state_changed",
  CASE_ARCHIVED:       "case.archived",
  CASE_DELETED:        "case.deleted",
  TASK_CREATED:        "task.created",
  TASK_UPDATED:        "task.updated",
  TASK_COMPLETED:      "task.completed",
  EMPLOYEE_CREATED:    "employee.created",
  EMPLOYEE_UPDATED:    "employee.updated",
  IDENTITY_MERGED:     "identity.merged",
});

const ALLOWED_ACTIONS = new Set(Object.values(AUDIT_ACTIONS));

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

export async function logAuditEvent(input) {
  if (!supabase) return NO_CLIENT;
  if (!input || typeof input !== "object") return { ok: false, reason: "invalid-input" };

  const action      = typeof input.action === "string"      ? input.action.trim()      : "";
  const entityType  = typeof input.entity_type === "string" ? input.entity_type.trim() : "";
  const entityId    = input.entity_id != null               ? String(input.entity_id)  : "";
  if (!action)     return { ok: false, reason: "invalid-action" };
  if (!entityType) return { ok: false, reason: "invalid-entity-type" };
  if (!entityId)   return { ok: false, reason: "invalid-entity-id" };
  if (!ALLOWED_ACTIONS.has(action)) return { ok: false, reason: "unknown-action" };

  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};

  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) return { ok: false, reason: "not-authenticated" };
  const orgId = await getSessionOrgId(sessionUserId);
  if (!orgId) return { ok: false, reason: "no-org" };

  const row = {
    organization_id: orgId,
    actor_id:        sessionUserId,
    action,
    entity_type:     entityType,
    entity_id:       entityId,
    metadata,
  };

  const { data, error } = await supabase
    .from("audit_logs")
    .insert(row)
    .select(EVENT_COLS)
    .maybeSingle();
  if (error) return { ok: false, reason: "insert-error", error };
  return { ok: true, event: data };
}

// Fire-and-forget wrapper. Callers that wire audit emission into mutation
// paths use this so a transient audit failure never blocks the primary op
// or surfaces as an unhandled rejection. Returns a promise that always
// resolves (never rejects) — `void bestEffortAudit({...})` is the pattern.
export async function bestEffortAudit(input) {
  try {
    await logAuditEvent(input);
  } catch {
    /* best-effort: audit failures are not the caller's problem */
  }
}

export async function listAuditEvents(opts = {}) {
  if (!supabase) return NO_CLIENT;
  let q = supabase.from("audit_logs").select(EVENT_COLS);
  if (opts.organization_id) q = q.eq("organization_id", opts.organization_id);
  if (opts.entity_type)     q = q.eq("entity_type",     opts.entity_type);
  if (opts.entity_id)       q = q.eq("entity_id",       String(opts.entity_id));
  if (opts.actor_id)        q = q.eq("actor_id",        opts.actor_id);
  if (opts.action)          q = q.eq("action",          opts.action);
  q = q.order("created_at", { ascending: false });
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) return { ok: false, reason: "query-error", error };
  return { ok: true, events: data ?? [] };
}
