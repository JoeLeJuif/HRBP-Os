// ── Billing read service ─────────────────────────────────────────────────────
// Read-only access to plans / subscriptions / usage_counters for the Admin
// Billing panel (Sprint 3 — Étape 1). Stripe is NOT wired here; mutation/
// webhook handlers come in a later step. Service follows the same isolation
// + return-shape policy as the other services in this folder:
//
//   getOrganizationBilling(orgId) → { ok:true, subscription, plan, usage:[...] }
//                                 | { ok:false, reason:string, error? }
//   listPlans()                   → { ok:true, plans:[...] } | { ok:false, ... }
//
// Failure modes: "no-client" (Supabase env vars unset), "invalid-id",
// "query-error". The Admin panel renders a "non configuré" hint on no-client
// so the app stays usable without billing rows present.

import { supabase } from "../lib/supabase.js";

const NO_CLIENT = { ok: false, reason: "no-client" };

const SUBSCRIPTION_COLS = [
  "id", "organization_id", "plan_id", "status",
  "stripe_customer_id", "stripe_subscription_id",
  "current_period_start", "current_period_end", "trial_ends_at",
  "created_at", "updated_at",
].join(", ");

const PLAN_COLS = [
  "id", "code", "name", "monthly_price_cents",
  "max_users", "max_cases", "max_ai_requests",
  "is_active", "created_at",
].join(", ");

const USAGE_COLS = [
  "id", "organization_id", "metric", "period_start", "value",
  "created_at", "updated_at",
].join(", ");

export async function listPlans() {
  if (!supabase) return NO_CLIENT;
  const { data, error } = await supabase
    .from("plans")
    .select(PLAN_COLS)
    .order("monthly_price_cents", { ascending: true });
  if (error) return { ok: false, reason: "query-error", error };
  return { ok: true, plans: data ?? [] };
}

export async function fetchSubscription(orgId) {
  if (!supabase) return NO_CLIENT;
  if (!orgId) return { ok: false, reason: "invalid-id" };
  const { data, error } = await supabase
    .from("subscriptions")
    .select(SUBSCRIPTION_COLS)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) return { ok: false, reason: "query-error", error };
  return { ok: true, subscription: data || null };
}

export async function fetchPlan(planId) {
  if (!supabase) return NO_CLIENT;
  if (!planId) return { ok: false, reason: "invalid-id" };
  const { data, error } = await supabase
    .from("plans")
    .select(PLAN_COLS)
    .eq("id", planId)
    .maybeSingle();
  if (error) return { ok: false, reason: "query-error", error };
  return { ok: true, plan: data || null };
}

// Returns the most-recent usage counters for the org, newest period first.
// `limit` caps the row count (default 24 — two years of monthly buckets).
export async function fetchUsageCounters(orgId, { limit = 24 } = {}) {
  if (!supabase) return NO_CLIENT;
  if (!orgId) return { ok: false, reason: "invalid-id" };
  const { data, error } = await supabase
    .from("usage_counters")
    .select(USAGE_COLS)
    .eq("organization_id", orgId)
    .order("period_start", { ascending: false })
    .limit(limit);
  if (error) return { ok: false, reason: "query-error", error };
  return { ok: true, usage: data ?? [] };
}

// One-shot for the Admin Billing panel: returns subscription + the plan it
// points to + recent usage counters in a single call. `subscription` and
// `plan` may be null when nothing is provisioned for the org yet — that's a
// successful response, not a failure. Errors short-circuit and propagate the
// first failing call's reason.
export async function getOrganizationBilling(orgId) {
  if (!supabase) return NO_CLIENT;
  if (!orgId) return { ok: false, reason: "invalid-id" };

  const sRes = await fetchSubscription(orgId);
  if (!sRes.ok) return sRes;

  let plan = null;
  if (sRes.subscription && sRes.subscription.plan_id) {
    const pRes = await fetchPlan(sRes.subscription.plan_id);
    if (!pRes.ok) return pRes;
    plan = pRes.plan;
  }

  const uRes = await fetchUsageCounters(orgId);
  if (!uRes.ok) return uRes;

  return {
    ok: true,
    subscription: sRes.subscription,
    plan,
    usage: uRes.usage,
  };
}
