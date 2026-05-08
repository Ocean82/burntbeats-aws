// @ts-check
/**
 * Stripe client singleton and shared billing utilities.
 *
 * Leaf module — no imports from other billing/ modules.
 */
import Stripe from "stripe";

// Lazy singleton — recreated if the key changes between restarts
let _stripe = /** @type {import("stripe").Stripe | null} */ (null);
let _stripeKey = "";

/**
 * Get or create the Stripe client singleton.
 * Returns null if STRIPE_SECRET_KEY is not set.
 * @returns {import("stripe").Stripe | null}
 */
export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!key) {
    console.warn("[billing] STRIPE_SECRET_KEY not set");
    return null;
  }
  if (key !== _stripeKey) {
    _stripe = new Stripe(key);
    _stripeKey = key;
  }
  return _stripe;
}

/**
 * Price ID map — read at request time so restarts aren't needed after env changes.
 * @returns {{ basic: string, premium: string, studio: string, topup: string, single: string }}
 */
export function getPriceIds() {
  return {
    basic: process.env.STRIPE_PRICE_ID_BASIC || "",
    premium: process.env.STRIPE_PRICE_ID_PREMIUM || "",
    studio: process.env.STRIPE_PRICE_ID_STUDIO || "",
    topup: process.env.STRIPE_PRICE_ID_TOPUP || "",
    single: process.env.STRIPE_PRICE_ID_SINGLE || "",
  };
}

/**
 * Stripe API errors include `raw` and are usually safe to show (invalid price, etc.).
 * Other errors stay generic in production.
 * @param {unknown} err
 * @param {string} fallback
 * @returns {string}
 */
export function safeBillingError(err, fallback) {
  const msg =
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (/** @type {{ message?: unknown }} */ (err).message) === "string"
      ? /** @type {{ message: string }} */ (err).message
      : null;
  if (!msg) return fallback;
  if (process.env.NODE_ENV !== "production") return msg;
  if (err && typeof err === "object" && "raw" in err) return msg;
  return fallback;
}

// ── Startup validation — warn if any expected price ID is missing ────────────
if (process.env.NODE_ENV !== "test") {
  const _ids = getPriceIds();
  const missing = Object.entries(_ids)
    .filter(([, v]) => !v)
    .map(([k]) => `STRIPE_PRICE_ID_${k.toUpperCase()}`);
  if (missing.length > 0) {
    console.warn(
      `[billing] Missing price IDs (checkout will fail for these plans): ${missing.join(", ")}`,
    );
  }
}
