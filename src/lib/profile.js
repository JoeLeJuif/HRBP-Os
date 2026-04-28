// ── Profile fetch + admin operations ─────────────────────────────────────────
// Reads/writes public.profiles + public.organizations. RLS is currently OFF
// on both tables, so the publishable key can perform these operations directly
// until RLS lands.
//
// Return shapes:
//   fetchOrCreateProfile(user)       → { ok:true, profile } | { ok:false, reason, error? }
//   listProfilesByStatus(status)     → { ok:true, profiles:[...] } | { ok:false, reason, error? }
//   listAllProfiles()                → { ok:true, profiles:[...] } | { ok:false, reason, error? }
//   listPendingProfiles()            → alias of listProfilesByStatus("pending")
//   updateProfile(id, patch)         → { ok:true, profile } | { ok:false, reason, error? }
//   listOrganizations()              → { ok:true, organizations:[...] } | { ok:false, reason, error? }
//
// updateProfile accepts patch keys: status, role, organization_id (null clears).
// Status transitions are NOT enforced here; the Admin UI gates them.
//
// The "fallback" profile is always materialized in the DB so admins can see
// new sign-ups in the pending list. If the insert fails (race, network), we
// still resolve with an in-memory shape so the UI can show the pending screen.

import { supabase } from "./supabase.js";

const NO_CLIENT = { ok: false, reason: "no-client" };

const PROFILE_COLS = "id, email, status, role, organization_id, created_at, updated_at";

const FALLBACK = (user) => ({
  id: user?.id ?? null,
  email: user?.email ?? null,
  status: "pending",
  role: "viewer",
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
    role: "viewer",
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

export async function listAllProfiles() {
  if (!supabase) return NO_CLIENT;
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLS)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, reason: "query-error", error };
  return { ok: true, profiles: data ?? [] };
}

export async function listPendingProfiles() {
  return listProfilesByStatus("pending");
}

export async function updateProfile(id, patch) {
  if (!supabase) return NO_CLIENT;
  if (!id) return { ok: false, reason: "invalid-id" };
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

export async function listOrganizations() {
  if (!supabase) return NO_CLIENT;
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, created_at")
    .order("name", { ascending: true });
  if (error) return { ok: false, reason: "query-error", error };
  return { ok: true, organizations: data ?? [] };
}
