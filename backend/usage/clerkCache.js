// @ts-check
/**
 * Clerk privateMetadata balance cache update.
 *
 * Keeps the Clerk-based billing/usage endpoint fast without a DB query.
 * This is a secondary cache — the DB is the primary source of truth.
 */
import { getClerkClient } from "../clerkAuth.js";

/**
 * Best-effort update of Clerk privateMetadata balance cache.
 * @param {string} userId
 * @param {number} newBalance
 */
export async function updateClerkBalanceCache(userId, newBalance) {
  const clerk = getClerkClient();
  if (!clerk) return;
  const user = await clerk.users.getUser(userId);
  const prev = user.privateMetadata?.usageTokens;
  const rec =
    prev && typeof prev === "object"
      ? { .../** @type {Record<string, unknown>} */ (prev) }
      : {};
  await clerk.users.updateUserMetadata(userId, {
    privateMetadata: {
      .../** @type {Record<string, unknown>} */ (user.privateMetadata || {}),
      usageTokens: {
        ...rec,
        balance: newBalance,
      },
    },
  });
}
