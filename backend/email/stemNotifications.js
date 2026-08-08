// @ts-check
/**
 * Notify users by email when a stem separation job completes or fails.
 *
 * Fire-and-forget: the caller does not await. Idempotency is handled by
 * checking + setting email_notified_at on the DB row so at most one email
 * is sent per job even if the status endpoint is polled repeatedly.
 */
import { getClerkClient } from "../clerkAuth.js";
import { getJobById, markJobEmailNotified } from "../db-jobs.js";
import { sendSongReadyEmail, sendErrorEmail } from "./sender.js";

/**
 * Build a dashboard URL for a given job so the user can download stems.
 * @param {string} jobId
 */
function dashboardUrl(jobId) {
  const origin = process.env.APP_ORIGIN || "https://www.burntbeats.com";
  return `${origin}/my-stems?job=${jobId}`;
}

/**
 * Attempt to send a completion or failure email for a stem job.
 * Idempotent — checks email_notified_at before sending.
 * Fire-and-forget: logs and swallows errors.
 * @param {string} jobId
 * @param {{
 *   getJobById?: typeof getJobById;
 *   markJobEmailNotified?: typeof markJobEmailNotified;
 *   getClerkClient?: typeof getClerkClient;
 *   sendSongReadyEmail?: typeof sendSongReadyEmail;
 *   sendErrorEmail?: typeof sendErrorEmail;
 * }} [deps]
 */
export async function sendStemCompletionEmail(jobId, deps = {}) {
  if (process.env.EMAIL_NOTIFICATIONS_ENABLED !== "true") {
    return;
  }
  const readJob = deps.getJobById || getJobById;
  const markNotified = deps.markJobEmailNotified || markJobEmailNotified;
  const readClerkClient = deps.getClerkClient || getClerkClient;
  const sendReady = deps.sendSongReadyEmail || sendSongReadyEmail;
  const sendError = deps.sendErrorEmail || sendErrorEmail;

  let job;
  try {
    job = await readJob(jobId);
  } catch {
    return;
  }
  if (!job) return;

  // Already notified (or no user to notify)
  if (job.email_notified_at || !job.clerk_user_id) return;

  let email = "";
  try {
    const clerk = readClerkClient();
    if (!clerk) {
      console.warn(`[stem-email] CLERK_SECRET_KEY not set; skipping notify for ${jobId}`);
      return;
    }
    const clerkUser = await clerk.users.getUser(job.clerk_user_id);
    email = clerkUser.emailAddresses?.[0]?.emailAddress ?? "";
    if (!email) {
      console.warn(`[stem-email] No email for user ${job.clerk_user_id}; skipping ${jobId}`);
      await markNotified(jobId, "no_email_on_clerk_user");
      return;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[stem-email] Clerk lookup failed for ${job.clerk_user_id}: ${msg}`);
    return;
  }

  const filename = job.original_filename || "Untitled";
  const url = dashboardUrl(jobId);

  try {
    let sent = false;
    if (job.status === "completed") {
      const result = await sendReady(email, filename, url);
      if (!result.success) {
        console.warn(`[stem-email] sendSongReadyEmail skipped for ${jobId}:`, result.reason);
        return;
      }
      sent = true;
    } else if (job.status === "failed" && process.env.NOTIFY_ON_ERROR === "true") {
      const result = await sendError(email, filename, job.error_message || "Unknown error");
      if (!result.success) {
        console.warn(`[stem-email] sendErrorEmail skipped for ${jobId}:`, result.reason);
        return;
      }
      sent = true;
    }
    if (!sent) return;

    await markNotified(jobId);
    console.log(`[stem-email] Notification sent for job ${jobId} (${job.status}) -> ${email}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[stem-email] Send failed for ${jobId}: ${msg}`);
  }
}
