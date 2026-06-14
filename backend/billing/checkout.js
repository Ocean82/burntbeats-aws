// @ts-check
/**
 * Billing checkout and portal routes.
 *
 * Routes:
 *   POST /checkout — create Stripe Checkout session { url }
 *   POST /portal   — create Stripe Customer Portal session { url }
 */
import express from "express";
import { verifyClerkBearer } from "../clerkAuth.js";
import { resolveStripeReturnUrl } from "../returnUrl.js";
import { getStripe, getPriceIds, safeBillingError } from "./stripeClient.js";
import { getOrCreateStripeCustomer } from "./stripeCustomer.js";
import { resolveCheckoutPriceId, isAnnualBillingEnabled } from "./priceResolver.js";

export const checkoutRouter = express.Router();

// ── POST /checkout ────────────────────────────────────────────────────────────
// Body: { plan: "basic"|"premium"|"studio"|"topup"|"single", returnUrl?: string }
checkoutRouter.post("/checkout", async (req, res) => {
  try {
    const userId = await verifyClerkBearer(req);
    const stripe = getStripe();
    if (!stripe)
      return res
        .status(503)
        .json({ error: "Billing not configured — STRIPE_SECRET_KEY not set" });

    const plan = /** @type {string} */ (req.body?.plan);
    const source =
      typeof req.body?.source === "string" && req.body.source.trim()
        ? req.body.source.trim().slice(0, 48)
        : "unknown";
    const intent =
      typeof req.body?.intent === "string" && req.body.intent.trim()
        ? req.body.intent.trim().slice(0, 96)
        : "unspecified";
    const priceIds = getPriceIds();
    const intervalRaw = req.body?.interval;
    const interval =
      intervalRaw === "year" && isAnnualBillingEnabled() ? "year" : "month";
    const priceId =
      resolveCheckoutPriceId(plan, interval) ||
      priceIds[/** @type {keyof typeof priceIds} */ (plan)];
    if (!priceId) {
      return res.status(400).json({
        error: `Unknown plan "${plan}". Valid: ${Object.keys(priceIds).join(", ")}`,
      });
    }

    const customerId = await getOrCreateStripeCustomer(userId);
    const returnBase = resolveStripeReturnUrl(req, req.body?.returnUrl);

    const isOneTime = plan === "topup" || plan === "single";
    /** @type {import("stripe").Stripe.Checkout.SessionCreateParams} */
    const sessionParams = {
      customer: customerId,
      client_reference_id: userId,
      mode: isOneTime ? "payment" : "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${returnBase}?checkout=success&plan=${plan}`,
      cancel_url: `${returnBase}?checkout=cancelled`,
      metadata: {
        clerkUserId: userId,
        plan,
        source,
        intent,
        interval,
      },
    };
    if (!isOneTime) {
      sessionParams.subscription_data = {
        metadata: {
          clerkUserId: userId,
          plan,
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log(
      `[billing/checkout] created user=${userId} plan=${plan} source=${source} intent=${intent} mode=${isOneTime ? "payment" : "subscription"} session=${session.id}`,
    );

    return res.json({ url: session.url });
  } catch (/** @type {any} */ err) {
    console.error(
      "[billing/checkout] error:",
      err.message,
      err.raw ?? "",
      err.stack?.split("\n").slice(0, 3).join(" ") ?? "",
    );
    const status = err.status || 500;
    return res
      .status(status)
      .json({ error: safeBillingError(err, "Checkout failed") });
  }
});

// ── POST /portal ──────────────────────────────────────────────────────────────
checkoutRouter.post("/portal", async (req, res) => {
  try {
    const userId = await verifyClerkBearer(req);
    const stripe = getStripe();
    if (!stripe)
      return res
        .status(503)
        .json({ error: "Billing not configured — STRIPE_SECRET_KEY not set" });

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
    return res
      .status(status)
      .json({ error: safeBillingError(err, "Portal session failed") });
  }
});
