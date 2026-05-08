// @ts-check
/**
 * Billing subscription and usage routes.
 *
 * Routes:
 *   GET /subscription — { active, plan } for current user
 *   GET /usage        — { balance, periodEnd }
 *   GET /balance      — backward-compatible alias for /usage
 */
import express from "express";
import { verifyClerkBearer, getClerkClient } from "../clerkAuth.js";
import { getUsageBalance } from "../usageTokens.js";
import { publicErrorMessage } from "../clientSafeError.js";
import { getStripe } from "./stripeClient.js";
import { getActiveSubscription, planFromSubscription } from "./stripeCustomer.js";

export const subscriptionRouter = express.Router();

// ── GET /subscription ────────────────────────────────────────────────────────
subscriptionRouter.get("/subscription", async (req, res) => {
  try {
    const userId = await verifyClerkBearer(req);
    const clerk = getClerkClient();
    if (!clerk) return res.json({ active: false, plan: null });

    const stripe = getStripe();
    const user = await clerk.users.getUser(userId);
    const customerId = /** @type {string|undefined} */ (
      user.publicMetadata?.stripeCustomerId
    );
    if (stripe && customerId) {
      const sub = await getActiveSubscription(customerId);
      if (sub) {
        return res.json({ active: true, plan: planFromSubscription(sub) });
      }
    }

    const { balance } = await getUsageBalance(userId);
    if (balance > 0) {
      return res.json({
        active: true,
        plan: "basic",
        entitlement: "usage_tokens",
      });
    }

    return res.json({ active: false, plan: null });
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

// ── GET /usage ───────────────────────────────────────────────────────────────
subscriptionRouter.get("/usage", async (req, res) => {
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

// ── GET /balance (backward-compatible alias) ─────────────────────────────────
subscriptionRouter.get("/balance", async (req, res) => {
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
