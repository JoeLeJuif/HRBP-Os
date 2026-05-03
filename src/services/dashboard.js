// ── Dashboard metrics ────────────────────────────────────────────────────────
// Aggregates HRBP dashboard counters from public.cases and public.case_tasks.
// Scope is delegated entirely to RLS:
//   - super_admin: all orgs
//   - admin/hrbp:  own org (active only)
//   - disabled:    no rows
//
// Return shape:
//   { ok:true, metrics:{ total, open, byStatus, byType, overdueFollowUps,
//                        createdThisMonth, closedThisMonth } }
//   { ok:false, reason:string, error?:any }
//
// NOT wired into the app yet — same isolation policy as the other services.

import { supabase } from "../lib/supabase.js";

const NO_CLIENT = { ok: false, reason: "no-client" };

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonthIso() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export async function getDashboardMetrics() {
  if (!supabase) return NO_CLIENT;

  // Fetch every case the caller is allowed to see. `status` is the top-level
  // mirror; `data` carries `type`, `closedDate`, and tombstone metadata.
  // RLS handles org scoping; no extra org filter here.
  const { data: caseRows, error: caseErr } = await supabase
    .from("cases")
    .select("status, data, created_at, updated_at");
  if (caseErr) return { ok: false, reason: "cases-query-error", error: caseErr };

  const monthStart = startOfMonthIso();

  const byStatus = {};
  const byType = {};
  let total = 0;
  let open = 0;
  let createdThisMonth = 0;
  let closedThisMonth = 0;

  for (const row of caseRows || []) {
    const data = row && row.data;
    // Tombstones (deletion reconciliation rows from supabaseStore.saveCases)
    // are not real cases — exclude from every counter.
    if (data && data.status === "deleted") continue;

    total++;

    const status = row.status || "open";
    byStatus[status] = (byStatus[status] || 0) + 1;
    if (status !== "closed" && status !== "archived") open++;

    const type = data && typeof data.type === "string" ? data.type : "unknown";
    byType[type] = (byType[type] || 0) + 1;

    if (row.created_at && row.created_at >= monthStart) createdThisMonth++;

    const closedDate = data && typeof data.closedDate === "string" ? data.closedDate : null;
    if (status === "closed" && closedDate && closedDate >= monthStart) closedThisMonth++;
  }

  // Overdue follow-ups = open case_tasks with a due_date strictly before today.
  // Server-side count via head:true to avoid pulling rows.
  const { count: overdueCount, error: tasksErr } = await supabase
    .from("case_tasks")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
    .lt("due_date", todayIsoDate());
  if (tasksErr) return { ok: false, reason: "tasks-query-error", error: tasksErr };

  return {
    ok: true,
    metrics: {
      total,
      open,
      byStatus,
      byType,
      overdueFollowUps: overdueCount || 0,
      createdThisMonth,
      closedThisMonth,
    },
  };
}
