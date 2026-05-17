// ── SaaS metrics ─────────────────────────────────────────────────────────────
// Aggregates super_admin-only SaaS health counters across organizations,
// subscriptions, plans, profiles, and the data tables. Designed for a Sprint-
// level cockpit inside Admin; no charts, no Stripe API calls — counts only.
//
// Access is delegated to RLS:
//   - super_admin sees every row (via private.is_admin / has_org_access)
//   - any other role gets their own-org rows only, so the numbers are
//     intentionally not meaningful for non-super_admins.
//
// Return shape:
//   { ok:true, metrics:{ organizations, subscriptions, revenue, trials,
//                        usage, adoption } }
//   { ok:false, reason:string, error?:any }

import { supabase } from "../lib/supabase.js";

const NO_CLIENT = { ok: false, reason: "no-client" };
const DAY_MS = 86400000;

function bucketBy(rows, key) {
  const out = {};
  for (const r of rows || []) {
    const v = (r && r[key]) || "unknown";
    out[v] = (out[v] || 0) + 1;
  }
  return out;
}

export async function getSaaSMetrics() {
  if (!supabase) return NO_CLIENT;

  const [orgsRes, subsRes, plansRes, profilesRes, casesRes, meetingsRes, invRes] =
    await Promise.all([
      supabase.from("organizations").select("id, status, created_at"),
      supabase.from("subscriptions")
        .select("id, status, plan_id, trial_ends_at, organization_id"),
      supabase.from("plans").select("id, code, name, monthly_price_cents"),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("cases").select("id", { count: "exact", head: true }),
      supabase.from("meetings").select("id", { count: "exact", head: true }),
      supabase.from("investigations").select("id", { count: "exact", head: true }),
    ]);

  const firstErr = [orgsRes, subsRes, plansRes, profilesRes, casesRes, meetingsRes, invRes]
    .find(r => r.error);
  if (firstErr) return { ok: false, reason: "query-error", error: firstErr.error };

  const organizations = orgsRes.data ?? [];
  const subscriptions = subsRes.data ?? [];
  const plans = plansRes.data ?? [];

  // ── Organizations ────────────────────────────────────────────────────────
  const orgsByStatus = bucketBy(organizations, "status");
  const totalOrganizations = organizations.length;
  const activeOrganizations = (orgsByStatus.active || 0) + (orgsByStatus.trialing || 0);
  const trialOrganizations = orgsByStatus.trialing || 0;
  const suspendedOrCancelled =
    (orgsByStatus.suspended || 0)
    + (orgsByStatus.cancelled || 0)
    + (orgsByStatus.past_due || 0);

  // ── Subscriptions ────────────────────────────────────────────────────────
  const subsByStatus = bucketBy(subscriptions, "status");
  const activeSubscriptions   = subsByStatus.active   || 0;
  const trialingSubscriptions = subsByStatus.trialing || 0;
  const pastDueSubscriptions  = subsByStatus.past_due || 0;
  const canceledSubscriptions = (subsByStatus.canceled || 0) + (subsByStatus.cancelled || 0);
  const unpaidOrIncomplete =
    (subsByStatus.unpaid || 0)
    + (subsByStatus.incomplete || 0)
    + (subsByStatus.incomplete_expired || 0);

  // ── Revenue ──────────────────────────────────────────────────────────────
  // MRR uses plan.monthly_price_cents for status='active' subscriptions only.
  // Trials are excluded (not billed yet). If no plan has a price set, mark
  // revenue as unavailable so the UI can display N/A.
  const planById = {};
  for (const p of plans) planById[p.id] = p;

  let mrrCents = 0;
  const revenueByPlanCents = {};
  for (const s of subscriptions) {
    if (s.status !== "active") continue;
    const plan = s.plan_id ? planById[s.plan_id] : null;
    const price = plan && typeof plan.monthly_price_cents === "number"
      ? plan.monthly_price_cents : 0;
    mrrCents += price;
    const key = plan?.code || "unknown";
    revenueByPlanCents[key] = (revenueByPlanCents[key] || 0) + price;
  }
  const arrCents = mrrCents * 12;
  const haveAnyPlanPrice = plans.some(
    p => typeof p.monthly_price_cents === "number" && p.monthly_price_cents > 0
  );
  const revenueAvailable = haveAnyPlanPrice && activeSubscriptions > 0;

  // ── Trials ───────────────────────────────────────────────────────────────
  const now = Date.now();
  const sevenDaysAhead = now + 7 * DAY_MS;
  let trialsActive = 0;
  let trialsExpiringIn7Days = 0;
  let trialsExpiredNotConverted = 0;
  for (const s of subscriptions) {
    if (s.status !== "trialing") continue;
    trialsActive++;
    if (!s.trial_ends_at) continue;
    const ends = new Date(s.trial_ends_at).getTime();
    if (Number.isNaN(ends)) continue;
    if (ends < now)             trialsExpiredNotConverted++;
    else if (ends <= sevenDaysAhead) trialsExpiringIn7Days++;
  }

  // ── Usage ────────────────────────────────────────────────────────────────
  const totalUsers          = profilesRes.count || 0;
  const totalCases          = casesRes.count    || 0;
  const totalMeetings       = meetingsRes.count || 0;
  const totalInvestigations = invRes.count      || 0;

  const avgCasesPerOrg    = totalOrganizations > 0 ? totalCases    / totalOrganizations : 0;
  const avgMeetingsPerOrg = totalOrganizations > 0 ? totalMeetings / totalOrganizations : 0;

  return {
    ok: true,
    metrics: {
      organizations: {
        total: totalOrganizations,
        active: activeOrganizations,
        trial: trialOrganizations,
        suspendedOrCancelled,
        byStatus: orgsByStatus,
      },
      subscriptions: {
        active: activeSubscriptions,
        trialing: trialingSubscriptions,
        pastDue: pastDueSubscriptions,
        canceled: canceledSubscriptions,
        unpaidOrIncomplete,
        byStatus: subsByStatus,
      },
      revenue: {
        available: revenueAvailable,
        mrrCents,
        arrCents,
        byPlanCents: revenueByPlanCents,
      },
      trials: {
        active: trialsActive,
        expiringIn7Days: trialsExpiringIn7Days,
        expiredNotConverted: trialsExpiredNotConverted,
      },
      usage: {
        totalUsers,
        totalCases,
        totalMeetings,
        totalInvestigations,
      },
      adoption: {
        avgCasesPerOrg,
        avgMeetingsPerOrg,
      },
    },
  };
}
