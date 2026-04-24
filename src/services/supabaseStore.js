// ── supabaseStore ────────────────────────────────────────────────────────────
// Isolated persistence layer for Supabase. NOT wired into the app yet.
// All save functions normalize input before sending. All functions fail safely.
//
// Return shape:
//   load*() → { ok: true, data: [...] } | { ok: false, reason: string, error? }
//   save*() → { ok: true, count: number } | { ok: false, reason: string, error? }
//
// Tables: cases, investigations, meetings (see supabase/schema.sql)
// Rows:   { id text, user_id text, data jsonb, created_at, updated_at }

import { supabase } from "../lib/supabase.js";
import { normalizeCase, normalizeInvestigation } from "../utils/normalize.js";
import { normalizeMeetingOutput } from "../utils/meetingModel.js";

const DEFAULT_USER = "demo";
const NO_CLIENT = { ok: false, reason: "no-client" };

// ── internals ────────────────────────────────────────────────────────────────

async function loadTable(table, userId = DEFAULT_USER) {
  if (!supabase) return NO_CLIENT;
  try {
    const { data, error } = await supabase
      .from(table)
      .select("id, data, created_at, updated_at")
      .eq("user_id", userId);
    if (error) return { ok: false, reason: "query-error", error };
    const rows = Array.isArray(data) ? data.map(r => r && r.data ? r.data : null).filter(Boolean) : [];
    return { ok: true, data: rows };
  } catch (error) {
    return { ok: false, reason: "exception", error };
  }
}

async function saveTable(table, items, normalizer, userId = DEFAULT_USER) {
  if (!supabase) return NO_CLIENT;
  if (!Array.isArray(items)) return { ok: false, reason: "not-array" };
  const rows = [];
  for (const raw of items) {
    const norm = normalizer(raw);
    if (!norm || !norm.id) continue;
    rows.push({
      id: String(norm.id),
      user_id: userId,
      data: norm,
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

export function saveCases(cases, userId) {
  return saveTable("cases", cases, normalizeCase, userId);
}
export function saveInvestigations(investigations, userId) {
  return saveTable("investigations", investigations, normalizeInvestigation, userId);
}
export function saveMeetings(meetings, userId) {
  return saveTable("meetings", meetings, normalizeMeetingOutput, userId);
}
