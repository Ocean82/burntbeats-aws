// @ts-check
/**
 * Stripe customer management and subscription queries.
 *
 * Handles customer creation/lookup (persisted in Clerk publicMetadata)
 * and active subscription resolution.
 */
import { getClerkClient } from "../clerkAuth.js";
import { getStripe, getPriceIds } from "./stripeClient.js";
import { planFromPriceId } from "./priceResolver.js";

/**
 * Get or create a Stripe customer for a Clerk userId.
 * Persists stripeCustomerId in Clerk publicMetadata so it survives across sessions.
 * @param {string} userId
 * @returns {Promise<string>} stripeCustomerId
 */
export async function getOrCreateStripeCustomer(userId) {
  const clerk = getClerkClient();
  const stripe = getStripe();
  if (!clerk || !stripe) throw new Error("Billing not configured");
  const user = await clerk.users.getUser(userId);
  const existing = /** @type {string|undefined} */ (
    user.publicMetadata?.stripeCustomerId
  );
  if (existing) return existing;
  const email = user.emailAddresses?.[0]?.emailAddress;
  const customer = await stripe.customers.create({
    email,
    metadata: { clerkUserId: userId },
  });
  const prevPublic =
    user.publicMetadata &&
    typeof user.publicMetadata === "object" &&
    !Array.isArray(user.publicMetadata)
      ? /** @type {Record<string, unknown>} */ ({ ...user.publicMetadata })
      : {};
  await clerk.users.updateUserMetadata(userId, {
    publicMetadata: { ...prevPublic, stripeCustomerId: customer.id },
  });
  return customer.id;
}

/**
 * Returns the active subscription for a customer, or null.
 * @param {string} customerId
 * @returns {Promise<import("stripe").Stripe.Subscription | null>}
 */
export async function getActiveSubscription(customerId) {
  const stripe = getStripe();
  if (!stripe) return null;
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "active",
    limit: 1,
    expand: ["data.items.data.price"],
  });
  return subs.data[0] ?? null;
}

/**
 * Resolve a plan name from a Stripe subscription (matches against known price IDs).
 * @param {import("stripe").Stripe.Subscription} sub
 * @returns {string}
 */
export function planFromSubscription(sub) {
  const priceId = sub.items?.data?.[0]?.price?.id;
  return planFromPriceId(priceId);
}
