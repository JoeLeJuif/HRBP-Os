// ── /api/stripe-checkout ─────────────────────────────────────────────────────
// Sprint 3 — Étape 3. Auth-gated Stripe Checkout Session creator.
//
// Flow:
//   1. Validate Supabase JWT (Bearer).
//   2. Resolve the caller's organization_id via public.profiles.
//   3. Look up an existing subscription row — reuse stripe_customer_id when
//      present, otherwise create a fresh Stripe customer.
//   4. Create a subscription-mode Checkout Session and return its URL.
//
// Orgs without Stripe configured keep working: the endpoint short-circuits
// with 500 + a clear error so the Billing UI can fall back to its existing
// read-only view. Free/trial orgs that never hit this endpoint are unaffected.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_PRICE_ID   = process.env.STRIPE_PRICE_ID   || "";

const ALLOWED_ORIGIN = (process.env.HRBPOS_ORIGIN || "https://hrbp-os.vercel.app").trim();

function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req, res) {
  applyCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }

  if (!STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: { message: "Stripe non configuré" } });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: { message: "Supabase non configuré" } });
  }

  const authHeader = req.headers["authorization"] || req.headers["Authorization"] || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(authHeader).trim());
  if (!match) return res.status(401).json({ error: { message: "Unauthorized" } });
  const token = match[1].trim();

  // Per-request client carrying the user's JWT so RLS resolves the caller.
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  let user;
  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: { message: "Unauthorized" } });
    user = data.user;
  } catch {
    return res.status(401).json({ error: { message: "Unauthorized" } });
  }

  const { data: profile, error: pErr } = await sb
    .from("profiles")
    .select("organization_id, email")
    .eq("id", user.id)
    .maybeSingle();
  if (pErr) {
    return res.status(500).json({ error: { message: "Lecture du profil échouée" } });
  }
  if (!profile || !profile.organization_id) {
    return res.status(400).json({ error: { message: "Aucune organisation associée" } });
  }
  const organizationId = profile.organization_id;

  const { data: sub, error: sErr } = await sb
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (sErr) {
    return res.status(500).json({ error: { message: "Lecture de l'abonnement échouée" } });
  }

  let stripe;
  try {
    const StripeMod = await import("stripe");
    const Stripe = StripeMod.default || StripeMod;
    stripe = new Stripe(STRIPE_SECRET_KEY);
  } catch {
    return res.status(500).json({ error: { message: "SDK Stripe indisponible" } });
  }

  let customerId = sub?.stripe_customer_id || null;
  if (!customerId) {
    try {
      const customer = await stripe.customers.create({
        email: profile.email || user.email || undefined,
        metadata: { organization_id: organizationId, user_id: user.id },
      });
      customerId = customer.id;
    } catch (err) {
      console.error("[stripe-checkout] customer create failed:", err?.message);
      return res.status(502).json({ error: { message: "Création du client Stripe échouée" } });
    }
  }

  const body = (req.body && typeof req.body === "object") ? req.body : {};
  const priceId = body.priceId || STRIPE_PRICE_ID;
  if (!priceId) {
    return res.status(400).json({ error: { message: "STRIPE_PRICE_ID manquant" } });
  }

  const origin = req.headers["origin"] || ALLOWED_ORIGIN;
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/?billing=cancel`,
      client_reference_id: organizationId,
      subscription_data: {
        metadata: { organization_id: organizationId },
      },
      metadata: { organization_id: organizationId, user_id: user.id },
    });
  } catch (err) {
    console.error("[stripe-checkout] session create failed:", err?.message);
    return res.status(502).json({ error: { message: "Création de la session Checkout échouée" } });
  }

  return res.status(200).json({ url: session.url });
}
