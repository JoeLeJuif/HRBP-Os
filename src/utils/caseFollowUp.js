// ── Case follow-up resolution ────────────────────────────────────────────────
// Phase 3 Batch 2.7 → 2.8: shared helpers for resolving the "next follow-up"
// of a case across display surfaces and AI prompt context.
//
// Priority order is fixed and applies wherever follow-ups are surfaced:
//   1. next open case_task (from public.case_tasks)
//   2. legacy `c.dueDate`
//   3. legacy `c.nextFollowUp` free-text
//
// Pure helpers (getNextOpenTask, getCaseFollowUp, followUpToText) are safe
// to call with undefined/null inputs. fetchTasksForCases is the I/O helper
// that wraps the case_tasks service for bulk-loading.

import { listCaseTasks } from "../services/caseTasks.js";

// Return the "next" open task — earliest due_date first (asc), then earliest
// created_at. Pure; null when input is empty or has no open tasks.
export function getNextOpenTask(tasks) {
  if (!Array.isArray(tasks)) return null;
  const open = tasks.filter(t => t && t.status === "open");
  if (open.length === 0) return null;
  open.sort((a, b) => {
    const ad = a.due_date || "";
    const bd = b.due_date || "";
    if (ad && !bd) return -1;
    if (!ad && bd) return 1;
    if (ad && bd && ad !== bd) return ad < bd ? -1 : 1;
    const ac = a.created_at || "";
    const bc = b.created_at || "";
    return ac < bc ? -1 : ac > bc ? 1 : 0;
  });
  return open[0];
}

// Single source of truth for "the next follow-up of this case".
// Returns null if no source has anything; otherwise:
//   { source: "task" | "due_date" | "next_follow_up", title, due }
export function getCaseFollowUp(c, tasks) {
  const nt = getNextOpenTask(tasks);
  if (nt) return { source: "task", title: nt.title || "", due: nt.due_date || "" };
  if (c?.dueDate) return { source: "due_date", title: "", due: c.dueDate };
  if (c?.nextFollowUp) return { source: "next_follow_up", title: c.nextFollowUp, due: "" };
  return null;
}

// Render a follow-up object as a short prompt-friendly string.
// Returns "" when input is null — callers add their own default ("N/A",
// "not set", etc.) so the helper stays language-neutral.
export function followUpToText(fu) {
  if (!fu) return "";
  if (fu.source === "task") return fu.due ? `${fu.title} (${fu.due})` : fu.title;
  return fu.due || fu.title;
}

// Bulk-fetch tasks for a list of cases. Returns { [caseId]: tasks[] } as a
// plain object (matching the in-app `tasksByCase` shape). Skipped cases
// (falsy ids, errors, no-client) simply don't appear in the result.
export async function fetchTasksForCases(cases) {
  const out = {};
  if (!Array.isArray(cases) || cases.length === 0) return out;
  const ids = cases.map(c => c?.id).filter(Boolean);
  if (ids.length === 0) return out;
  const results = await Promise.all(ids.map(async id => [id, await listCaseTasks(id)]));
  for (const [id, res] of results) {
    if (res && res.ok) out[id] = res.tasks || [];
  }
  return out;
}
