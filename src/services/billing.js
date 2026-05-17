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

// Sprint 3 — Étape 4: embed the plan code/name alongside the subscription so
// quota checks in planLimits.js can resolve the plan key from a single fetch.
// PostgREST embed via foreign key `subscriptions.plan_id → plans.id`.
const SUBSCRIPTION_SELECT = `${SUBSCRIPTION_COLS}, plan:plans(code, name)`;

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
    .select(SUBSCRIPTION_SELECT)
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

// Returns true iff Stripe is exposed to the client (publishable key was set
// at build time). The Billing UI uses this to decide whether the "Upgrade
// with Stripe" button is rendered; free / trial orgs keep working when the
// key is absent because the button simply never appears.
export function isStripeConfigured() {
  return Boolean(process.env.VITE_STRIPE_PUBLISHABLE_KEY);
}

// Starts a Stripe Checkout Session via /api/stripe-checkout and returns the
// redirect URL. Caller decides whether to navigate (window.location.assign).
// Auth is required — the server validates the Supabase JWT before talking
// to Stripe. Failure modes: "no-client", "no-session", "http-error".
export async function startStripeCheckout({ priceId } = {}) {
  if (!supabase) return NO_CLIENT;
  const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
  if (sessErr || !sessionData?.session?.access_token) {
    return { ok: false, reason: "no-session" };
  }
  const token = sessionData.session.access_token;
  let res;
  try {
    res = await fetch("/api/stripe-checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(priceId ? { priceId } : {}),
    });
  } catch (error) {
    return { ok: false, reason: "network-error", error };
  }
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok) {
    return { ok: false, reason: "http-error", status: res.status, message: body?.error?.message };
  }
  if (!body?.url) {
    return { ok: false, reason: "no-url" };
  }
  return { ok: true, url: body.url };
}

// Opens a Stripe Billing Portal session via /api/stripe-portal and returns
// the redirect URL. Caller decides whether to navigate. Auth is required.
// Failure modes: "no-client", "no-session", "network-error", "http-error",
// "no-url".
export async function openBillingPortal() {
  if (!supabase) return NO_CLIENT;
  const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
  if (sessErr || !sessionData?.session?.access_token) {
    return { ok: false, reason: "no-session" };
  }
  const token = sessionData.session.access_token;
  let res;
  try {
    res = await fetch("/api/stripe-portal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: "{}",
    });
  } catch (error) {
    return { ok: false, reason: "network-error", error };
  }
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok) {
    return { ok: false, reason: "http-error", status: res.status, message: body?.error?.message };
  }
  if (!body?.url) {
    return { ok: false, reason: "no-url" };
  }
  return { ok: true, url: body.url };
}

// Provisions a Starter trial subscription for the given org via the
// super_admin-only `create_starter_trial` RPC. Idempotent server-side: if a
// subscription already exists it is returned unchanged. Errors are normalized
// to the same shape as the rest of this module.
export async function createStarterTrial(organizationId) {
  if (!supabase) return NO_CLIENT;
  if (!organizationId) return { ok: false, reason: "invalid-id" };
  const { data, error } = await supabase.rpc("create_starter_trial", {
    p_organization_id: organizationId,
  });
  if (error) {
    const code = error.code || "";
    if (code === "42501") return { ok: false, reason: "not-super-admin", error };
    if (code === "P0002") return { ok: false, reason: "not-found", error };
    if (code === "22023") return { ok: false, reason: "invalid-id", error };
    return { ok: false, reason: "rpc-error", error };
  }
  return { ok: true, subscription: data || null };
}
