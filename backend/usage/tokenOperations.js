// @ts-check
/**
 * Token reserve/refund/welcome-grant operations.
 *
 * Primary store: PostgreSQL (via db-tokens.js).
 * Secondary cache: Clerk privateMetadata (for fast reads without DB round-trip).
 */
import { getClerkClient } from "../clerkAuth.js";
import { isDbTokensAvailable, reserveDbTokens, refundDbTokens, grantDbWelcomeTokens } from "../db-tokens.js";
import { isUsageTokensDevUnlimited, withUserUsageLock } from "./tokenBalance.js";
import { updateClerkBalanceCache } from "./clerkCache.js";

/**
 * @param {string} userId
 * @param {number} cost
 * @param {{ jobId?: string }} [meta]
 */
export async function reserveUsageTokens(userId, cost, meta = {}) {
  if (isUsageTokensDevUnlimited()) return;
  if (!Number.isFinite(cost) || cost <= 0) return;

  // Primary: DB-backed debit (transactional, with ledger)
  if (isDbTokensAvailable()) {
    const result = await reserveDbTokens(userId, cost, { jobId: meta.jobId, note: "split/expand debit" });
    if (!result.success) {
      const err = /** @type {Error & { status?: number }} */ (
        new Error(result.error || "Token reservation failed")
      );
      err.status = result.error?.includes("Insufficient") ? 402 : 500;
      throw err;
    }
    // Also update Clerk metadata as a cache (best-effort, don't fail if this errors)
    try {
      await updateClerkBalanceCache(userId, result.balanceAfter ?? 0);
    } catch (e) {
      console.warn("[usageTokens] Clerk cache update failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    return;
  }

  // Fallback: Clerk-only (original behaviour)
  const clerk = getClerkClient();
  if (!clerk) return;

  await withUserUsageLock(userId, async () => {
    const user = await clerk.users.getUser(userId);
    const prev = user.privateMetadata?.usageTokens;
    const rec =
      prev && typeof prev === "object"
        ? { .../** @type {Record<string, unknown>} */ (prev) }
        : {};
    const curBal = Number(rec.balance) || 0;
    if (curBal < cost) {
      const err = /** @type {Error & { status?: number }} */ (
        new Error(
          `Insufficient usage tokens (need ${cost}, have ${curBal}). Upgrade your plan or wait for renewal.`,
        )
      );
      err.status = 402;
      throw err;
    }
    const nextBal = curBal - cost;
    await clerk.users.updateUserMetadata(userId, {
      privateMetadata: {
        .../** @type {Record<string, unknown>} */ (user.privateMetadata || {}),
        usageTokens: {
          ...rec,
          balance: nextBal,
          lastDebitAt: Date.now(),
          lastDebitAmount: cost,
        },
      },
    });
  });
}

/**
 * Refund previously reserved tokens (best-effort compensating action).
 * @param {string} userId
 * @param {number} amount
 * @param {{ jobId?: string }} [meta]
 */
export async function refundUsageTokens(userId, amount, meta = {}) {
  if (isUsageTokensDevUnlimited()) return;
  if (!Number.isFinite(amount) || amount <= 0) return;

  // Primary: DB refund
  if (isDbTokensAvailable()) {
    const result = await refundDbTokens(userId, amount, { jobId: meta.jobId, note: "job refund" });
    if (result.success && result.balanceAfter != null) {
      try {
        await updateClerkBalanceCache(userId, result.balanceAfter);
      } catch (e) {
        console.warn("[usageTokens] Clerk cache update failed (non-fatal):", e instanceof Error ? e.message : e);
      }
    }
    return;
  }

  // Fallback: Clerk-only
  const clerk = getClerkClient();
  if (!clerk) return;
  await withUserUsageLock(userId, async () => {
    const user = await clerk.users.getUser(userId);
    const prev = user.privateMetadata?.usageTokens;
    const rec =
      prev && typeof prev === "object"
        ? { .../** @type {Record<string, unknown>} */ (prev) }
        : {};
    const curBal = Number(rec.balance) || 0;
    await clerk.users.updateUserMetadata(userId, {
      privateMetadata: {
        .../** @type {Record<string, unknown>} */ (user.privateMetadata || {}),
        usageTokens: {
          ...rec,
          balance: curBal + amount,
          lastRefundAt: Date.now(),
          lastRefundAmount: amount,
        },
      },
    });
  });
}

/**
 * One-time welcome grant for brand-new accounts.
 * Protected by the same per-user lock used for debit/credit operations.
 * @param {string} clerkUserId
 * @param {number} grant
 * @returns {Promise<{ granted: boolean, balance: number }>}
 */
export async function grantWelcomeSignupTokens(clerkUserId, grant) {
  // Ensure we always grant at least 1 token even if env is missing,
  // but allow explicit 0 if that's what's intended.
  const amount = Number.isFinite(grant) ? Math.floor(grant) : 1;

  // Primary: DB (idempotent)
  if (isDbTokensAvailable()) {
    const dbResult = await grantDbWelcomeTokens(clerkUserId, amount);
    if (dbResult.success) {
      // Also update Clerk cache
      try {
        await updateClerkBalanceCache(clerkUserId, dbResult.balanceAfter ?? 0);
      } catch (e) {
        console.warn("[usageTokens] Clerk cache update failed (non-fatal):", e instanceof Error ? e.message : e);
      }
      return { granted: dbResult.granted, balance: dbResult.balanceAfter ?? 0 };
    }
    // Fall through to Clerk-only if DB failed
  }

  // Fallback: Clerk-only
  const clerk = getClerkClient();
  if (!clerk) return { granted: false, balance: 0 };

  /** @type {{ granted: boolean, balance: number }} */
  let result = { granted: false, balance: 0 };
  await withUserUsageLock(clerkUserId, async () => {
    const user = await clerk.users.getUser(clerkUserId);
    const prev = user.privateMetadata?.usageTokens;
    const rec =
      prev && typeof prev === "object"
        ? { .../** @type {Record<string, unknown>} */ (prev) }
        : {};
    const curBal = Number(rec.balance) || 0;
    if (rec.welcomeGrantAppliedAt) {
      result = { granted: false, balance: curBal };
      return;
    }
    const now = Date.now();
    const nextBal = curBal + amount;
    await clerk.users.updateUserMetadata(clerkUserId, {
      privateMetadata: {
        .../** @type {Record<string, unknown>} */ (user.privateMetadata || {}),
        usageTokens: {
          ...rec,
          balance: nextBal,
          welcomeGrantAppliedAt: now,
          welcomeGrantAmount: amount,
          lastTopupAt: now,
          lastTopupAmount: amount,
        },
      },
    });
    result = { granted: true, balance: nextBal };
  });
  return result;
}
