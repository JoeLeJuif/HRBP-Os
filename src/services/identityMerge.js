// ── Identity merge service ───────────────────────────────────────────────────
// Renames or merges an employee/manager name across every entity that
// references it: cases (data.employee/director), meetings (data.director,
// managerName, people.{performance,leadership,engagement}), investigations
// (data.people), briefs (data.{director,employee,manager*}), case_tasks
// (assigned_to), and the employees table (full_name, manager_name).
//
// The merge is *idempotent*: running it twice with the same source/target
// is a no-op on the second pass since no row still matches the source key.
//
// Match rule: case-insensitive, accent-insensitive, whitespace-collapsed
// (see ../utils/identity.js). The replacement value is the caller-provided
// `targetName` exactly as typed — that becomes the canonical display form.
//
// Alias preservation: no schema change. The `audit_logs` table already
// preserves the rename trail — one `identity.merged` row per merge with
// `metadata: { source_name, target_name, affected: {...} }`. To find the
// alias history of a given canonical name, query:
//   select metadata->>'source_name' from audit_logs
//   where action='identity.merged' and metadata->>'target_name' = 'Channy Tremblay'
//
// RLS scoping: jsonb tables (cases/meetings/etc.) are limited to the
// current session's user_id (matches supabaseStore's per-user model).
// `case_tasks` and `employees` are org-scoped server-side; this service
// passes everything the caller can see through to the rewrite.
//
// Return shape:
//   { ok:true, total:number, breakdown:{...} } on success
//   { ok:false, reason:string, error?:any } on failure (any error short-
//   circuits — no partial-success rollback, but each row update is atomic)
//
// NOT wired into the app yet — same isolation policy as the other services.

import { supabase } from "../lib/supabase.js";
import { bestEffortAudit, AUDIT_ACTIONS } from "./auditLog.js";
import {
  normalizeIdentityKey,
  identityMatches,
  applyMergeToCaseData,
  applyMergeToInvestigationData,
  applyMergeToMeetingData,
  applyMergeToBriefData,
} from "../utils/identity.js";

const NO_CLIENT = { ok: false, reason: "no-client" };

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

// Rewrite jsonb-data rows. Reads the rows the caller can see (per-user
// narrowing on top of org-scoped RLS), applies the pure helper to each
// row's `data` payload, and writes back only the rows that actually
// changed. Returns { ok, updated } or { ok:false, reason, error }.
async function rewriteJsonbTable(table, sourceName, targetName, applyFn, sessionUserId) {
  const { data: rows, error } = await supabase
    .from(table)
    .select("id, data")
    .eq("user_id", sessionUserId);
  if (error) return { ok: false, reason: `${table}-query-error`, error };
  let updated = 0;
  for (const row of rows || []) {
    if (!row || !row.data) continue;
    const { changed, value } = applyFn(row.data, sourceName, targetName);
    if (!changed) continue;
    const { error: updErr } = await supabase
      .from(table)
      .update({ data: value, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (updErr) return { ok: false, reason: `${table}-update-error`, error: updErr };
    updated += 1;
  }
  return { ok: true, updated };
}

export async function mergeIdentity(input) {
  if (!supabase) return NO_CLIENT;
  if (!input || typeof input !== "object") return { ok: false, reason: "invalid-input" };

  const sourceName = typeof input.sourceName === "string" ? input.sourceName.trim() : "";
  const targetName = typeof input.targetName === "string" ? input.targetName.trim() : "";
  if (!sourceName) return { ok: false, reason: "invalid-source" };
  if (!targetName) return { ok: false, reason: "invalid-target" };
  // Identical source/target (after normalization) is a no-op. We still allow
  // a casing/whitespace cleanup ("CHanny  Tremblay" → "Channy Tremblay") —
  // those normalize to the same key but differ as strings, so let them through.
  if (sourceName === targetName) return { ok: false, reason: "noop" };

  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) return { ok: false, reason: "not-authenticated" };

  const breakdown = {
    cases: 0,
    investigations: 0,
    meetings: 0,
    briefs: 0,
    case_tasks: 0,
    employees_full_name: 0,
    employees_manager_name: 0,
  };

  // ── jsonb tables (cases / investigations / meetings / briefs) ──────────────
  const cases = await rewriteJsonbTable("cases", sourceName, targetName, applyMergeToCaseData, sessionUserId);
  if (!cases.ok) return cases;
  breakdown.cases = cases.updated;

  const inv = await rewriteJsonbTable("investigations", sourceName, targetName, applyMergeToInvestigationData, sessionUserId);
  if (!inv.ok) return inv;
  breakdown.investigations = inv.updated;

  const meet = await rewriteJsonbTable("meetings", sourceName, targetName, applyMergeToMeetingData, sessionUserId);
  if (!meet.ok) return meet;
  breakdown.meetings = meet.updated;

  const briefs = await rewriteJsonbTable("briefs", sourceName, targetName, applyMergeToBriefData, sessionUserId);
  if (!briefs.ok) return briefs;
  breakdown.briefs = briefs.updated;

  // ── case_tasks.assigned_to ────────────────────────────────────────────────
  // Free-text field. Filtered client-side because exact-match on a varying-
  // case Postgres text column would miss "CHanny" vs "Channy". RLS keeps the
  // pull org-scoped. uuid-shaped values never match identityMatches() since
  // they don't share the source's normalized key.
  {
    const { data: rows, error } = await supabase
      .from("case_tasks")
      .select("id, assigned_to");
    if (error) return { ok: false, reason: "case_tasks-query-error", error };
    for (const r of rows || []) {
      if (!identityMatches(r.assigned_to, sourceName)) continue;
      const { error: updErr } = await supabase
        .from("case_tasks")
        .update({ assigned_to: targetName, updated_at: new Date().toISOString() })
        .eq("id", r.id);
      if (updErr) return { ok: false, reason: "case_tasks-update-error", error: updErr };
      breakdown.case_tasks += 1;
    }
  }

  // ── employees.full_name + employees.manager_name ──────────────────────────
  // A single row may match on both columns — issue one UPDATE in that case
  // and increment both counters so the breakdown stays accurate.
  {
    const { data: rows, error } = await supabase
      .from("employees")
      .select("id, full_name, manager_name");
    if (error) return { ok: false, reason: "employees-query-error", error };
    for (const r of rows || []) {
      const patch = {};
      if (identityMatches(r.full_name,    sourceName)) patch.full_name    = targetName;
      if (identityMatches(r.manager_name, sourceName)) patch.manager_name = targetName;
      if (Object.keys(patch).length === 0) continue;
      patch.updated_at = new Date().toISOString();
      const { error: updErr } = await supabase
        .from("employees")
        .update(patch)
        .eq("id", r.id);
      if (updErr) return { ok: false, reason: "employees-update-error", error: updErr };
      if (patch.full_name)    breakdown.employees_full_name    += 1;
      if (patch.manager_name) breakdown.employees_manager_name += 1;
    }
  }

  // Single audit event per merge. Append-only (no UPDATE/DELETE policy on
  // audit_logs) → the alias trail is tamper-proof. entity_id holds the new
  // canonical name so audit listings group cleanly by target.
  void bestEffortAudit({
    action: AUDIT_ACTIONS.IDENTITY_MERGED,
    entity_type: "identity",
    entity_id: targetName,
    metadata: {
      source_name: sourceName,
      target_name: targetName,
      source_key: normalizeIdentityKey(sourceName),
      affected: breakdown,
    },
  });

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { ok: true, total, breakdown };
}

// Dry-run companion to `mergeIdentity`. Reads exactly the same rows the real
// merge would touch (per-user jsonb tables, RLS-scoped case_tasks/employees)
// and returns the same breakdown shape — but performs zero writes and emits
// no audit event. Powers the Rename panel's Preview button.
export async function previewMergeIdentity(input) {
  if (!supabase) return NO_CLIENT;
  if (!input || typeof input !== "object") return { ok: false, reason: "invalid-input" };

  const sourceName = typeof input.sourceName === "string" ? input.sourceName.trim() : "";
  const targetName = typeof input.targetName === "string" ? input.targetName.trim() : "";
  if (!sourceName) return { ok: false, reason: "invalid-source" };
  if (!targetName) return { ok: false, reason: "invalid-target" };
  if (sourceName === targetName) return { ok: false, reason: "noop" };

  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) return { ok: false, reason: "not-authenticated" };

  const breakdown = {
    cases: 0, investigations: 0, meetings: 0, briefs: 0,
    case_tasks: 0, employees_full_name: 0, employees_manager_name: 0,
  };

  async function countJsonb(table, applyFn) {
    const { data: rows, error } = await supabase
      .from(table)
      .select("id, data")
      .eq("user_id", sessionUserId);
    if (error) return { ok: false, reason: `${table}-query-error`, error };
    let n = 0;
    for (const row of rows || []) {
      if (!row || !row.data) continue;
      const { changed } = applyFn(row.data, sourceName, targetName);
      if (changed) n += 1;
    }
    return { ok: true, n };
  }

  let r;
  r = await countJsonb("cases",          applyMergeToCaseData);          if (!r.ok) return r; breakdown.cases          = r.n;
  r = await countJsonb("investigations", applyMergeToInvestigationData); if (!r.ok) return r; breakdown.investigations = r.n;
  r = await countJsonb("meetings",       applyMergeToMeetingData);       if (!r.ok) return r; breakdown.meetings       = r.n;
  r = await countJsonb("briefs",         applyMergeToBriefData);         if (!r.ok) return r; breakdown.briefs         = r.n;

  {
    const { data: rows, error } = await supabase
      .from("case_tasks")
      .select("id, assigned_to");
    if (error) return { ok: false, reason: "case_tasks-query-error", error };
    for (const row of rows || []) {
      if (identityMatches(row.assigned_to, sourceName)) breakdown.case_tasks += 1;
    }
  }

  {
    const { data: rows, error } = await supabase
      .from("employees")
      .select("id, full_name, manager_name");
    if (error) return { ok: false, reason: "employees-query-error", error };
    for (const row of rows || []) {
      if (identityMatches(row.full_name,    sourceName)) breakdown.employees_full_name    += 1;
      if (identityMatches(row.manager_name, sourceName)) breakdown.employees_manager_name += 1;
    }
  }

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { ok: true, total, breakdown };
}

// Look up the alias history for a given canonical name. Returns the list of
// previous source names that were merged into `targetName`. Useful for
// "name was previously known as ..." UI hints. Pure read against audit_logs
// — no side effects.
export async function listIdentityAliases(targetName) {
  if (!supabase) return NO_CLIENT;
  const target = typeof targetName === "string" ? targetName.trim() : "";
  if (!target) return { ok: false, reason: "invalid-target" };
  const { data, error } = await supabase
    .from("audit_logs")
    .select("metadata, created_at")
    .eq("action", AUDIT_ACTIONS.IDENTITY_MERGED)
    .eq("entity_id", target)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, reason: "query-error", error };
  const aliases = (data || [])
    .map(r => (r && r.metadata && r.metadata.source_name) || "")
    .filter(Boolean);
  return { ok: true, aliases };
}
