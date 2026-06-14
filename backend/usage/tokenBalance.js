// @ts-check
/**
 * Token balance retrieval and feature gating.
 *
 * Reads balance from DB (primary) with Clerk metadata fallback.
 * Also provides the distributed lock utility for token operations.
 */
import { getClerkClient } from "../clerkAuth.js";
import { getRedis } from "../stripeRedis.js";
import { isDbTokensAvailable, getDbBalance } from "../db-tokens.js";
import { randomUUID } from "crypto";

const LOCK_RELEASE_LUA =
  "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";

/**
 * Best-effort lock release that only removes lock if we still own it.
 * @param {import("redis").ReturnType<typeof import("redis").createClient>} redis
 * @param {string} lockKey
 * @param {string} ownerToken
 */
async function releaseOwnedLock(redis, lockKey, ownerToken) {
  try {
    await redis.sendCommand(["EVAL", LOCK_RELEASE_LUA, "1", lockKey, ownerToken]);
  } catch (e) {
    console.warn(
      "[usageTokens] lock release failed (non-fatal):",
      e instanceof Error ? e.message : e,
    );
  }
}

/** @returns {boolean} */
export function isUsageTokensEnabled() {
  return ["1", "true", "yes"].includes(
    (process.env.USAGE_TOKENS_ENABLED || "").toLowerCase(),
  );
}

/** Dev bypass: debit checks always pass */
export function isUsageTokensDevUnlimited() {
  return ["1", "true", "yes"].includes(
    (process.env.USAGE_TOKENS_DEV_UNLIMITED || "").toLowerCase(),
  );
}

/**
 * @param {string} userId
 * @returns {Promise<{
 *   balance: number;
 *   periodEnd: number | null;
 *   paidBalance: number;
 *   freeMonthlyRemaining: number;
 *   maxEntitlementTier: "basic" | "premium";
 *   welcomeGranted: boolean;
 * }>}
 */
export async function getUsageBalance(userId) {
  // Prefer DB when available
  if (isDbTokensAvailable()) {
    const dbResult = await getDbBalance(userId);
    if (dbResult !== null) {
      const periodEndMs = dbResult.periodEnd ? dbResult.periodEnd.getTime() : null;
      const paidBalance = dbResult.balance;
      const freeMonthlyRemaining = dbResult.freeMonthlyRemaining ?? 0;
      return {
        balance: paidBalance + freeMonthlyRemaining,
        periodEnd: periodEndMs,
        paidBalance,
        freeMonthlyRemaining,
        maxEntitlementTier:
          dbResult.maxEntitlementTier === "premium" ? "premium" : "basic",
        welcomeGranted: Boolean(dbResult.welcomeGranted),
      };
    }
  }
  // Fallback to Clerk metadata
  const clerk = getClerkClient();
  if (!clerk) {
    return {
      balance: 0,
      periodEnd: null,
      paidBalance: 0,
      freeMonthlyRemaining: 0,
      maxEntitlementTier: "basic",
      welcomeGranted: false,
    };
  }
  const user = await clerk.users.getUser(userId);
  const u = user.privateMetadata?.usageTokens;
  const rec =
    u && typeof u === "object"
      ? /** @type {Record<string, unknown>} */ (u)
      : {};
  const balance = Number(rec.balance);
  const periodEnd = rec.periodEnd != null ? Number(rec.periodEnd) : null;
  const paidBalance = Number.isFinite(balance) ? balance : 0;
  return {
    balance: paidBalance,
    periodEnd:
      periodEnd != null && Number.isFinite(periodEnd) ? periodEnd : null,
    paidBalance,
    freeMonthlyRemaining: 0,
    maxEntitlementTier: "basic",
    welcomeGranted: false,
  };
}

/**
 * Distributed lock for per-user token operations.
 * Uses Redis NX lock when available; falls back to a no-op for single-instance deployments.
 * Prevents race conditions when concurrent requests debit/credit the same user's balance.
 * @param {string} userId
 * @param {() => Promise<void>} fn
 */
export async function withUserUsageLock(userId, fn) {
  const redis = await getRedis();
  if (!redis) {
    // Single-instance: no distributed lock needed, run directly.
    return fn();
  }
  const lockKey = `usage:lock:${userId}`;
  const ownerToken = randomUUID();
  const got = await redis.set(lockKey, ownerToken, { NX: true, EX: 30 });
  if (!got) {
    throw Object.assign(
      new Error(
        "Another request is already in progress for this account. Please retry.",
      ),
      { status: 429 },
    );
  }
  try {
    return await fn();
  } finally {
    await releaseOwnedLock(redis, lockKey, ownerToken);
  }
}
