// @ts-check
/**
 * Subscription and top-up token credit operations.
 *
 * Handles idempotent monthly subscription credits and one-time top-up grants.
 */
import { getClerkClient } from "../clerkAuth.js";
import { getRedis } from "../stripeRedis.js";
import { isDbTokensAvailable, creditDbSubscription, creditDbTopup } from "../db-tokens.js";
import { withUserUsageLock } from "./tokenBalance.js";
import { subscriptionBillingPeriod, tokensPerMonthFromPrice } from "./stripeMetadata.js";
import { updateClerkBalanceCache } from "./clerkCache.js";

/**
 * Prune processedStripeCreditEventIds to max ~40 entries (oldest by timestamp).
 * @param {Record<string, number>} m
 */
function pruneProcessedCreditEvents(m) {
  const keys = Object.keys(m);
  if (keys.length <= 40) return m;
  keys.sort((a, b) => (m[a] || 0) - (m[b] || 0));
  const next = { ...m };
  for (const k of keys.slice(0, keys.length - 40)) delete next[k];
  return next;
}

/**
 * Idempotent monthly credit from Stripe subscription (same period not credited twice).
 * Uses optional Redis lock per (user, billing period) for multi-worker safety, plus
 * Clerk metadata for period + optional Stripe event id deduplication.
 *
 * @param {string} clerkUserId
 * @param {import("stripe").Stripe.Subscription} sub
 * @param {import("stripe").Stripe} stripe
 * @param {{ stripeEventId?: string }} [options]
 */
export async function creditSubscriptionAllowance(
  clerkUserId,
  sub,
  stripe,
  options = {},
) {
  if (isDbTokensAvailable()) {
    const { periodStart, periodEnd } = subscriptionBillingPeriod(sub);
    const item = sub.items?.data?.[0];
    const priceId = item?.price?.id;
    if (!priceId) return;
    const price = await stripe.prices.retrieve(priceId);
    const grant = tokensPerMonthFromPrice(price);
    if (!Number.isFinite(grant) || grant <= 0) return;
    const dbResult = await creditDbSubscription(clerkUserId, grant, {
      periodStart: typeof periodStart === "number" ? periodStart : undefined,
      periodEnd: typeof periodEnd === "number" ? periodEnd : undefined,
      stripeEventId:
        typeof options.stripeEventId === "string" ? options.stripeEventId : undefined,
    });
    if (!dbResult.success) {
      throw new Error(`Database ledger failure: failed to credit subscription for user ${clerkUserId}`);
    }
    if (!dbResult.credited) return; // Idempotent skip (already credited)

    if (dbResult.balanceAfter != null) {
      try {
        await updateClerkBalanceCache(clerkUserId, dbResult.balanceAfter);
      } catch (e) {
        console.warn(
          "[usageTokens] Clerk cache update failed (non-fatal):",
          e instanceof Error ? e.message : e,
        );
      }
    }
    console.log(
      `[usageTokens] credited ${grant} tokens user=${clerkUserId} period=${periodStart}`,
    );
    return;
  }

  const stripeEventId =
    typeof options.stripeEventId === "string" ? options.stripeEventId : "";
  const clerk = getClerkClient();
  if (!clerk) return;

  const { periodStart, periodEnd } = subscriptionBillingPeriod(sub);
  const redis = await getRedis();
  /** @type {string | null} */
  let lockKey = null;

  if (redis && periodStart != null && typeof periodStart === "number") {
    lockKey = `stripe:credit_lock:${clerkUserId}:${periodStart}`;
    const got = await redis.set(lockKey, "1", { NX: true, EX: 120 });
    if (!got) {
      await new Promise((r) => setTimeout(r, 200));
      const u0 = await clerk.users.getUser(clerkUserId);
      const r0 = u0.privateMetadata?.usageTokens;
      const rec0 =
        r0 && typeof r0 === "object"
          ? /** @type {Record<string, unknown>} */ (r0)
          : {};
      if (rec0.lastCreditedPeriodStart === periodStart) return;
      return;
    }
  }

  try {
    const user = await clerk.users.getUser(clerkUserId);
    const prev = user.privateMetadata?.usageTokens;
    const rec =
      prev && typeof prev === "object"
        ? { .../** @type {Record<string, unknown>} */ (prev) }
        : {};

    if (
      stripeEventId &&
      typeof rec.processedStripeCreditEventIds === "object" &&
      rec.processedStripeCreditEventIds !== null
    ) {
      const ev = /** @type {Record<string, number>} */ (
        rec.processedStripeCreditEventIds
      );
      if (ev[stripeEventId]) return;
    }
    if (rec.lastCreditedPeriodStart === periodStart) {
      return;
    }
    const item = sub.items?.data?.[0];
    const priceId = item?.price?.id;
    if (!priceId) return;
    const price = await stripe.prices.retrieve(priceId);
    const grant = tokensPerMonthFromPrice(price);
    const periodEndMs =
      periodEnd != null && typeof periodEnd === "number"
        ? periodEnd * 1000
        : null;
    const curBal = Number(rec.balance) || 0;

    /** @type {Record<string, number>} */
    let nextProcessed = {};
    if (
      typeof rec.processedStripeCreditEventIds === "object" &&
      rec.processedStripeCreditEventIds !== null
    ) {
      nextProcessed = {
        .../** @type {Record<string, number>} */ (
          rec.processedStripeCreditEventIds
        ),
      };
    }
    if (stripeEventId) {
      nextProcessed[stripeEventId] = Date.now();
      nextProcessed = pruneProcessedCreditEvents(nextProcessed);
    }

    await clerk.users.updateUserMetadata(clerkUserId, {
      privateMetadata: {
        .../** @type {Record<string, unknown>} */ (user.privateMetadata || {}),
        usageTokens: {
          ...rec,
          balance: curBal + grant,
          periodEnd: periodEndMs,
          lastCreditedPeriodStart: periodStart,
          lastCreditAt: Date.now(),
          lastCreditAmount: grant,
          ...(stripeEventId
            ? { processedStripeCreditEventIds: nextProcessed }
            : {}),
        },
      },
    });

    // Also write to DB (primary ledger when available)
    if (isDbTokensAvailable()) {
      await creditDbSubscription(clerkUserId, grant, {
        periodStart: typeof periodStart === "number" ? periodStart : undefined,
        periodEnd: typeof periodEnd === "number" ? periodEnd : undefined,
        stripeEventId: stripeEventId || undefined,
      });
    }

    console.log(
      `[usageTokens] credited ${grant} tokens user=${clerkUserId} period=${periodStart}`,
    );
  } finally {
    if (redis && lockKey) {
      try {
        await redis.del(lockKey);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Credit one-time purchased tokens.
 * @param {string} clerkUserId
 * @param {number} grant
 * @param {{ entitlementTier?: "basic" | "premium", stripeEventId?: string }} [meta]
 */
export async function creditTopupTokens(clerkUserId, grant, meta = {}) {
  if (!Number.isFinite(grant) || grant <= 0) return;

  // Primary: DB
  if (isDbTokensAvailable()) {
    const dbResult = await creditDbTopup(clerkUserId, grant, {
      stripeEventId: meta.stripeEventId,
      entitlementTier: meta.entitlementTier,
      note: "one-time top-up",
    });
    if (!dbResult.success) {
      throw new Error(`Database ledger failure: failed to credit topup for user ${clerkUserId}`);
    }
    if (dbResult.balanceAfter != null) {
      try {
        await updateClerkBalanceCache(clerkUserId, dbResult.balanceAfter);
      } catch (e) {
        console.warn(
          "[usageTokens] Clerk cache update failed (non-fatal):",
          e instanceof Error ? e.message : e,
        );
      }
    }
    return;
  }

  // Fallback: Clerk metadata cache
  const clerk = getClerkClient();
  if (!clerk) return;
  await withUserUsageLock(clerkUserId, async () => {
    const user = await clerk.users.getUser(clerkUserId);
    const prev = user.privateMetadata?.usageTokens;
    const rec =
      prev && typeof prev === "object"
        ? { .../** @type {Record<string, unknown>} */ (prev) }
        : {};
    const curBal = Number(rec.balance) || 0;
    await clerk.users.updateUserMetadata(clerkUserId, {
      privateMetadata: {
        .../** @type {Record<string, unknown>} */ (user.privateMetadata || {}),
        usageTokens: {
          ...rec,
          balance: curBal + grant,
          lastTopupAt: Date.now(),
          lastTopupAmount: grant,
        },
      },
    });
  });
}
