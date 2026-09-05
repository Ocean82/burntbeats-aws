// @ts-check
import { transitionToTerminal as defaultTransitionToTerminal } from "../../db-jobs.js";
import { refundUsageTokens as defaultRefundUsageTokens } from "../../usageTokens.js";

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);
const REFUND_STATUSES = new Set(["failed", "cancelled"]);

/**
 * @param {{
 *   usageReserved: boolean;
 *   usageUserId: string | null;
 *   usageCost: number;
 *   refundUsageTokens?: (userId: string, amount: number, meta?: { jobId?: string }) => Promise<void>;
 *   logger?: Pick<Console, "error">;
 *   logPrefix?: string;
 * }} params
 * @returns {Promise<boolean>}
 */
export async function refundReservedMidiUsage({
  usageReserved,
  usageUserId,
  usageCost,
  refundUsageTokens = defaultRefundUsageTokens,
  logger = console,
  logPrefix = "[midi]",
}) {
  if (!usageReserved || !usageUserId || !Number.isFinite(usageCost) || usageCost <= 0) {
    return false;
  }

  try {
    await refundUsageTokens(usageUserId, usageCost);
    return true;
  } catch (error) {
    logger.error(`${logPrefix} usage refund failed:`, error);
    return false;
  }
}

/**
 * Atomically records a MIDI terminal status and refunds paid failed/cancelled
 * jobs only for the first caller that wins the DB transition.
 *
 * @param {{
 *   jobId: string;
 *   status: unknown;
 *   errorMessage?: string;
 *   modelName?: string;
 *   transitionToTerminal?: (
 *     jobId: string,
 *     status: "completed" | "failed" | "cancelled",
 *     extra?: { errorMessage?: string; modelName?: string },
 *   ) => Promise<{ clerk_user_id: string | null; token_cost: number; is_sample: boolean } | null>;
 *   refundUsageTokens?: (userId: string, amount: number, meta?: { jobId?: string }) => Promise<void>;
 *   logger?: Pick<Console, "error" | "log">;
 * }} params
 * @returns {Promise<{ clerk_user_id: string | null; token_cost: number; is_sample: boolean } | null>}
 */
export async function finalizeMidiTerminalStatus({
  jobId,
  status,
  errorMessage,
  modelName,
  transitionToTerminal = defaultTransitionToTerminal,
  refundUsageTokens = defaultRefundUsageTokens,
  logger = console,
}) {
  if (!TERMINAL_STATUSES.has(String(status))) return null;

  const terminalStatus = /** @type {"completed" | "failed" | "cancelled"} */ (status);
  let transitioned;
  try {
    transitioned = await transitionToTerminal(jobId, terminalStatus, {
      errorMessage,
      modelName,
    });
  } catch (error) {
    logger.error(`[midi/status] terminal transition for ${jobId} failed:`, error);
    return null;
  }

  if (!transitioned) return null;
  if (!REFUND_STATUSES.has(terminalStatus) || transitioned.is_sample) {
    return transitioned;
  }

  const cost = Number(transitioned.token_cost) || 0;
  if (cost <= 0 || !transitioned.clerk_user_id) return transitioned;

  try {
    await refundUsageTokens(transitioned.clerk_user_id, cost, { jobId });
    logger.log?.(
      `[midi/status] Refunded ${cost} tokens to ${transitioned.clerk_user_id} for ${terminalStatus} MIDI job ${jobId}`,
    );
  } catch (error) {
    logger.error(`[midi/status] refund for ${jobId} failed:`, error);
  }

  return transitioned;
}
