// @ts-check
/**
 * Resolve Stripe price IDs for checkout and plan mapping.
 */
import { getPriceIds } from "./stripeClient.js";

/** @typedef {"month" | "year"} BillingInterval */

/**
 * @param {string} plan
 * @param {BillingInterval} [interval]
 * @returns {string}
 */
export function resolveCheckoutPriceId(plan, interval = "month") {
  const ids = getPriceIds();
  if (interval === "year") {
    const annualKey = /** @type {keyof typeof ids} */ (`${plan}_annual`);
    const annualId = ids[annualKey];
    if (annualId) return annualId;
  }
  const monthlyId = ids[/** @type {keyof typeof ids} */ (plan)];
  return monthlyId || "";
}

/**
 * Map a Stripe price id to internal plan name.
 * @param {string | undefined | null} priceId
 * @returns {string}
 */
export function planFromPriceId(priceId) {
  if (!priceId) return "unknown";
  for (const [key, id] of Object.entries(getPriceIds())) {
    if (id && id === priceId) {
      if (key.endsWith("_annual")) return key.replace(/_annual$/, "");
      return key;
    }
  }
  return "unknown";
}

/**
 * @returns {boolean}
 */
export function isAnnualBillingEnabled() {
  return !["0", "false", "no"].includes(
    (process.env.ANNUAL_BILLING_ENABLED || "1").toLowerCase(),
  );
}

/**
 * @returns {boolean}
 */
export function isCancelFlowEnabled() {
  return !["0", "false", "no"].includes(
    (process.env.CANCEL_FLOW_ENABLED || "1").toLowerCase(),
  );
}
