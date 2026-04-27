// ── Supabase auth wrapper (lean, magic-link only) ────────────────────────────
// Thin facade around supabase.auth so callers don't need to know whether the
// client exists. If env vars are missing, supabase is null and every call
// short-circuits with { ok:false, reason:"no-client" } — callers should fall
// back to localStorage-only mode.

import { supabase } from "./supabase.js";

const NO_CLIENT = { ok: false, reason: "no-client" };

export async function signIn(email) {
  if (!supabase) return NO_CLIENT;
  if (!email || typeof email !== "string") {
    return { ok: false, reason: "invalid-email" };
  }
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
  });
  if (error) return { ok: false, reason: "auth-error", error };
  return { ok: true, data };
}

export async function signOut() {
  if (!supabase) return NO_CLIENT;
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, reason: "auth-error", error };
  return { ok: true };
}

export async function getSession() {
  if (!supabase) return NO_CLIENT;
  const { data, error } = await supabase.auth.getSession();
  if (error) return { ok: false, reason: "auth-error", error };
  return { ok: true, session: data?.session ?? null };
}

export async function exchangeCodeForSession(href) {
  if (!supabase) return NO_CLIENT;
  const { data, error } = await supabase.auth.exchangeCodeForSession(href);
  if (error) return { ok: false, reason: "auth-error", error };
  return { ok: true, session: data?.session ?? null };
}

// Backend allow-list check. Queries public.allowed_users via RLS — the row is
// only readable when its email matches the JWT's email claim, so a returned
// row both proves access AND that the request was authenticated. Returns:
//   { ok:true, allowed:true }                  → email is on the list
//   { ok:true, allowed:false }                 → authenticated but not allowed
//   { ok:false, reason:"no-client" }           → Supabase not configured (caller should fall back)
//   { ok:false, reason:"query-error", error }  → query failed (treat as denied)
export async function isEmailAllowed(email) {
  if (!supabase) return NO_CLIENT;
  if (!email || typeof email !== "string") {
    return { ok: true, allowed: false };
  }
  const { data, error } = await supabase
    .from("allowed_users")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) return { ok: false, reason: "query-error", error };
  return { ok: true, allowed: !!data };
}

export function onAuthStateChange(callback) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    try { callback(event, session); } catch (err) { console.warn("[auth] callback threw:", err); }
  });
  return () => { try { data?.subscription?.unsubscribe(); } catch {} };
}
