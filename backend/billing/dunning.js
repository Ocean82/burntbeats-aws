// @ts-check
/**
 * Dunning helpers for failed payments.
 */
import { getClerkClient } from "../clerkAuth.js";
import { resolveClerkUserIdFromCustomerRef } from "./stripeWebhookUtils.js";
import { sendEmail } from "../email/sender.js";

/**
 * @param {import("stripe").Stripe} stripe
 * @param {import("stripe").Stripe.Invoice} invoice
 */
export async function handleInvoicePaymentFailed(stripe, invoice) {
  const clerkUserId = await resolveClerkUserIdFromCustomerRef(stripe, invoice.customer);
  if (!clerkUserId) return;

  const clerk = getClerkClient();
  let email = null;
  if (clerk) {
    try {
      const user = await clerk.users.getUser(clerkUserId);
      email = user.emailAddresses?.[0]?.emailAddress ?? null;
      const prevPublic =
        user.publicMetadata && typeof user.publicMetadata === "object"
          ? { ...user.publicMetadata }
          : {};
      await clerk.users.updateUserMetadata(clerkUserId, {
        publicMetadata: { ...prevPublic, billingStatus: "past_due" },
      });
    } catch (err) {
      console.warn("[dunning] clerk update failed:", err instanceof Error ? err.message : err);
    }
  }

  if (email) {
    const portalBase = process.env.PUBLIC_BASE_URL || "https://www.burntbeats.com";
    await sendEmail(email, "paymentFailed", {
      updateUrl: `${portalBase}/?billing=update`,
      amountDue: invoice.amount_due ? (invoice.amount_due / 100).toFixed(2) : null,
    });
  }

  console.log(
    `[dunning] payment_failed user=${clerkUserId} invoice=${invoice.id}`,
  );
}

/**
 * @param {import("stripe").Stripe} stripe
 * @param {import("stripe").Stripe.Subscription} sub
 */
export async function syncSubscriptionBillingStatus(stripe, sub) {
  const clerkUserId = await resolveClerkUserIdFromCustomerRef(stripe, sub.customer);
  if (!clerkUserId) return;
  const clerk = getClerkClient();
  if (!clerk) return;

  let billingStatus = "active";
  if (sub.status === "past_due" || sub.status === "unpaid") {
    billingStatus = "past_due";
  } else if (sub.status === "canceled" || sub.status === "incomplete_expired") {
    billingStatus = "canceled";
  } else if (sub.cancel_at_period_end) {
    billingStatus = "cancel_pending";
  }

  try {
    const user = await clerk.users.getUser(clerkUserId);
    const prevPublic =
      user.publicMetadata && typeof user.publicMetadata === "object"
        ? { ...user.publicMetadata }
        : {};
    await clerk.users.updateUserMetadata(clerkUserId, {
      publicMetadata: { ...prevPublic, billingStatus },
    });
  } catch (err) {
    console.warn("[dunning] status sync failed:", err instanceof Error ? err.message : err);
  }
}
