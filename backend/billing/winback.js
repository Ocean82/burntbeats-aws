// @ts-check
/**
 * Win-back email scheduling after subscription cancellation.
 */
import { getClerkClient } from "../clerkAuth.js";
import { getPool } from "../db.js";
import { sendEmail } from "../email/sender.js";
import { planFromSubscription } from "./stripeCustomer.js";

const WINBACK_SCHEDULE_DAYS = [7, 30, 60];

/**
 * @param {string} clerkUserId
 * @param {string | null} email
 * @param {string | null} lastPlan
 * @param {string | null} cancelReason
 * @param {string | null} stripeSubId
 */
export async function scheduleWinbackEmails(
  clerkUserId,
  email,
  lastPlan,
  cancelReason,
  stripeSubId,
) {
  const pool = getPool();
  if (!pool || !email) return;

  try {
    await pool.query(
      `INSERT INTO churn_records (clerk_user_id, last_plan, cancel_reason, stripe_subscription_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (clerk_user_id) DO UPDATE SET
         last_plan = EXCLUDED.last_plan,
         cancel_reason = EXCLUDED.cancel_reason,
         churned_at = now(),
         stripe_subscription_id = EXCLUDED.stripe_subscription_id`,
      [clerkUserId, lastPlan, cancelReason, stripeSubId],
    );

    for (const days of WINBACK_SCHEDULE_DAYS) {
      const template =
        days === 7 ? "winbackDay7" : days === 30 ? "winbackDay30" : "winbackDay60";
      const dueAt = new Date(Date.now() + days * 24 * 3600 * 1000);
      await pool.query(
        `INSERT INTO winback_email_queue
           (clerk_user_id, email, template_name, due_at, last_plan, cancel_reason)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [clerkUserId, email, template, dueAt.toISOString(), lastPlan, cancelReason],
      );
    }
  } catch (err) {
    console.error("[winback] schedule failed:", err instanceof Error ? err.message : err);
  }
}

/** Process due win-back emails (call from cron or internal endpoint). */
export async function processDueWinbackEmails() {
  const pool = getPool();
  if (!pool) return { processed: 0 };

  const res = await pool.query(
    `SELECT id, clerk_user_id, email, template_name, last_plan
     FROM winback_email_queue
     WHERE sent_at IS NULL AND due_at <= now()
     ORDER BY due_at ASC
     LIMIT 50`,
  );

  let processed = 0;
  for (const row of res.rows) {
    const result = await sendEmail(row.email, row.template_name, {
      lastPlan: row.last_plan || "Premium",
      returnUrl: process.env.PUBLIC_BASE_URL || "https://www.burntbeats.com",
    });
    if (result.success) {
      await pool.query(
        `UPDATE winback_email_queue SET sent_at = now() WHERE id = $1`,
        [row.id],
      );
      processed += 1;
    }
  }
  return { processed };
}

/**
 * @param {import("stripe").Stripe} stripe
 * @param {import("stripe").Stripe.Subscription} sub
 * @param {string | null} clerkUserId
 */
export async function handleSubscriptionChurned(stripe, sub, clerkUserId) {
  if (!clerkUserId) return;
  const lastPlan = planFromSubscription(sub);
  const clerk = getClerkClient();
  let email = null;
  let cancelReason = null;
  if (clerk) {
    try {
      const user = await clerk.users.getUser(clerkUserId);
      email = user.emailAddresses?.[0]?.emailAddress ?? null;
      const meta = user.publicMetadata;
      if (meta && typeof meta === "object" && "lastCancelReason" in meta) {
        cancelReason =
          typeof meta.lastCancelReason === "string" ? meta.lastCancelReason : null;
      }
      const prevPublic =
        meta && typeof meta === "object" ? { ...meta } : {};
      await clerk.users.updateUserMetadata(clerkUserId, {
        publicMetadata: {
          ...prevPublic,
          billingStatus: "canceled",
          cancelAtPeriodEnd: false,
        },
      });
    } catch (err) {
      console.warn("[winback] clerk lookup failed:", err instanceof Error ? err.message : err);
    }
  }
  await scheduleWinbackEmails(clerkUserId, email, lastPlan, cancelReason, sub.id);
}
