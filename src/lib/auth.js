// ── Supabase auth wrapper (lean, magic-link only, non-blocking) ──────────────
// Thin facade around supabase.auth so callers don't need to know whether the
// client exists. If env vars are missing, supabase is null and every call
// short-circuits with { ok:false, reason:"no-client" }. The app is unaffected
// — local AUTH_KEY login still gates the UI.

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

export function onAuthStateChange(callback) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    try { callback(event, session); } catch (err) { console.warn("[auth] callback threw:", err); }
  });
  return () => { try { data?.subscription?.unsubscribe(); } catch {} };
}
