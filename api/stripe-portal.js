// ── /api/stripe-portal ───────────────────────────────────────────────────────
// Auth-gated Stripe Billing Portal session creator. Lets a connected user
// manage their card, view/download invoices, cancel their subscription, and
// switch plans (when configured in Stripe).
//
// Flow:
//   1. Validate Supabase JWT (Bearer).
//   2. Resolve the caller's organization_id via public.profiles.
//   3. Read stripe_customer_id from the org's subscription row.
//   4. Create a Stripe Billing Portal session and return its URL.
//
// Orgs without a Stripe customer get a clear 400 so the UI can explain that
// billing isn't set up yet.

import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "./lib/env.js";
import { withSentry } from "./lib/sentry.js";

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

const ALLOWED_ORIGIN = (process.env.HRBPOS_ORIGIN || "https://hrbp-os.vercel.app").trim();

function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function handler(req, res) {
  applyCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }

  if (requireEnv("stripe", res, "api/stripe-portal")) return;
  if (requireEnv("supabase-read", res, "api/stripe-portal")) return;

  const authHeader = req.headers["authorization"] || req.headers["Authorization"] || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(authHeader).trim());
  if (!match) return res.status(401).json({ error: { message: "Unauthorized" } });
  const token = match[1].trim();

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
    .select("organization_id")
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
    .select("stripe_customer_id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (sErr) {
    return res.status(500).json({ error: { message: "Lecture de l'abonnement échouée" } });
  }
  if (!sub?.stripe_customer_id) {
    return res.status(400).json({
      error: { message: "Aucun client Stripe associé à cette organisation" },
    });
  }

  let stripe;
  try {
    const StripeMod = await import("stripe");
    const Stripe = StripeMod.default || StripeMod;
    stripe = new Stripe(STRIPE_SECRET_KEY);
  } catch {
    return res.status(500).json({ error: { message: "SDK Stripe indisponible" } });
  }

  const origin = req.headers["origin"] || ALLOWED_ORIGIN;
  let session;
  try {
    session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/?billing=portal-return`,
    });
  } catch (err) {
    console.error("[stripe-portal] session create failed:", err?.message);
    return res.status(502).json({ error: { message: "Création de la session Portal échouée" } });
  }

  return res.status(200).json({ url: session.url });
}

export default withSentry(handler);
