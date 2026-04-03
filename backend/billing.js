// @ts-check
/**
 * Billing routes: Stripe Checkout, Customer Portal, subscription status, webhook.
 *
 * Plans: basic, premium, studio (subscriptions) + topup (one-time)
 * Price IDs come from env: STRIPE_PRICE_ID_BASIC, _PREMIUM, _STUDIO, _TOPUP
 *
 * Product model (see docs/BILLING-AND-TOKENS.md):
 * - Monthly subscription; optional token allowance + spend by audio duration (metadata on Stripe Price).
 * - Basic: 2-stem Speed only. Premium+: 2-stem + 4-stem expand, Speed + Quality (+ Ultra for Studio tier).
 * - Use Stripe CLI: `stripe prices retrieve price_xxx` to inspect Price metadata (e.g. tokens_per_month).
 *
 * Routes:
 *   GET  /api/billing/subscription  — { active, plan } for current user
 *   GET  /api/billing/usage         — { balance, periodEnd } (usage tokens in Clerk privateMetadata)
 *   POST /api/billing/checkout      — create Stripe Checkout session { url }; body: { priceId, returnUrl }
 *   POST /api/billing/portal        — create Stripe Customer Portal session { url }
 *   POST /api/billing/webhook       — Stripe webhook (raw body, mounted before express.json)
 */
import express from "express";
import Stripe from "stripe";
import { getClerkClient, verifyClerkBearer } from "./clerkAuth.js";
import {
  getUsageBalance,
  creditSubscriptionAllowance,
  creditTopupTokens,
  tokensPerTopupFromPrice,
} from "./usageTokens.js";
import { resolveStripeReturnUrl } from "./returnUrl.js";
import { tryClaimWebhookEvent, releaseWebhookEventClaim } from "./stripeRedis.js";
import { publicErrorMessage } from "./clientSafeError.js";

const router = express.Router();

/**
 * Stripe API errors include `raw` and are usually safe to show (invalid price, etc.).
 * Other errors stay generic in production.
 * @param {unknown} err
 * @param {string} fallback
 */
function safeBillingError(err, fallback) {
  const msg =
    err && typeof err === "object" && "message" in err && typeof /** @type {{ message?: unknown }} */ (err).message === "string"
      ? /** @type {{ message: string }} */ (err).message
      : null;
  if (!msg) return fallback;
  if (process.env.NODE_ENV !== "production") return msg;
  if (err && typeof err === "object" && "raw" in err) return msg;
  return fallback;
}

// Price ID map — read at request time so restarts aren't needed after env changes
function getPriceIds() {
  return {
    basic:   process.env.STRIPE_PRICE_ID_BASIC   || "",
    premium: process.env.STRIPE_PRICE_ID_PREMIUM || "",
    studio:  process.env.STRIPE_PRICE_ID_STUDIO  || "",
    topup:   process.env.STRIPE_PRICE_ID_TOPUP   || "",
  };
}

// Lazy singleton — recreated if the key changes between restarts
let _stripe = /** @type {import("stripe").Stripe | null} */ (null);
let _stripeKey = "";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!key) { console.warn("[billing] STRIPE_SECRET_KEY not set"); return null; }
  if (key !== _stripeKey) { _stripe = new Stripe(key); _stripeKey = key; }
  return _stripe;
}

/**
 * Get or create a Stripe customer for a Clerk userId.
 * Persists stripeCustomerId in Clerk publicMetadata so it survives across sessions.
 * @param {string} userId
 * @returns {Promise<string>} stripeCustomerId
 */
async function getOrCreateStripeCustomer(userId) {
  const clerk = getClerkClient();
  const stripe = getStripe();
  if (!clerk || !stripe) throw new Error("Billing not configured");
  const user = await clerk.users.getUser(userId);
  const existing = /** @type {string|undefined} */ (user.publicMetadata?.stripeCustomerId);
  if (existing) return existing;
  const email = user.emailAddresses?.[0]?.emailAddress;
  const customer = await stripe.customers.create({
    email,
    metadata: { clerkUserId: userId },
  });
  const prevPublic =
    user.publicMetadata && typeof user.publicMetadata === "object" && !Array.isArray(user.publicMetadata)
      ? /** @type {Record<string, unknown>} */ ({ ...user.publicMetadata })
      : {};
  await clerk.users.updateUserMetadata(userId, {
    publicMetadata: { ...prevPublic, stripeCustomerId: customer.id },
  });
  return customer.id;
}

/**
 * Returns the active subscription for a customer, or null.
 * @param {string} customerId
 * @returns {Promise<import("stripe").Stripe.Subscription | null>}
 */
async function getActiveSubscription(customerId) {
  const stripe = getStripe();
  if (!stripe) return null;
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "active",
    limit: 1,
    expand: ["data.items.data.price"],
  });
  return subs.data[0] ?? null;
}

/**
 * Resolve a plan name from a Stripe subscription (matches against known price IDs).
 * @param {import("stripe").Stripe.Subscription} sub
 * @returns {string}
 */
function planFromSubscription(sub) {
  const priceId = sub.items?.data?.[0]?.price?.id;
  for (const [plan, id] of Object.entries(getPriceIds())) {
    if (id && id === priceId) return plan;
  }
  return "unknown";
}

// ── GET /api/billing/subscription ────────────────────────────────────────────
router.get("/subscription", async (req, res) => {
  try {
    const userId = await verifyClerkBearer(req);
    const stripe = getStripe();
    const clerk = getClerkClient();
    if (!stripe || !clerk) return res.json({ active: false, plan: null });
    const user = await clerk.users.getUser(userId);
    const customerId = /** @type {string|undefined} */ (user.publicMetadata?.stripeCustomerId);
    if (!customerId) return res.json({ active: false, plan: null });
    const sub = await getActiveSubscription(customerId);
    if (!sub) return res.json({ active: false, plan: null });
    return res.json({ active: true, plan: planFromSubscription(sub) });
  } catch (/** @type {any} */ err) {
    console.error("[billing/subscription] error:", err.message);
    const msg = publicErrorMessage(
      typeof err?.message === "string" ? err.message : "",
      "Unable to load subscription.",
      "[billing/subscription]",
    );
    return res.status(err.status || 500).json({ error: msg });
  }
});

// ── GET /api/billing/usage ───────────────────────────────────────────────────
// Returns remaining usage tokens (Clerk privateMetadata) for the signed-in user.
router.get("/usage", async (req, res) => {
  try {
    const userId = await verifyClerkBearer(req);
    const { balance, periodEnd } = await getUsageBalance(userId);
    return res.json({ balance, periodEnd });
  } catch (/** @type {any} */ err) {
    console.error("[billing/usage] error:", err.message);
    const msg = publicErrorMessage(
      typeof err?.message === "string" ? err.message : "",
      "Unable to load usage.",
      "[billing/usage]",
    );
    return res.status(err.status || 500).json({ error: msg });
  }
});

// Backward-compatible alias used by older frontend/integration clients.
router.get("/balance", async (req, res) => {
  try {
    const userId = await verifyClerkBearer(req);
    const { balance, periodEnd } = await getUsageBalance(userId);
    return res.json({ balance, periodEnd });
  } catch (/** @type {any} */ err) {
    console.error("[billing/balance] error:", err.message);
    const msg = publicErrorMessage(
      typeof err?.message === "string" ? err.message : "",
      "Unable to load usage.",
      "[billing/balance]",
    );
    return res.status(err.status || 500).json({ error: msg });
  }
});

// ── POST /api/billing/checkout ────────────────────────────────────────────────
// Body: { plan: "basic"|"premium"|"studio"|"topup", returnUrl?: string }
router.post("/checkout", async (req, res) => {
  try {
    const userId = await verifyClerkBearer(req);
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: "Billing not configured — STRIPE_SECRET_KEY not set" });

    const plan = /** @type {string} */ (req.body?.plan);
    const priceIds = getPriceIds();
    const priceId = priceIds[/** @type {keyof typeof priceIds} */ (plan)];
    if (!priceId) {
      return res.status(400).json({ error: `Unknown plan "${plan}". Valid: ${Object.keys(priceIds).join(", ")}` });
    }

    const customerId = await getOrCreateStripeCustomer(userId);
    const returnBase = resolveStripeReturnUrl(req, req.body?.returnUrl);

    const isOneTime = plan === "topup";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: isOneTime ? "payment" : "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${returnBase}?checkout=success&plan=${plan}`,
      cancel_url: `${returnBase}?checkout=cancelled`,
    });

    return res.json({ url: session.url });
  } catch (/** @type {any} */ err) {
    console.error("[billing/checkout] error:", err.message, err.raw ?? "", err.stack?.split("\n").slice(0, 3).join(" ") ?? "");
    const status = err.status || 500;
    return res.status(status).json({ error: safeBillingError(err, "Checkout failed") });
  }
});

// ── POST /api/billing/portal ──────────────────────────────────────────────────
router.post("/portal", async (req, res) => {
  try {
    const userId = await verifyClerkBearer(req);
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: "Billing not configured — STRIPE_SECRET_KEY not set" });

    const customerId = await getOrCreateStripeCustomer(userId);
    const returnBase = resolveStripeReturnUrl(req, req.body?.returnUrl);

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnBase,
    });
    return res.json({ url: session.url });
  } catch (/** @type {any} */ err) {
    console.error("[billing/portal] error:", err.message);
    const status = err.status || 500;
    return res.status(status).json({ error: safeBillingError(err, "Portal session failed") });
  }
});

// ── POST /api/billing/webhook ─────────────────────────────────────────────────
// Mounted with express.raw({ type: "application/json" }) in server.js (before express.json).
router.post("/webhook", async (req, res) => {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!stripe || !webhookSecret) {
    return res.status(503).json({ error: "Webhook not configured" });
  }
  const sig = req.headers["stripe-signature"];
  if (!sig) return res.status(400).json({ error: "Missing stripe-signature header" });

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (/** @type {any} */ err) {
    console.error("[billing/webhook] signature verification failed:", err.message);
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  const claimed = await tryClaimWebhookEvent(event.id);
  if (!claimed) {
    return res.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = /** @type {import("stripe").Stripe.Subscription} */ (event.data.object);
        console.log(`[billing/webhook] ${event.type} customer=${sub.customer} status=${sub.status}`);
        if (sub.status === "active" && stripe) {
          const custId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
          const customer = await stripe.customers.retrieve(custId);
          const clerkUserId = /** @type {any} */ (customer).metadata?.clerkUserId;
          if (clerkUserId) {
            await creditSubscriptionAllowance(clerkUserId, sub, stripe, { stripeEventId: event.id });
          }
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = /** @type {import("stripe").Stripe.Subscription} */ (event.data.object);
        console.log(`[billing/webhook] ${event.type} customer=${sub.customer} status=${sub.status}`);
        break;
      }
      case "invoice.payment_succeeded": {
        const inv = /** @type {import("stripe").Stripe.Invoice} */ (event.data.object);
        const subId = /** @type {any} */ (inv).subscription;
        if (subId && stripe) {
          const sub = await stripe.subscriptions.retrieve(
            typeof subId === "string" ? subId : subId.id,
          );
          const custId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
          const customer = await stripe.customers.retrieve(custId);
          const clerkUserId = /** @type {any} */ (customer).metadata?.clerkUserId;
          if (clerkUserId) {
            await creditSubscriptionAllowance(clerkUserId, sub, stripe, { stripeEventId: event.id });
          }
        }
        break;
      }
      case "checkout.session.completed": {
        const session = /** @type {import("stripe").Stripe.Checkout.Session} */ (event.data.object);
        console.log(`[billing/webhook] checkout.session.completed customer=${session.customer} mode=${session.mode}`);
        if (session.mode === "payment" && stripe) {
          const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
          if (customerId) {
            const customer = await stripe.customers.retrieve(customerId);
            const clerkUserId = /** @type {any} */ (customer).metadata?.clerkUserId;
            if (clerkUserId) {
              const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 20 });
              let grant = 0;
              for (const li of lineItems.data) {
                const p = li.price;
                if (!p?.id) continue;
                const price = await stripe.prices.retrieve(p.id);
                const unit = tokensPerTopupFromPrice(price);
                const qty = Number(li.quantity) || 1;
                grant += unit * Math.max(1, qty);
              }
              if (grant > 0) {
                await creditTopupTokens(clerkUserId, grant);
                console.log(`[billing/webhook] topup credited user=${clerkUserId} amount=${grant}`);
              }
            }
          }
        }
        break;
      }
      default:
        break;
    }
    return res.json({ received: true });
  } catch (/** @type {any} */ err) {
    await releaseWebhookEventClaim(event.id);
    console.error("[billing/webhook] handler error:", err?.message || err);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

export { router as billingRouter };
