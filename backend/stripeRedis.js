// @ts-check
/**
 * Optional Redis for distributed Stripe webhook deduplication (multi-instance API).
 * Set REDIS_URL or STRIPE_WEBHOOK_REDIS_URL (e.g. redis://localhost:6379).
 * If unset, falls back to in-memory Sets (single-instance / dev).
 */
/** @type {Promise<import("redis").ReturnType<typeof import("redis").createClient> | null> | null} */
let clientPromise = null;

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

function getRedisUrl() {
  return (process.env.REDIS_URL || process.env.STRIPE_WEBHOOK_REDIS_URL || "").trim();
}

/**
 * @returns {Promise<import("redis").ReturnType<typeof import("redis").createClient> | null>}
 */
export async function getRedis() {
  const url = getRedisUrl();
  if (!url) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      try {
        const { createClient } = await import("redis");
        const c = createClient({ url });
        c.on("error", (err) => console.error("[redis]", err.message));
        await c.connect();
        console.log("[redis] connected (Stripe webhook idempotency + credit locks)");
        return c;
      } catch (e) {
        console.error("[redis] connect failed:", e instanceof Error ? e.message : e);
        clientPromise = null;
        return null;
      }
    })();
  }
  return clientPromise;
}

/**
 * Atomically claim this webhook event for processing. False = duplicate (another worker or retry already handled).
 * @param {string} eventId Stripe evt_…
 * @returns {Promise<boolean>}
 */
export async function tryClaimWebhookEvent(eventId) {
  const redis = await getRedis();
  if (redis) {
    const key = `stripe:webhook:event:${eventId}`;
    const ok = await redis.set(key, "1", { NX: true, EX: 604800 }); // 7d
    return ok === "OK";
  }
  if (memWebhookClaimed.has(eventId)) return false;
  memWebhookClaimed.add(eventId);
  memWebhookQueue.push(eventId);
  trimMemWebhook();
  return true;
}

/**
 * Release claim so Stripe retry will re-process (use only after handler failure before success).
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
