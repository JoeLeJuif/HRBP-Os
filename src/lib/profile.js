// ── Profile fetch + admin operations ─────────────────────────────────────────
// Reads/writes public.profiles + public.organizations. RLS is enabled on both;
// the privileged-fields trigger blocks self-edits to status/role/organization_id,
// and admin-only operations route through SECURITY DEFINER RPCs.
//
// Return shapes:
//   fetchOrCreateProfile(user)       → { ok:true, profile } | { ok:false, reason, error? }
//   listProfilesByStatus(status)     → { ok:true, profiles:[...] } | { ok:false, reason, error? }
//   listAllProfiles()                → { ok:true, profiles:[...] } | { ok:false, reason, error? }
//   listPendingProfiles()            → alias of listProfilesByStatus("pending")
//   updateProfile(id, patch)         → { ok:true, profile } | { ok:false, reason, error? }
//   revokeUserAccess(id)             → { ok:true, profile } | { ok:false, reason, error? }
//   restoreUserAccess(id)            → { ok:true, profile } | { ok:false, reason, error? }
//   listOrganizations()              → { ok:true, organizations:[...] } | { ok:false, reason, error? }
//
// updateProfile accepts patch keys: status, role, organization_id (null clears).
// Status transitions for revoke/restore should go through the RPCs to capture
// the audit fields (disabled_at, disabled_by); updateProfile is reserved for
// approval (pending → approved with role/org) and role/org changes.
//
// The "fallback" profile is always materialized in the DB so admins can see
// new sign-ups in the pending list. If the insert fails (race, network), we
// still resolve with an in-memory shape so the UI can show the pending screen.

import { supabase } from "./supabase.js";

const NO_CLIENT = { ok: false, reason: "no-client" };

const PROFILE_COLS = "id, email, status, role, organization_id, disabled_at, disabled_by, created_at, updated_at";

// Org statuses recognized by the gate. trialing + active grant access;
// past_due / suspended / cancelled block the user at the org-status screen.
export const ORG_STATUSES = ["trialing", "active", "past_due", "suspended", "cancelled"];
export const ORG_ACTIVE_STATUSES = ["trialing", "active"];
export function isOrgStatusActive(status) {
  return ORG_ACTIVE_STATUSES.includes(status);
}

const FALLBACK = (user) => ({
  id: user?.id ?? null,
  email: user?.email ?? null,
  status: "pending",
  role: "hrbp",
  organization_id: null,
});

export async function fetchOrCreateProfile(user) {
  if (!supabase) return NO_CLIENT;
  if (!user || !user.id) return { ok: false, reason: "invalid-user" };

  const { data: existing, error: selErr } = await supabase
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("id", user.id)
    .maybeSingle();

  if (selErr) {
    return { ok: false, reason: "query-error", error: selErr };
  }
  if (existing) {
    return { ok: true, profile: existing };
  }

  const seed = {
    id: user.id,
    email: user.email ?? null,
    status: "pending",
    role: "hrbp",
  };
  const { data: inserted, error: insErr } = await supabase
    .from("profiles")
    .insert(seed)
    .select(PROFILE_COLS)
    .maybeSingle();

  if (insErr) {
    console.warn("[profile] insert failed, using in-memory fallback:", insErr);
    return { ok: true, profile: FALLBACK(user) };
  }
  return { ok: true, profile: inserted ?? FALLBACK(user) };
}

// Reads a single organization row. Used by the access gate to determine whether
// the org has an active subscription. Returns `{ ok:false, reason:"not-found" }`
// when the row is missing or invisible to the caller (RLS).
export async function fetchOrganization(orgId) {
  if (!supabase) return NO_CLIENT;
  if (!orgId) return { ok: false, reason: "invalid-id" };
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, status, created_at")
    .eq("id", orgId)
    .maybeSingle();
  if (error) return { ok: false, reason: "query-error", error };
  if (!data) return { ok: false, reason: "not-found" };
  return { ok: true, organization: data };
}

// super_admin-only update of organizations.status. Server enforces this via the
// `organizations_update_super_admin` RLS policy added 2026-05-13.
export async function updateOrganizationStatus(orgId, newStatus) {
  if (!supabase) return NO_CLIENT;
  if (!orgId) return { ok: false, reason: "invalid-id" };
  if (!ORG_STATUSES.includes(newStatus)) return { ok: false, reason: "invalid-status" };
  const { data, error } = await supabase
    .from("organizations")
    .update({ status: newStatus })
    .eq("id", orgId)
    .select("id, name, status, created_at")
    .maybeSingle();
  if (error) return { ok: false, reason: "query-error", error };
  if (!data) return { ok: false, reason: "not-allowed" };
  return { ok: true, organization: data };
}

// Org scope helper. super_admin can act on any profile; org admin can only act
// on profiles in its own organization (and must itself be approved + assigned
// to an org). Used by both the UI (to gate buttons) and the mutation services
// below (belt-and-suspenders against direct calls).
export function canActOnProfile(caller, target) {
  if (!caller || !target) return false;
  if (caller.status !== "approved") return false;
  if (caller.role === "super_admin") return true;
  if (caller.role !== "admin") return false;
  if (!caller.organization_id) return false;
  return target.organization_id === caller.organization_id;
}

const NOT_ALLOWED_CROSS_ORG = { ok: false, reason: "not-allowed-cross-org" };

export async function listProfilesByStatus(status) {
  if (!supabase) return NO_CLIENT;
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("status", status)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, reason: "query-error", error };
  return { ok: true, profiles: data ?? [] };
}

// Optional `{ organization_id }` narrows the list to that org. Pass `null` to
// only return profiles with no org assigned. Omit to fetch every row RLS
// allows. Org admins should always pass their own org_id; super_admin omits.
export async function listAllProfiles(opts = {}) {
  if (!supabase) return NO_CLIENT;
  let q = supabase
    .from("profiles")
    .select(PROFILE_COLS)
    .order("created_at", { ascending: true });
  if (opts && Object.prototype.hasOwnProperty.call(opts, "organization_id")) {
    if (opts.organization_id === null) q = q.is("organization_id", null);
    else if (opts.organization_id) q = q.eq("organization_id", opts.organization_id);
  }
  const { data, error } = await q;
  if (error) return { ok: false, reason: "query-error", error };
  return { ok: true, profiles: data ?? [] };
}

export async function listPendingProfiles() {
  return listProfilesByStatus("pending");
}

// `ctx` (optional) carries the caller and target profile to enforce same-org
// access. RLS + triggers + RPCs are still the source of truth on the server,
// but this short-circuits cross-org attempts before any network round-trip.
export async function updateProfile(id, patch, ctx = {}) {
  if (!supabase) return NO_CLIENT;
  if (!id) return { ok: false, reason: "invalid-id" };
  if (ctx.caller && ctx.target && !canActOnProfile(ctx.caller, ctx.target)) {
    return NOT_ALLOWED_CROSS_ORG;
  }
  // Only super_admin may change a profile's organization_id; for org admins,
  // strip that key from the patch even if the caller passed one.
  if (ctx.caller && ctx.caller.role !== "super_admin"
      && patch && typeof patch === "object"
      && Object.prototype.hasOwnProperty.call(patch, "organization_id")
      && patch.organization_id !== ctx.caller.organization_id) {
    return { ok: false, reason: "org-change-forbidden" };
  }
  const allowed = {};
  if (patch && typeof patch === "object") {
    if (patch.status !== undefined)          allowed.status          = patch.status;
    if (patch.role   !== undefined)          allowed.role            = patch.role;
    if (patch.organization_id !== undefined) allowed.organization_id = patch.organization_id || null;
  }
  if (Object.keys(allowed).length === 0) return { ok: false, reason: "empty-patch" };
  allowed.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("profiles")
    .update(allowed)
    .eq("id", id)
    .select(PROFILE_COLS)
    .maybeSingle();
  if (error) return { ok: false, reason: "query-error", error };
  return { ok: true, profile: data };
}

// Admin-only RPC: flips status to 'disabled' and stamps disabled_at/disabled_by.
// Server enforces admin role + approved status, blocks self-revoke, errors if
// target profile does not exist. Errors surface as { ok:false, reason }.
export async function revokeUserAccess(targetUserId, ctx = {}) {
  if (!supabase) return NO_CLIENT;
  if (!targetUserId) return { ok: false, reason: "invalid-id" };
  if (ctx.caller && ctx.target && !canActOnProfile(ctx.caller, ctx.target)) {
    return NOT_ALLOWED_CROSS_ORG;
  }
  const { data, error } = await supabase
    .rpc("revoke_user_access", { target_user_id: targetUserId });
  if (error) return { ok: false, reason: rpcReason(error), error };
  return { ok: true, profile: data };
}

// Admin-only RPC: flips status to 'approved' and clears disabled_at/disabled_by.
export async function restoreUserAccess(targetUserId, ctx = {}) {
  if (!supabase) return NO_CLIENT;
  if (!targetUserId) return { ok: false, reason: "invalid-id" };
  if (ctx.caller && ctx.target && !canActOnProfile(ctx.caller, ctx.target)) {
    return NOT_ALLOWED_CROSS_ORG;
  }
  const { data, error } = await supabase
    .rpc("restore_user_access", { target_user_id: targetUserId });
  if (error) return { ok: false, reason: rpcReason(error), error };
  return { ok: true, profile: data };
}

// super_admin-only RPC: assigns role ∈ {super_admin, admin, hrbp} to a target.
// Server enforces caller is super_admin AND approved, validates the role value,
// and refuses caller self-demotion. Errors normalized to { ok:false, reason }.
export const ROLES = ["super_admin", "admin", "hrbp"];

export async function setUserRole(targetUserId, newRole, ctx = {}) {
  if (!supabase) return NO_CLIENT;
  if (!targetUserId) return { ok: false, reason: "invalid-id" };
  if (!ROLES.includes(newRole)) return { ok: false, reason: "invalid-role" };
  if (ctx.caller && ctx.target && !canActOnProfile(ctx.caller, ctx.target)) {
    return NOT_ALLOWED_CROSS_ORG;
  }
  const { data, error } = await supabase
    .rpc("set_user_role", { target_user_id: targetUserId, new_role: newRole });
  if (error) return { ok: false, reason: rpcReason(error), error };
  return { ok: true, profile: data };
}

function rpcReason(error) {
  const msg = (error?.message || "").toLowerCase();
  if (msg.includes("super_admin only")) return "not-super-admin";
  if (msg.includes("admin only")) return "not-admin";
  if (msg.includes("admins cannot revoke their own access")) return "self-revoke";
  if (msg.includes("cannot demote yourself")) return "self-demote";
  if (msg.includes("invalid role")) return "invalid-role";
  if (msg.includes("authentication required")) return "not-authenticated";
  if (msg.includes("not found")) return "profile-not-found";
  return "rpc-error";
}

export async function listOrganizations() {
  if (!supabase) return NO_CLIENT;
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, status, created_at")
    .order("name", { ascending: true });
  if (error) return { ok: false, reason: "query-error", error };
  return { ok: true, organizations: data ?? [] };
}
