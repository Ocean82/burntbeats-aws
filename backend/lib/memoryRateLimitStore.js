// @ts-check
/**
 * Bounded in-memory sliding-window rate limit store with LRU eviction.
 */

const DEFAULT_MAX_ENTRIES =
  Number(process.env.RATE_LIMIT_MAX_ENTRIES) || 10_000;

/**
 * @typedef {{ count: number, resetTime: number, lastAccess: number }} RateRecord
 */

/**
 * @param {{ maxEntries?: number, name?: string }} [opts]
 */
export function createMemoryRateLimitStore(opts = {}) {
  const maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const name = opts.name ?? "default";
  /** @type {Map<string, RateRecord>} */
  const store = new Map();

  function pruneExpired(now) {
    for (const [key, record] of store.entries()) {
      if (now > record.resetTime) store.delete(key);
    }
  }

  function evictOne() {
    let victim = null;
    let oldestAccess = Infinity;
    for (const [key, record] of store.entries()) {
      if (record.lastAccess < oldestAccess) {
        oldestAccess = record.lastAccess;
        victim = key;
      }
    }
    if (victim != null) store.delete(victim);
  }

  /**
   * @param {string} key
   * @param {number} windowMs
   * @param {number} maxRequests
   * @returns {{ allowed: boolean, retryAfterSec: number }}
   */
  function check(key, windowMs, maxRequests) {
    const now = Date.now();
    pruneExpired(now);

    while (store.size >= maxEntries) {
      evictOne();
      if (store.size >= maxEntries) break;
    }

    const record = store.get(key);
    if (!record || now > record.resetTime) {
      store.set(key, {
        count: 1,
        resetTime: now + windowMs,
        lastAccess: now,
      });
      return { allowed: true, retryAfterSec: Math.ceil(windowMs / 1000) };
    }

    record.lastAccess = now;
    if (record.count >= maxRequests) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((record.resetTime - now) / 1000),
      );
      return { allowed: false, retryAfterSec };
    }
    record.count++;
    return { allowed: true, retryAfterSec: Math.ceil(windowMs / 1000) };
  }

  function pruneAll() {
    const now = Date.now();
    pruneExpired(now);
  }

  return { check, pruneAll, name };
}
