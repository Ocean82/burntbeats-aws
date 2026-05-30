// @ts-check
/**
 * Shared helpers for Stripe webhook handlers.
 */
import { creditSubscriptionAllowance } from "../usageTokens.js";

/**
 * @param {import("stripe").Stripe} stripe
 * @param {string | import("stripe").Stripe.Customer | null | undefined} customerRef
 * @returns {Promise<string | null>}
 */
export async function resolveClerkUserIdFromCustomerRef(stripe, customerRef) {
  const customerId =
    typeof customerRef === "string"
      ? customerRef
      : customerRef && typeof customerRef === "object" && "id" in customerRef
        ? customerRef.id
        : null;
  if (!customerId) return null;
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return null;
  const clerkUserId = customer.metadata?.clerkUserId;
  return typeof clerkUserId === "string" && clerkUserId.trim()
    ? clerkUserId.trim()
    : null;
}

/**
 * Credit monthly allowance when subscription is active.
 * @param {import("stripe").Stripe} stripe
 * @param {import("stripe").Stripe.Subscription} sub
 * @param {{ stripeEventId?: string }} [options]
 */
export async function creditActiveSubscriptionAllowance(stripe, sub, options = {}) {
  if (sub.status !== "active") return;
  const clerkUserId = await resolveClerkUserIdFromCustomerRef(stripe, sub.customer);
  if (!clerkUserId) {
    console.warn(
      `[billing/webhook] active subscription ${sub.id} missing clerkUserId on customer`,
    );
    return;
  }
  await creditSubscriptionAllowance(clerkUserId, sub, stripe, options);
}
