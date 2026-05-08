// @ts-check
/**
 * Stripe webhook handler.
 *
 * Mounted with express.raw({ type: "application/json" }) in server.js (before express.json).
 * Handles signature verification, idempotency (claim/release), and event dispatch.
 *
 * Supported events:
 *   - customer.subscription.created/updated → credit subscription allowance
 *   - customer.subscription.deleted → log only
 *   - invoice.payment_succeeded → credit subscription allowance (renewal)
 *   - checkout.session.completed (payment mode) → credit topup tokens
 */
import express from "express";
import { getStripe } from "./stripeClient.js";
import {
  creditSubscriptionAllowance,
  creditTopupTokens,
  tokensPerTopupFromPrice,
} from "../usageTokens.js";
import {
  tryClaimWebhookEvent,
  releaseWebhookEventClaim,
} from "../stripeRedis.js";

export const webhookRouter = express.Router();

// ── POST /webhook ─────────────────────────────────────────────────────────────
webhookRouter.post("/webhook", async (req, res) => {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!stripe || !webhookSecret) {
    return res.status(503).json({ error: "Webhook not configured" });
  }
  const sig = req.headers["stripe-signature"];
  if (!sig)
    return res.status(400).json({ error: "Missing stripe-signature header" });

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (/** @type {any} */ err) {
    console.error(
      "[billing/webhook] signature verification failed:",
      err.message,
    );
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
        const sub = /** @type {import("stripe").Stripe.Subscription} */ (
          event.data.object
        );
        console.log(
          `[billing/webhook] ${event.type} customer=${sub.customer} status=${sub.status}`,
        );
        if (sub.status === "active" && stripe) {
          const custId =
            typeof sub.customer === "string" ? sub.customer : sub.customer.id;
          const customer = await stripe.customers.retrieve(custId);
          const clerkUserId = /** @type {any} */ (customer).metadata
            ?.clerkUserId;
          if (clerkUserId) {
            await creditSubscriptionAllowance(clerkUserId, sub, stripe, {
              stripeEventId: event.id,
            });
          }
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = /** @type {import("stripe").Stripe.Subscription} */ (
          event.data.object
        );
        console.log(
          `[billing/webhook] ${event.type} customer=${sub.customer} status=${sub.status}`,
        );
        break;
      }
      case "invoice.payment_succeeded": {
        const inv = /** @type {import("stripe").Stripe.Invoice} */ (
          event.data.object
        );
        const subId = /** @type {any} */ (inv).subscription;
        if (subId && stripe) {
          const sub = await stripe.subscriptions.retrieve(
            typeof subId === "string" ? subId : subId.id,
          );
          const custId =
            typeof sub.customer === "string" ? sub.customer : sub.customer.id;
          const customer = await stripe.customers.retrieve(custId);
          const clerkUserId = /** @type {any} */ (customer).metadata
            ?.clerkUserId;
          if (clerkUserId) {
            await creditSubscriptionAllowance(clerkUserId, sub, stripe, {
              stripeEventId: event.id,
            });
          }
        }
        break;
      }
      case "checkout.session.completed": {
        const session =
          /** @type {import("stripe").Stripe.Checkout.Session} */ (
            event.data.object
          );
        console.log(
          `[billing/webhook] checkout.session.completed customer=${session.customer} mode=${session.mode}`,
        );
        if (session.mode === "payment" && stripe) {
          const customerId =
            typeof session.customer === "string"
              ? session.customer
              : session.customer?.id;
          if (customerId) {
            const customer = await stripe.customers.retrieve(customerId);
            const clerkUserId = /** @type {any} */ (customer).metadata
              ?.clerkUserId;
            if (clerkUserId) {
              const lineItems = await stripe.checkout.sessions.listLineItems(
                session.id,
                { limit: 20 },
              );
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
                console.log(
                  `[billing/webhook] topup credited user=${clerkUserId} amount=${grant}`,
                );
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
