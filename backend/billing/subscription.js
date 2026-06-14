// @ts-check
/**
 * Billing subscription and usage routes.
 *
 * Routes:
 *   GET /subscription — { active, plan, entitlementSource, capabilities } for current user
 *   GET /usage        — { balance, periodEnd }
 *   GET /balance      — backward-compatible alias for /usage
 */
import express from "express";
import { verifyClerkBearer, getClerkClient } from "../clerkAuth.js";
import { getUsageBalance } from "../usageTokens.js";
import { publicErrorMessage } from "../clientSafeError.js";
import { resolveEntitlementStateForUser } from "./entitlements.js";

/**
 * @param {{
 *   verifyClerkBearer?: typeof verifyClerkBearer;
 *   resolveEntitlementStateForUser?: typeof resolveEntitlementStateForUser;
 *   getUsageBalance?: typeof getUsageBalance;
 * }} [deps]
 */
export function createSubscriptionRouter(deps = {}) {
  const router = express.Router();
  const readUserId = deps.verifyClerkBearer || verifyClerkBearer;
  const readEntitlements =
    deps.resolveEntitlementStateForUser || resolveEntitlementStateForUser;
  const readUsageBalance = deps.getUsageBalance || getUsageBalance;

  // ── GET /subscription ──────────────────────────────────────────────────────
  router.get("/subscription", async (req, res) => {
    try {
      const userId = await readUserId(req);
      const entitlements = await readEntitlements(userId);
      let billingStatus = "none";
      const clerk = getClerkClient();
      if (clerk) {
        try {
          const user = await clerk.users.getUser(userId);
          const meta = user.publicMetadata;
          if (
            meta &&
            typeof meta === "object" &&
            typeof meta.billingStatus === "string"
          ) {
            billingStatus = meta.billingStatus;
          }
        } catch {
          /* non-fatal */
        }
      }
      return res.json({
        active: entitlements.plan !== null,
        plan: entitlements.plan,
        entitlementSource: entitlements.entitlementSource,
        capabilities: entitlements.capabilities,
        billingStatus,
      });
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

  // ── GET /usage ─────────────────────────────────────────────────────────────
  router.get("/usage", async (req, res) => {
    try {
      const userId = await readUserId(req);
      const usage = await readUsageBalance(userId);
      return res.json({
        balance: usage.balance,
        periodEnd: usage.periodEnd,
        paidBalance: usage.paidBalance,
        freeMonthlyRemaining: usage.freeMonthlyRemaining,
        welcomeGranted: usage.welcomeGranted,
        maxEntitlementTier: usage.maxEntitlementTier,
      });
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

  // ── GET /balance (backward-compatible alias) ───────────────────────────────
  router.get("/balance", async (req, res) => {
    try {
      const userId = await readUserId(req);
      const usage = await readUsageBalance(userId);
      return res.json({
        balance: usage.balance,
        periodEnd: usage.periodEnd,
        paidBalance: usage.paidBalance,
        freeMonthlyRemaining: usage.freeMonthlyRemaining,
        welcomeGranted: usage.welcomeGranted,
        maxEntitlementTier: usage.maxEntitlementTier,
      });
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

  return router;
}

export const subscriptionRouter = createSubscriptionRouter();
