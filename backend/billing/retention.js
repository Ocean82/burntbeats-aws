// @ts-check
/**
 * Churn retention routes: cancel survey, save offers, downgrade, pause.
 */
import express from "express";
import { verifyClerkBearer } from "../clerkAuth.js";
import { getClerkClient } from "../clerkAuth.js";
import { getStripe } from "./stripeClient.js";
import { getOrCreateStripeCustomer, getActiveSubscription } from "./stripeCustomer.js";
import { planFromSubscription } from "./stripeCustomer.js";
import { isCancelFlowEnabled } from "./priceResolver.js";
import { publicErrorMessage } from "../clientSafeError.js";
import { getPool } from "../db.js";

export const retentionRouter = express.Router();

const VALID_REASONS = new Set([
  "too_expensive",
  "not_using",
  "missing_feature",
  "technical_issues",
  "temporary",
  "switching",
  "other",
]);

/**
 * @param {string} userId
 * @param {string} reason
 * @param {string | null} detail
 * @param {string | null} offerShown
 * @param {boolean} offerAccepted
 * @param {string | null} subId
 */
async function logCancelSurvey(userId, reason, detail, offerShown, offerAccepted, subId) {
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO cancellation_surveys
         (clerk_user_id, reason, reason_detail, offer_shown, offer_accepted, stripe_subscription_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, reason, detail, offerShown, offerAccepted, subId],
    );
  } catch (err) {
    console.error("[billing/retention] survey log failed:", err instanceof Error ? err.message : err);
  }
}

retentionRouter.post("/cancel-survey", async (req, res) => {
  if (!isCancelFlowEnabled()) {
    return res.status(404).json({ error: "Cancel flow not enabled" });
  }
  try {
    const userId = await verifyClerkBearer(req);
    const reason = typeof req.body?.reason === "string" ? req.body.reason : "";
    if (!VALID_REASONS.has(reason)) {
      return res.status(400).json({ error: "Invalid cancel reason" });
    }
    const detail =
      typeof req.body?.detail === "string" ? req.body.detail.slice(0, 500) : null;
    const stripe = getStripe();
    let subId = null;
    if (stripe) {
      const customerId = await getOrCreateStripeCustomer(userId);
      const sub = await getActiveSubscription(customerId);
      subId = sub?.id ?? null;
    }
    await logCancelSurvey(userId, reason, detail, null, false, subId);
    return res.json({ ok: true, reason, subscriptionId: subId });
  } catch (/** @type {any} */ err) {
    const msg = publicErrorMessage(err?.message, "Unable to save feedback.", "[billing/retention]");
    return res.status(err.status || 500).json({ error: msg });
  }
});

retentionRouter.post("/retention-offer", async (req, res) => {
  if (!isCancelFlowEnabled()) {
    return res.status(404).json({ error: "Cancel flow not enabled" });
  }
  try {
    const userId = await verifyClerkBearer(req);
    const offerType = typeof req.body?.offerType === "string" ? req.body.offerType : "";
    const reason = typeof req.body?.reason === "string" ? req.body.reason : "other";
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: "Billing not configured" });

    const customerId = await getOrCreateStripeCustomer(userId);
    const sub = await getActiveSubscription(customerId);
    if (!sub) return res.status(400).json({ error: "No active subscription" });

    if (offerType === "pause_1_month" || offerType === "pause_3_months") {
      const months = offerType === "pause_3_months" ? 3 : 1;
      const resumeAt = Math.floor(Date.now() / 1000) + months * 30 * 24 * 3600;
      await stripe.subscriptions.update(sub.id, {
        pause_collection: { behavior: "void", resumes_at: resumeAt },
      });
      await logCancelSurvey(userId, reason, null, offerType, true, sub.id);
      return res.json({ ok: true, action: "paused", months });
    }

    if (offerType === "discount_25_3mo") {
      const couponId = process.env.STRIPE_RETENTION_COUPON_ID || "";
      if (!couponId) {
        return res.status(503).json({
          error: "Retention discount not configured. Contact support@burntbeats.com",
        });
      }
      await stripe.subscriptions.update(sub.id, {
        discounts: [{ coupon: couponId }],
      });
      await logCancelSurvey(userId, reason, null, offerType, true, sub.id);
      return res.json({ ok: true, action: "discount_applied" });
    }

    if (offerType === "downgrade_basic") {
      const basicPrice = process.env.STRIPE_PRICE_ID_BASIC || "";
      if (!basicPrice) return res.status(503).json({ error: "Basic plan not configured" });
      const itemId = sub.items?.data?.[0]?.id;
      if (!itemId) return res.status(400).json({ error: "Subscription item missing" });
      await stripe.subscriptions.update(sub.id, {
        items: [{ id: itemId, price: basicPrice }],
        proration_behavior: "none",
      });
      await logCancelSurvey(userId, reason, null, offerType, true, sub.id);
      return res.json({ ok: true, action: "downgraded", plan: "basic" });
    }

    return res.status(400).json({ error: "Unknown offer type" });
  } catch (/** @type {any} */ err) {
    console.error("[billing/retention] offer error:", err?.message || err);
    const msg = publicErrorMessage(err?.message, "Unable to apply offer.", "[billing/retention]");
    return res.status(err.status || 500).json({ error: msg });
  }
});

retentionRouter.post("/cancel-confirm", async (req, res) => {
  if (!isCancelFlowEnabled()) {
    return res.status(404).json({ error: "Cancel flow not enabled" });
  }
  try {
    const userId = await verifyClerkBearer(req);
    const reason = typeof req.body?.reason === "string" ? req.body.reason : "other";
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: "Billing not configured" });

    const customerId = await getOrCreateStripeCustomer(userId);
    const sub = await getActiveSubscription(customerId);
    if (!sub) return res.status(400).json({ error: "No active subscription" });

    await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
    await logCancelSurvey(userId, reason, null, "cancel_at_period_end", false, sub.id);

    const clerk = getClerkClient();
    if (clerk) {
      const user = await clerk.users.getUser(userId);
      const prevPublic =
        user.publicMetadata && typeof user.publicMetadata === "object"
          ? { ...user.publicMetadata }
          : {};
      await clerk.users.updateUserMetadata(userId, {
        publicMetadata: {
          ...prevPublic,
          cancelAtPeriodEnd: true,
          lastCancelReason: reason,
        },
      });
    }

    return res.json({
      ok: true,
      cancelAtPeriodEnd: true,
      plan: planFromSubscription(sub),
    });
  } catch (/** @type {any} */ err) {
    const msg = publicErrorMessage(err?.message, "Unable to cancel.", "[billing/retention]");
    return res.status(err.status || 500).json({ error: msg });
  }
});
