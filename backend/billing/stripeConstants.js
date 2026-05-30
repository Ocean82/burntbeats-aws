// @ts-check
/**
 * Stripe API version pinned for predictable webhook payloads and SDK behavior.
 * @see https://docs.stripe.com/api/versioning
 */
export const STRIPE_API_VERSION = "2026-04-22.dahlia";

/**
 * @param {string} key
 * @returns {boolean}
 */
export function isStripeSecretKey(key) {
  const k = key.trim();
  return /^sk_(live|test)_/.test(k) || /^rk_(live|test)_/.test(k);
}
