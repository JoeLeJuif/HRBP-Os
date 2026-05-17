// ── /api/stripe-webhook ──────────────────────────────────────────────────────
// Sprint 3 — Étape 2. Verifies Stripe signatures and reconciles
// public.subscriptions from the lifecycle events that drive payment status:
//   - checkout.session.completed
//   - customer.subscription.created
//   - customer.subscription.updated
//   - customer.subscription.deleted
//   - invoice.payment_failed     (resync from Stripe — status reflects past_due)
//   - invoice.payment_succeeded  (resync from Stripe — status reflects recovery)
//
// Requires SUPABASE_SERVICE_ROLE_KEY to bypass RLS — the subscriptions table
// exposes a SELECT-only policy to authenticated callers. Other events are
// acknowledged with 200 so Stripe does not retry indefinitely.

import { createClient } from "@supabase/supabase-js";

import { sendTransactionalEmail } from "./lib/email.js";
import { paymentFailedEmail } from "./lib/emailTemplates.js";

export const config = { api: { bodyParser: false } };

const STRIPE_SECRET_KEY     = process.env.STRIPE_SECRET_KEY     || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const APP_URL = (process.env.HRBPOS_ORIGIN || "https://hrbp-os.vercel.app").trim();

const admin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null;

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(typeof c === "string" ? Buffer.from(c) : c));
    req.on("end",  () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function toIso(unixSeconds) {
  if (unixSeconds === null || unixSeconds === undefined) return null;
  const ms = Number(unixSeconds) * 1000;
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function pickCustomerId(stripeCustomer) {
  if (!stripeCustomer) return null;
  if (typeof stripeCustomer === "string") return stripeCustomer;
  return stripeCustomer.id || null;
}

function pickSubscriptionId(stripeSubscription) {
  if (!stripeSubscription) return null;
  if (typeof stripeSubscription === "string") return stripeSubscription;
  return stripeSubscription.id || null;
}

async function upsertByOrg(orgId, fields) {
  if (!admin || !orgId) return;
  const payload = { ...fields, updated_at: new Date().toISOString() };
  const { data: existing, error: selErr } = await admin
    .from("subscriptions")
    .select("id")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (selErr) {
    console.error("[stripe-webhook] subscription lookup failed:", selErr.message);
    return;
  }
  if (existing) {
    const { error } = await admin
      .from("subscriptions")
      .update(payload)
      .eq("organization_id", orgId);
    if (error) console.error("[stripe-webhook] subscription update failed:", error.message);
  } else {
    const { error } = await admin
      .from("subscriptions")
      .insert({ organization_id: orgId, ...payload });
    if (error) console.error("[stripe-webhook] subscription insert failed:", error.message);
  }
}

async function updateBySubscriptionId(stripeSubscriptionId, fields) {
  if (!admin || !stripeSubscriptionId) return;
  const { error } = await admin
    .from("subscriptions")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", stripeSubscriptionId);
  if (error) console.error("[stripe-webhook] update-by-sub failed:", error.message);
}

// Maps a Stripe Subscription object onto our subscriptions row. `overrides`
// wins over derived values — used by `customer.subscription.deleted` to pin
// status to 'canceled' regardless of what Stripe sends in the event payload.
// Falls back to update-by-subscription-id when metadata.organization_id is
// missing so existing rows still get refreshed.
async function upsertSubscriptionFromStripe(subscription, overrides = {}) {
  if (!admin || !subscription) return;

  const orgId = subscription.metadata?.organization_id || null;
  const subscriptionId = pickSubscriptionId(subscription);
  const firstItem = Array.isArray(subscription.items?.data) ? subscription.items.data[0] : null;
  const priceId = firstItem?.price?.id || null;
  // current_period_start/end migrated from the top-level Subscription to the
  // SubscriptionItem in newer Stripe API versions. Honor both shapes.
  const periodStart = subscription.current_period_start ?? firstItem?.current_period_start ?? null;
  const periodEnd   = subscription.current_period_end   ?? firstItem?.current_period_end   ?? null;

  const fields = {
    stripe_customer_id:     pickCustomerId(subscription.customer),
    stripe_subscription_id: subscriptionId,
    stripe_price_id:        priceId,
    status:                 subscription.status || null,
    current_period_start:   toIso(periodStart),
    current_period_end:     toIso(periodEnd),
    trial_start:            toIso(subscription.trial_start),
    // trial_ends_at is the canonical column read by Admin.jsx; mirror Stripe's
    // trial_end onto it so the UI stays correct after a Stripe-driven update.
    trial_ends_at:          toIso(subscription.trial_end),
    cancel_at_period_end:   Boolean(subscription.cancel_at_period_end),
    canceled_at:            toIso(subscription.canceled_at),
    ...overrides,
  };

  if (orgId) {
    await upsertByOrg(orgId, fields);
    return;
  }
  if (subscriptionId) {
    await updateBySubscriptionId(subscriptionId, fields);
    return;
  }
  console.warn("[stripe-webhook] subscription event missing org metadata and subscription id");
}

async function resyncSubscriptionFromInvoice(stripe, invoice) {
  const subscriptionId = pickSubscriptionId(invoice?.subscription);
  if (!subscriptionId) {
    console.warn("[stripe-webhook] invoice without subscription — skipping");
    return;
  }
  let subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (err) {
    console.error("[stripe-webhook] subscription retrieve failed:", err?.message);
    return;
  }
  await upsertSubscriptionFromStripe(subscription);
}

async function lookupOrgForCustomer(stripeCustomerId) {
  if (!admin || !stripeCustomerId) return { organizationId: null, organizationName: null };
  const { data: subRow, error: sErr } = await admin
    .from("subscriptions")
    .select("organization_id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  if (sErr || !subRow?.organization_id) return { organizationId: null, organizationName: null };
  const { data: org, error: oErr } = await admin
    .from("organizations")
    .select("name")
    .eq("id", subRow.organization_id)
    .maybeSingle();
  if (oErr) return { organizationId: subRow.organization_id, organizationName: null };
  return { organizationId: subRow.organization_id, organizationName: org?.name || null };
}

async function lookupOrgOwnerEmail(organizationId) {
  if (!admin || !organizationId) return null;
  const { data: profile, error } = await admin
    .from("profiles")
    .select("email")
    .eq("organization_id", organizationId)
    .eq("status", "approved")
    .in("role", ["super_admin", "admin"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !profile?.email) return null;
  return profile.email;
}

async function resolveCustomerEmail(stripe, invoice, organizationId) {
  if (invoice?.customer_email) return invoice.customer_email;
  if (invoice?.customer_details?.email) return invoice.customer_details.email;
  const customerId = pickCustomerId(invoice?.customer);
  if (customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer && !customer.deleted && customer.email) return customer.email;
    } catch (err) {
      console.warn("[stripe-webhook] customer retrieve failed:", err?.message);
    }
  }
  const ownerEmail = await lookupOrgOwnerEmail(organizationId);
  return ownerEmail || null;
}

async function buildManageBillingUrl(stripe, customerId) {
  if (!customerId) return APP_URL;
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${APP_URL}/?billing=portal-return`,
    });
    if (session?.url) return session.url;
  } catch (err) {
    console.warn("[stripe-webhook] billing portal session create failed:", err?.message);
  }
  return APP_URL;
}

// Sends the payment-failed email. Wrapped in try/catch so a failure here never
// bubbles up — Stripe must always get a 200 from the webhook regardless.
async function sendPaymentFailedEmailSafe(stripe, invoice) {
  try {
    const customerId = pickCustomerId(invoice?.customer);
    const subscriptionId = pickSubscriptionId(invoice?.subscription);
    const { organizationId, organizationName } = await lookupOrgForCustomer(customerId);
    const to = await resolveCustomerEmail(stripe, invoice, organizationId);
    if (!to) {
      console.warn("[stripe-webhook] payment_failed: no recipient email resolved — skipping email");
      return;
    }
    const manageBillingUrl = await buildManageBillingUrl(stripe, customerId);
    const template = paymentFailedEmail({ organizationName, manageBillingUrl });
    const result = await sendTransactionalEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      type: "payment_failed",
      metadata: {
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        stripe_invoice_id: invoice?.id || null,
        organization_id: organizationId,
      },
    });
    if (result?.ok) {
      console.log(`[stripe-webhook] payment_failed email sent to ${to} (id=${result.id || "n/a"})`);
    } else if (result?.skipped) {
      console.warn(`[stripe-webhook] payment_failed email skipped: ${result.reason}`);
    } else {
      console.error(`[stripe-webhook] payment_failed email failed: ${result?.error || "unknown"}`);
    }
  } catch (err) {
    console.error("[stripe-webhook] payment_failed email error:", err?.message || String(err));
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return res.status(500).json({ error: { message: "Stripe non configuré" } });
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).json({ error: { message: "Missing stripe-signature" } });
  }

  let stripe;
  try {
    const StripeMod = await import("stripe");
    const Stripe = StripeMod.default || StripeMod;
    stripe = new Stripe(STRIPE_SECRET_KEY);
  } catch {
    return res.status(500).json({ error: { message: "SDK Stripe indisponible" } });
  }

  let raw;
  try {
    raw = await readRawBody(req);
  } catch {
    return res.status(400).json({ error: { message: "Body read failed" } });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed:", err?.message);
    return res.status(400).json({ error: { message: "Invalid signature" } });
  }

  if (!admin) {
    console.warn("[stripe-webhook] SUPABASE_SERVICE_ROLE_KEY missing — event acknowledged but not persisted");
    return res.status(200).json({ received: true, persisted: false });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        const orgId = s?.metadata?.organization_id || s?.client_reference_id || null;
        const customerId     = pickCustomerId(s?.customer);
        const subscriptionId = pickSubscriptionId(s?.subscription);
        await upsertByOrg(orgId, {
          stripe_customer_id:     customerId,
          stripe_subscription_id: subscriptionId,
          status: "active",
        });
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await upsertSubscriptionFromStripe(event.data.object);
        break;
      }

      case "customer.subscription.deleted": {
        // Force status=canceled and stamp canceled_at if Stripe didn't supply
        // one; preserve stripe_customer_id / stripe_subscription_id so future
        // recovery (re-subscribing the same customer) can locate the row.
        const sub = event.data.object;
        const overrides = { status: "canceled" };
        if (!sub?.canceled_at) overrides.canceled_at = new Date().toISOString();
        await upsertSubscriptionFromStripe(sub, overrides);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        await resyncSubscriptionFromInvoice(stripe, invoice);
        await sendPaymentFailedEmailSafe(stripe, invoice);
        break;
      }

      case "invoice.payment_succeeded": {
        await resyncSubscriptionFromInvoice(stripe, event.data.object);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("[stripe-webhook] handler error:", err?.message);
    return res.status(500).json({ error: { message: "Handler failed" } });
  }

  return res.status(200).json({ received: true });
}
