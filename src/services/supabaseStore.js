// ── supabaseStore ────────────────────────────────────────────────────────────
// Isolated persistence layer for Supabase. NOT wired into the app yet.
// All save functions normalize input before sending. All functions fail safely.
//
// Return shape:
//   load*() → { ok: true, data: [...] } | { ok: false, reason: string, error? }
//   save*() → { ok: true, count: number } | { ok: false, reason: string, error? }
//
// Tables: cases, investigations, meetings, briefs (see supabase/schema.sql)
// Rows:   { id text, user_id text, data jsonb, created_at, updated_at }

import { supabase } from "../lib/supabase.js";
import { normalizeCase, normalizeInvestigation } from "../utils/normalize.js";
import { normalizeMeetingOutput } from "../utils/meetingModel.js";

function normalizeBrief(b) {
  if (!b || typeof b !== "object") return null;
  const id = b.id != null ? String(b.id) : null;
  if (!id) return null;
  return { ...b, id };
}

const DEFAULT_USER = "demo";
const NO_CLIENT = { ok: false, reason: "no-client" };
const NO_SESSION = { ok: false, reason: "no-session" };

async function getSessionUserId() {
  if (!supabase || !supabase.auth || typeof supabase.auth.getSession !== "function") return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    const uid = data && data.session && data.session.user && data.session.user.id;
    return uid || null;
  } catch {
    return null;
  }
}

// Cached per-session profile.organization_id lookup. The org rarely changes
// inside a session, so we read once and reuse. Returns null on any failure
// (no client, no session, no profile, no org assigned) — callers must treat
// null as "leave organization_id unset on the row".
let _cachedOrgUserId = null;
let _cachedOrgId = null;
async function getSessionOrgId(sessionUserId) {
  if (!supabase) return null;
  if (!sessionUserId) return null;
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

// ── internals ────────────────────────────────────────────────────────────────

async function loadTable(table, userId = DEFAULT_USER) {
  if (!supabase) return NO_CLIENT;
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) return NO_SESSION;
  const sessionOrgId = await getSessionOrgId(sessionUserId);
  try {
    const { data, error } = await supabase
      .from(table)
      .select("id, data, organization_id, created_at, updated_at")
      .eq("user_id", sessionUserId);
    if (error) return { ok: false, reason: "query-error", error };
    const rawRows = Array.isArray(data) ? data : [];
    // Org-scoped read: rows are already constrained to the current auth user
    // via .eq("user_id"). On top of that, keep rows whose organization_id
    // matches the user's org, plus legacy rows where organization_id is null
    // (current-user legacy fallback). Drop anything tagged to a different org.
    const rows = rawRows
      .filter(r => r && (r.organization_id == null || r.organization_id === sessionOrgId))
      .map(r => {
        if (!r.data) return null;
        if (r.organization_id && r.data.organization_id == null) {
          return { ...r.data, organization_id: r.organization_id };
        }
        return r.data;
      })
      .filter(d => d && d.__deleted !== true);
    return { ok: true, data: rows };
  } catch (error) {
    return { ok: false, reason: "exception", error };
  }
}

async function saveTable(table, items, normalizer, userId = DEFAULT_USER) {
  if (!supabase) return NO_CLIENT;
  if (!Array.isArray(items)) return { ok: false, reason: "not-array" };
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) return NO_SESSION;
  const sessionOrgId = await getSessionOrgId(sessionUserId);
  const orgId = sessionOrgId || null;
  const rows = [];
  for (const raw of items) {
    const norm = normalizer(raw);
    if (!norm || !norm.id) continue;
    norm.organization_id = orgId;
    rows.push({
      id: String(norm.id),
      user_id: sessionUserId,
      data: norm,
      organization_id: orgId,
      updated_at: new Date().toISOString(),
    });
  }
  if (rows.length === 0) return { ok: true, count: 0 };
  try {
    const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });
    if (error) return { ok: false, reason: "upsert-error", error };
    return { ok: true, count: rows.length };
  } catch (error) {
    return { ok: false, reason: "exception", error };
  }
}

// ── public API ───────────────────────────────────────────────────────────────

export function loadCases(userId)         { return loadTable("cases", userId); }
export function loadInvestigations(userId){ return loadTable("investigations", userId); }
export function loadMeetings(userId)      { return loadTable("meetings", userId); }
export function loadBriefs(userId)        { return loadTable("briefs", userId); }

export async function saveCases(cases, userId) {
  if (!supabase) return NO_CLIENT;
  if (!Array.isArray(cases)) return { ok: false, reason: "not-array" };
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) return NO_SESSION;
  const sessionOrgId = await getSessionOrgId(sessionUserId);

  const now = new Date().toISOString();
  const rows = [];
  const liveIds = new Set();
  // Authoritative org tag: every saved case is stamped with the current
  // user's organization_id (null if the user is not assigned to one).
  const orgId = sessionOrgId || null;
  for (const raw of cases) {
    const norm = normalizeCase(raw);
    if (!norm || !norm.id) continue;
    const idStr = String(norm.id);
    liveIds.add(idStr);
    norm.organization_id = orgId;
    rows.push({
      id: idStr,
      user_id: sessionUserId,
      data: norm,
      organization_id: orgId,
      updated_at: now,
    });
  }

  // Reconcile deletions: any DB row for this user not in the current list
  // gets marked as a tombstone (RLS has no DELETE policy, only UPDATE).
  try {
    const { data: existing, error: selErr } = await supabase
      .from("cases")
      .select("id, data, organization_id")
      .eq("user_id", sessionUserId);
    if (!selErr && Array.isArray(existing)) {
      for (const ex of existing) {
        if (!ex || !ex.id || liveIds.has(ex.id)) continue;
        if (ex.data && ex.data.__deleted === true) continue;
        rows.push({
          id: ex.id,
          user_id: sessionUserId,
          data: { id: ex.id, __deleted: true, deleted_at: now },
          organization_id: ex.organization_id || null,
          updated_at: now,
        });
      }
    }
  } catch {
    // best-effort reconciliation
  }

  if (rows.length === 0) return { ok: true, count: 0 };
  try {
    const { error } = await supabase.from("cases").upsert(rows, { onConflict: "id" });
    if (error) return { ok: false, reason: "upsert-error", error };
    return { ok: true, count: rows.length };
  } catch (error) {
    return { ok: false, reason: "exception", error };
  }
}
export function saveInvestigations(investigations, userId) {
  return saveTable("investigations", investigations, normalizeInvestigation, userId);
}
export function saveMeetings(meetings, userId) {
  return saveTable("meetings", meetings, normalizeMeetingOutput, userId);
}
export function saveBriefs(briefs, userId) {
  return saveTable("briefs", briefs, normalizeBrief, userId);
}
