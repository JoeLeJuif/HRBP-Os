// ── Case templates ───────────────────────────────────────────────────────────
// Reads/writes public.case_templates. RLS:
//   super_admin      → all rows (any org + globals), full CRUD
//   admin/hrbp       → SELECT own-org rows + globals (organization_id IS NULL);
//                      INSERT/UPDATE/DELETE only on own-org rows (globals are
//                      read-only for them — has_org_access(NULL) is false for
//                      non-super, so policies reject mutations server-side).
//   disabled         → no rows
//
// organization_id semantics: NULL means "global template" (cross-org). Any
// non-null value scopes the template to that org. createCaseTemplate accepts
// either; RLS decides whether the caller is allowed to insert it.
//
// Return shapes:
//   listCaseTemplates(opts?)              → { ok:true, templates:[...] } | { ok:false, ... }
//   createCaseTemplate(input)             → { ok:true, template }        | { ok:false, ... }
//   updateCaseTemplate(id, patch)         → { ok:true, template }        | { ok:false, ... }
//   applyTemplate(template, baseCase?)    → { case, tasks }              (pure, sync)
//
// NOT wired into the app yet — same isolation policy as the other services.

import { supabase } from "../lib/supabase.js";

const NO_CLIENT = { ok: false, reason: "no-client" };

const TEMPLATE_COLS =
  "id, organization_id, name, default_data, default_tasks, created_at";

const PATCHABLE = ["name", "default_data", "default_tasks"];

function _isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export async function listCaseTemplates(opts = {}) {
  if (!supabase) return NO_CLIENT;
  let q = supabase.from("case_templates").select(TEMPLATE_COLS);
  // opts.organization_id === null narrows to globals only; a uuid narrows to
  // that org. Omit to get everything RLS allows (own org + globals).
  if (opts.organization_id === null) {
    q = q.is("organization_id", null);
  } else if (opts.organization_id) {
    q = q.eq("organization_id", opts.organization_id);
  }
  q = q.order("name", { ascending: true });
  const { data, error } = await q;
  if (error) return { ok: false, reason: "query-error", error };
  return { ok: true, templates: data ?? [] };
}

export async function createCaseTemplate(input) {
  if (!supabase) return NO_CLIENT;
  if (!input || typeof input !== "object") return { ok: false, reason: "invalid-input" };

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return { ok: false, reason: "invalid-name" };

  if (input.default_data !== undefined && !_isPlainObject(input.default_data)) {
    return { ok: false, reason: "invalid-default-data" };
  }
  if (input.default_tasks !== undefined && !Array.isArray(input.default_tasks)) {
    return { ok: false, reason: "invalid-default-tasks" };
  }

  // organization_id is explicit: pass null for a global template, a uuid for
  // an org template. RLS gates which callers can do which.
  const row = {
    organization_id: input.organization_id ?? null,
    name,
    default_data:  input.default_data  ?? {},
    default_tasks: input.default_tasks ?? [],
  };

  const { data, error } = await supabase
    .from("case_templates")
    .insert(row)
    .select(TEMPLATE_COLS)
    .maybeSingle();
  if (error) return { ok: false, reason: "insert-error", error };
  return { ok: true, template: data };
}

export async function updateCaseTemplate(id, patch) {
  if (!supabase) return NO_CLIENT;
  if (!id) return { ok: false, reason: "invalid-id" };
  if (!patch || typeof patch !== "object") return { ok: false, reason: "invalid-patch" };

  // organization_id is intentionally not patchable — promoting a template
  // from org-scoped to global (or vice versa) is a privileged action that
  // would deserve its own dedicated path.
  const allowed = {};
  for (const key of PATCHABLE) {
    if (patch[key] === undefined) continue;
    if (key === "name") {
      const t = typeof patch.name === "string" ? patch.name.trim() : "";
      if (!t) return { ok: false, reason: "invalid-name" };
      allowed.name = t;
    } else if (key === "default_data") {
      if (!_isPlainObject(patch.default_data)) {
        return { ok: false, reason: "invalid-default-data" };
      }
      allowed.default_data = patch.default_data;
    } else if (key === "default_tasks") {
      if (!Array.isArray(patch.default_tasks)) {
        return { ok: false, reason: "invalid-default-tasks" };
      }
      allowed.default_tasks = patch.default_tasks;
    }
  }
  if (Object.keys(allowed).length === 0) return { ok: false, reason: "empty-patch" };

  const { data, error } = await supabase
    .from("case_templates")
    .update(allowed)
    .eq("id", id)
    .select(TEMPLATE_COLS)
    .maybeSingle();
  if (error) return { ok: false, reason: "update-error", error };
  return { ok: true, template: data };
}

// Pure, sync helper. Merges template.default_data with the caller-supplied
// baseCase and stamps status='open'. baseCase wins over defaults so the
// caller can override any field; status is forced last because a freshly
// applied template always yields a new, open case. default_tasks is returned
// as-is — V1 does not auto-create case_tasks rows; the caller decides.
export function applyTemplate(template, baseCase = {}) {
  const defaults = template && _isPlainObject(template.default_data)
    ? template.default_data
    : {};
  const overlay  = _isPlainObject(baseCase) ? baseCase : {};
  const tasks    = template && Array.isArray(template.default_tasks)
    ? template.default_tasks
    : [];
  return {
    case:  { ...defaults, ...overlay, status: "open" },
    tasks,
  };
}
