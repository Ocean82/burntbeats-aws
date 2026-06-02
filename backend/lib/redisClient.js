// @ts-check
/**
 * Shared Redis singleton for rate limiting, job status cache, Stripe webhooks, and credits.
 * Set REDIS_URL or STRIPE_WEBHOOK_REDIS_URL (e.g. redis://localhost:6379).
 */

/** @type {Promise<import("redis").RedisClientType | null> | null} */
let clientPromise = null;

/** @type {Promise<import("redis").RedisClientType | null> | null} */
let connectInFlight = null;

export function getRedisUrl() {
  return (process.env.REDIS_URL || process.env.STRIPE_WEBHOOK_REDIS_URL || "").trim();
}

/**
 * @returns {Promise<import("redis").RedisClientType | null>}
 */
export async function getRedis() {
  const url = getRedisUrl();
  if (!url) return null;

  if (clientPromise) {
    try {
      const client = await clientPromise;
      if (client?.isOpen) return client;
    } catch {
      clientPromise = null;
    }
  }

  if (!connectInFlight) {
    connectInFlight = (async () => {
      try {
        const { createClient } = await import("redis");
        const c = createClient({ url });
        c.on("error", (err) => {
          console.error("[redis]", err.message);
          clientPromise = null;
        });
        await c.connect();
        console.log("[redis] connected");
        clientPromise = Promise.resolve(c);
        return c;
      } catch (e) {
        console.error(
          "[redis] connect failed:",
          e instanceof Error ? e.message : e,
        );
        clientPromise = null;
        return null;
      } finally {
        connectInFlight = null;
      }
    })();
  }

  return connectInFlight;
}

/** Reset cached client (tests). */
export function resetRedisClientForTests() {
  clientPromise = null;
  connectInFlight = null;
}
