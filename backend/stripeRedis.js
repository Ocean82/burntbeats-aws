// @ts-check
/**
 * Stripe webhook idempotency (uses shared Redis singleton from redisClient.js).
 */
import { getRedis, getRedisUrl } from "./lib/redisClient.js";

export { getRedis, getRedisUrl };

/** @type {string[]} */
const memWebhookQueue = [];
/** @type {Set<string>} */
const memWebhookClaimed = new Set();
const MEM_WEBHOOK_MAX = 5000;

function trimMemWebhook() {
  while (memWebhookQueue.length > MEM_WEBHOOK_MAX) {
    const old = memWebhookQueue.shift();
    if (old) memWebhookClaimed.delete(old);
  }
}

/**
 * Atomically claim this webhook event for processing. False = duplicate.
 * @param {string} eventId Stripe evt_…
 * @returns {Promise<boolean>}
 */
export async function tryClaimWebhookEvent(eventId) {
  const redis = await getRedis();
  if (redis) {
    const key = `stripe:webhook:event:${eventId}`;
    const ok = await redis.set(key, "1", { NX: true, EX: 604800 });
    return ok === "OK";
  }
  if (memWebhookClaimed.has(eventId)) return false;
  memWebhookClaimed.add(eventId);
  memWebhookQueue.push(eventId);
  trimMemWebhook();
  return true;
}

/**
 * @param {string} eventId
 */
export async function releaseWebhookEventClaim(eventId) {
  const redis = await getRedis();
  if (redis) {
    try {
      await redis.del(`stripe:webhook:event:${eventId}`);
    } catch (e) {
      console.error("[redis] webhook del:", e instanceof Error ? e.message : e);
    }
    return;
  }
  memWebhookClaimed.delete(eventId);
}
