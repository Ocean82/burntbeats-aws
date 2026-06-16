// @ts-check
/**
 * Stripe webhook handler.
 *
 * Mounted with express.raw({ type: "application/json" }) in server.js (before express.json).
 * Handles signature verification, idempotency (claim/release), and event dispatch.
 *
 * Supported events:
 *   - customer.subscription.created/updated → credit subscription allowance (active only)
 *   - customer.subscription.deleted → structured log (entitlements resolve on next API read)
 *   - invoice.payment_succeeded → credit subscription allowance (renewal, active only)
 *   - checkout.session.completed (payment) → credit topup tokens
 *   - checkout.session.completed (subscription) → credit initial subscription allowance
 */
import express from "express";
import { getStripe } from "./stripeClient.js";
import {
  creditTopupTokens,
  tokensPerTopupFromPrice,
  entitlementTierFromPrice,
} from "../usageTokens.js";
import {
  tryClaimWebhookEvent,
  releaseWebhookEventClaim,
} from "../stripeRedis.js";
import {
  creditActiveSubscriptionAllowance,
  resolveClerkUserIdFromCustomerRef,
} from "./stripeWebhookUtils.js";
import { handleInvoicePaymentFailed, syncSubscriptionBillingStatus } from "./dunning.js";
import { handleSubscriptionChurned } from "./winback.js";

export const webhookRouter = express.Router();

/**
 * @param {import("stripe").Stripe} stripe
 * @param {import("stripe").Stripe.Checkout.Session} session
 * @param {string} stripeEventId
 */
async function handleCheckoutSessionCompleted(stripe, session, stripeEventId) {
  if (session.mode === "payment") {
    const clerkUserId = await resolveClerkUserIdFromCustomerRef(
      stripe,
      session.customer,
    );
    if (!clerkUserId) return;

    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
      limit: 20,
    });
    let grant = 0;
    /** @type {"basic" | "premium"} */
    let packTier = "basic";
    for (const li of lineItems.data) {
      const p = li.price;
      if (!p?.id) continue;
      const price = await stripe.prices.retrieve(p.id);
      const unit = tokensPerTopupFromPrice(price);
      const tier = entitlementTierFromPrice(price);
      if (tier === "premium") packTier = "premium";
      const qty = Number(li.quantity) || 1;
      grant += unit * Math.max(1, qty);
    }
    if (grant > 0) {
      await creditTopupTokens(clerkUserId, grant, {
        entitlementTier: packTier,
        stripeEventId: stripeEventId,
      });
      console.log(
        `[billing/webhook] topup credited user=${clerkUserId} amount=${grant} tier=${packTier}`,
      );
    }
    return;
  }

  if (session.mode === "subscription") {
    const subRef = session.subscription;
    const subId =
      typeof subRef === "string" ? subRef : subRef && "id" in subRef ? subRef.id : null;
    if (!subId) {
      console.warn(
        `[billing/webhook] checkout.session.completed subscription missing subscription id session=${session.id}`,
      );
      return;
    }
    const sub = await stripe.subscriptions.retrieve(subId);
    await creditActiveSubscriptionAllowance(stripe, sub, { stripeEventId });
    console.log(
      `[billing/webhook] subscription checkout credited sub=${sub.id} status=${sub.status}`,
    );
  }
}

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
        await creditActiveSubscriptionAllowance(stripe, sub, {
          stripeEventId: event.id,
        });
        try {
          await syncSubscriptionBillingStatus(stripe, sub);
        } catch (syncErr) {
          // Non-fatal: billing status sync is best-effort
          console.error(
            `[billing/webhook] syncSubscriptionBillingStatus failed:`,
            syncErr?.message || syncErr,
          );
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = /** @type {import("stripe").Stripe.Subscription} */ (
          event.data.object
        );
        let clerkUserId = null;
        try {
          clerkUserId = await resolveClerkUserIdFromCustomerRef(
            stripe,
            sub.customer,
          );
        } catch (err) {
          console.warn(
            "[billing/webhook] subscription.deleted customer lookup failed:",
            err instanceof Error ? err.message : err,
          );
        }
        if (clerkUserId) {
          await handleSubscriptionChurned(stripe, sub, clerkUserId);
        }
        console.log(
          `[billing/webhook] ${event.type} customer=${sub.customer} clerkUserId=${clerkUserId ?? "unknown"} — subscription entitlements end; usage token balance unchanged`,
        );
        break;
      }
      case "invoice.payment_failed": {
        const inv = /** @type {import("stripe").Stripe.Invoice} */ (
          event.data.object
        );
        await handleInvoicePaymentFailed(stripe, inv);
        break;
      }
      case "invoice.payment_action_required": {
        const inv = /** @type {import("stripe").Stripe.Invoice} */ (
          event.data.object
        );
        await handleInvoicePaymentFailed(stripe, inv);
        break;
      }
      case "invoice.payment_succeeded": {
        const inv = /** @type {import("stripe").Stripe.Invoice} */ (
          event.data.object
        );
        const subId = /** @type {any} */ (inv).subscription;
        if (!subId) break;
        const sub = await stripe.subscriptions.retrieve(
          typeof subId === "string" ? subId : subId.id,
        );
        await creditActiveSubscriptionAllowance(stripe, sub, {
          stripeEventId: event.id,
        });
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
        await handleCheckoutSessionCompleted(stripe, session, event.id);
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
