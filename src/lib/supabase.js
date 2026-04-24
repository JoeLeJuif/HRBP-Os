// ── Supabase client (lean, no auth, no RLS yet) ──────────────────────────────
// Build-time env vars (injected by build.js via esbuild --define):
//   VITE_SUPABASE_URL               → Supabase project URL
//   VITE_SUPABASE_PUBLISHABLE_KEY   → Supabase publishable (anon) key
//
// At build time, esbuild replaces `process.env.VITE_SUPABASE_*` with string
// literals — no `process` object exists at runtime. If either var is missing,
// the literal is `""`, `supabase` exports as `null`, and the service layer
// short-circuits safely — localStorage remains untouched.

import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

export const supabase = (url && key) ? createClient(url, key) : null;

export const hasSupabase = Boolean(supabase);
