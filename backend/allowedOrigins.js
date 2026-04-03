// @ts-check
/**
 * Origins allowed for CORS and Stripe returnUrl validation.
 * Production hosts are always included; extend with FRONTEND_ORIGINS (comma-separated).
 */

/** @type {readonly string[]} */
export const DEFAULT_FRONTEND_ORIGINS = Object.freeze([
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5180",
  "http://localhost",
  "https://burntbeats.com",
  "https://www.burntbeats.com",
]);

/**
 * @returns {Set<string>}
 */
export function getAllowedOriginSet() {
  const fromEnv = (process.env.FRONTEND_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  /** @type {Set<string>} */
  const set = new Set();
  for (const o of [...fromEnv, ...DEFAULT_FRONTEND_ORIGINS]) {
    try {
      set.add(new URL(o).origin);
    } catch {
      /* skip invalid */
    }
  }
  return set;
}
