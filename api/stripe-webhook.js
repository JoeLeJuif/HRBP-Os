// ── /api/stripe-webhook ──────────────────────────────────────────────────────
// Sprint 3 — Étape 3. Verifies Stripe signatures and reconciles
// public.subscriptions from three minimal events:
//   - checkout.session.completed
//   - customer.subscription.updated
//   - customer.subscription.deleted
//
// Requires SUPABASE_SERVICE_ROLE_KEY to bypass RLS — the subscriptions table
// exposes a SELECT-only policy to authenticated callers. Other events are
// acknowledged with 200 so Stripe does not retry indefinitely.

import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: false } };

const STRIPE_SECRET_KEY     = process.env.STRIPE_SECRET_KEY     || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

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
  if (!unixSeconds && unixSeconds !== 0) return null;
  const ms = Number(unixSeconds) * 1000;
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function pickCustomerId(stripeCustomer) {
  if (!stripeCustomer) return null;
  if (typeof stripeCustomer === "string") return stripeCustomer;
  return stripeCustomer.id || null;
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
        const customerId       = pickCustomerId(s?.customer);
        const subscriptionId   = typeof s?.subscription === "string" ? s.subscription : (s?.subscription?.id || null);
        await upsertByOrg(orgId, {
          stripe_customer_id:     customerId,
          stripe_subscription_id: subscriptionId,
          status: "active",
        });
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const orgId = sub?.metadata?.organization_id || null;
        const fields = {
          stripe_customer_id:     pickCustomerId(sub?.customer),
          stripe_subscription_id: sub?.id || null,
          status: event.type === "customer.subscription.deleted" ? "canceled" : (sub?.status || "active"),
          current_period_start:   toIso(sub?.current_period_start),
          current_period_end:     toIso(sub?.current_period_end),
        };
        if (orgId) {
          await upsertByOrg(orgId, fields);
        } else if (sub?.id) {
          await updateBySubscriptionId(sub.id, fields);
        }
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
