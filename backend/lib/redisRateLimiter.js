// @ts-check
/**
 * Redis-backed sliding window rate limiter.
 *
 * Uses Redis sorted sets for accurate distributed rate limiting across
 * multiple backend instances. Falls back to allowing the request if Redis
 * is unavailable (graceful degradation — the in-memory limiter still applies).
 *
 * Algorithm: sliding window log using ZRANGEBYSCORE + ZADD + EXPIRE.
 * Each request adds a member (timestamp) to a sorted set keyed by IP.
 * Count members in the current window to determine if limit is exceeded.
 */
import { getRedis } from "./redisClient.js";
import { rateLimitHitsTotal } from "../metrics.js";

/** Track whether we've logged a Redis fallback warning recently. */
let lastFallbackWarnTime = 0;
const FALLBACK_WARN_INTERVAL_MS = 60_000;

/**
 * Create a Redis-backed rate limit check function.
 *
 * @param {{
 *   windowMs: number,
 *   maxRequests: number,
 *   keyPrefix: string,
 * }} config
 * @returns {(ip: string) => Promise<{ allowed: boolean, remaining: number }>}
 */
export function createRedisRateLimiter({ windowMs, maxRequests, keyPrefix }) {
  /**
   * Check if the request from this IP is within rate limits.
   * @param {string} ip
   * @returns {Promise<{ allowed: boolean, remaining: number }>}
   */
  return async function checkRateLimit(ip) {
    /** @type {import("redis").ReturnType<typeof import("redis").createClient> | null} */
    let redis;
    try {
      redis = await getRedis();
    } catch {
      redis = null;
    }

    if (!redis) {
      // Redis unavailable — fall through (in-memory limiter still applies)
      if (Date.now() - lastFallbackWarnTime > FALLBACK_WARN_INTERVAL_MS) {
        console.warn(
          `[rate-limiter] Redis unavailable for ${keyPrefix}, falling back to in-memory`,
        );
        lastFallbackWarnTime = Date.now();
      }
      return { allowed: true, remaining: maxRequests };
    }

    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      // Pipeline: remove expired entries, count current window, add new entry, set TTL
      const pipeline = redis.multi();
      pipeline.zRemRangeByScore(key, "-inf", String(windowStart));
      pipeline.zCard(key);
      pipeline.zAdd(key, { score: now, value: `${now}:${Math.random().toString(36).slice(2, 8)}` });
      pipeline.expire(key, Math.ceil(windowMs / 1000));

      const results = await pipeline.exec();
      // results[1] is the ZCARD result (count before adding new entry)
      const currentCount = /** @type {number} */ (results?.[1]) || 0;

      if (currentCount >= maxRequests) {
        rateLimitHitsTotal.inc();
        return { allowed: false, remaining: 0 };
      }

      return { allowed: true, remaining: maxRequests - currentCount - 1 };
    } catch (e) {
      // Redis error — allow the request (graceful degradation)
      console.error(
        `[rate-limiter] Redis error for ${keyPrefix}:`,
        e instanceof Error ? e.message : e,
      );
      return { allowed: true, remaining: maxRequests };
    }
  };
}
