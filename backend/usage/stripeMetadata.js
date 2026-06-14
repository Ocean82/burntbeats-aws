// @ts-check
/**
 * Stripe price metadata parsing for token grants.
 *
 * Shared between billing and usage modules — single source of truth
 * for how Stripe Price metadata maps to token amounts.
 */

/**
 * Current billing period from a Stripe Subscription.
 * Newer Stripe API shapes expose `current_period_*` on subscription items, not the parent object.
 * @param {import("stripe").Stripe.Subscription} sub
 */
export function subscriptionBillingPeriod(sub) {
  const s = /** @type {any} */ (sub);
  const item0 = s.items?.data?.[0];
  const start = s.current_period_start ?? item0?.current_period_start;
  const end = s.current_period_end ?? item0?.current_period_end;
  return { periodStart: start, periodEnd: end };
}

/**
 * Monthly grant in the same units as debit: **1 token = 1 minute of audio**.
 * @param {import("stripe").Stripe.Price} price
 */
export function tokensPerMonthFromPrice(price) {
  const meta = price?.metadata;
  if (meta?.tokens_per_month != null && meta.tokens_per_month !== "") {
    const n = Number(meta.tokens_per_month);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  // Fallback: legacy key used before tokens_per_month was standardised
  if (meta?.token_allowance != null && meta.token_allowance !== "") {
    const n = Number(meta.token_allowance);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  if (
    meta?.token_seconds_per_month != null &&
    meta.token_seconds_per_month !== ""
  ) {
    const sec = Number(meta.token_seconds_per_month);
    if (Number.isFinite(sec) && sec > 0)
      return Math.max(1, Math.ceil(sec / 60));
  }
  const def = Number(process.env.USAGE_DEFAULT_TOKENS_PER_MONTH);
  return Number.isFinite(def) && def > 0 ? Math.floor(def) : 0;
}

/**
 * One-time top-up grant from Stripe Price metadata.
 * Accepts dedicated top-up key first, then monthly key as fallback.
 * @param {import("stripe").Stripe.Price} price
 */
export function tokensPerTopupFromPrice(price) {
  const meta = price?.metadata;
  // Accept both plural (preferred) and singular (legacy Stripe metadata key)
  for (const key of ["tokens_per_topup", "token_per_topup"]) {
    if (meta?.[key] != null && meta[key] !== "") {
      const n = Number(meta[key]);
      if (Number.isFinite(n) && n > 0) return Math.floor(n);
    }
  }
  for (const key of ["token_seconds_per_topup", "token_second_per_topup"]) {
    if (meta?.[key] != null && meta[key] !== "") {
      const sec = Number(meta[key]);
      if (Number.isFinite(sec) && sec > 0)
        return Math.max(1, Math.ceil(sec / 60));
    }
  }
  // Backwards-compatible fallback for teams using a shared metadata key.
  return tokensPerMonthFromPrice(price);
}

/**
 * Entitlement tier from Stripe Price metadata (pack purchases).
 * @param {import("stripe").Stripe.Price} price
 * @returns {"basic" | "premium"}
 */
export function entitlementTierFromPrice(price) {
  const raw = price?.metadata?.entitlement_tier;
  if (typeof raw === "string" && raw.toLowerCase() === "premium") return "premium";
  return "basic";
}
