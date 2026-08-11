// @ts-check
/**
 * Shared constants, helpers, and imports used across stem route modules.
 */
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

import { resolvePathWithinBase, resolveUuidJobDir } from "../../helpers/safePath.js";
import { UUID_REGEX } from "../../helpers/validation.js";
import { findJobInputPath } from "../../usage/audioFile.js";
import { verifyClerkBearer } from "../../clerkAuth.js";
import {
  isUsageTokensEnabled,
  refundUsageTokens,
  reserveUsageTokens,
} from "../../usageTokens.js";
import {
  publicErrorMessage,
  sanitizedProxyClientError,
} from "../../clientSafeError.js";
import { isProxyHttpError } from "../../middleware/proxy.js";
import { DEV_BYPASS_UPLOAD_AUTH } from "../../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Must match stem_service OUTPUT_BASE (Python STEM_OUTPUT_DIR). Same path so GET /api/stems/file can serve files Python wrote.
export const STEM_OUTPUT_DIR = path.resolve(
  process.env.STEM_OUTPUT_DIR ||
    path.join(__dirname, "..", "..", "..", "tmp", "stems"),
);

/** Default age for cleanup endpoint when `maxAgeHours` query is omitted */
export const STEM_CLEANUP_DEFAULT_MAX_AGE_HOURS = (() => {
  const raw = Number(process.env.STEM_CLEANUP_DEFAULT_MAX_AGE_HOURS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return 24;
})();

// Time to wait for stem service to accept (202). Separation runs in background; frontend polls for completion.
export const SPLIT_ACCEPT_TIMEOUT_MS =
  Number(process.env.SPLIT_ACCEPT_TIMEOUT_MS) || 5 * 60 * 1000;

/** Temp dir for streaming uploads (one file per request; cleaned after proxy). */
export const UPLOAD_TMP_DIR = path.join(os.tmpdir(), "burntbeats-upload");

/**
 * Resolve a path under STEM_OUTPUT_DIR with path-traversal protection.
 * @param {string} jobId
 * @param {...string} segments
 * @returns {string | null}
 */
export function resolveStemJobPath(jobId, ...segments) {
  if (!resolveUuidJobDir(STEM_OUTPUT_DIR, jobId)) return null;
  return resolvePathWithinBase(STEM_OUTPUT_DIR, jobId, ...segments);
}

/**
 * @param {string} jobId
 * @returns {string | null}
 */
export function resolveStemJobDir(jobId) {
  return resolveUuidJobDir(STEM_OUTPUT_DIR, jobId);
}

/**
 * @param {string} jobId
 * @returns {string | null}
 */
export function findStemJobInputPath(jobId) {
  if (!jobId || !UUID_REGEX.test(jobId)) return null;
  return findJobInputPath(STEM_OUTPUT_DIR, jobId);
}

/**
 * Extract an HTTP status code from an error object (usage token errors, etc.).
 * @param {unknown} e
 * @returns {number}
 */
export function extractErrorStatus(e) {
  if (
    e &&
    typeof e === "object" &&
    "status" in e &&
    typeof /** @type {{ status?: number }} */ (e).status === "number"
  ) {
    return /** @type {{ status?: number }} */ (e).status;
  }
  return 500;
}

/**
 * Build a user-facing error message from a caught usage-token error.
 * @param {unknown} e
 * @param {string} logPrefix - e.g. "[POST /api/stems/split usage]"
 * @param {string} [fallback401] - message for 401 errors
 * @param {string} [fallbackOther] - message for non-401 errors
 * @returns {{ status: number; message: string }}
 */
export function usageErrorResponse(e, logPrefix, fallback401, fallbackOther) {
  const status = extractErrorStatus(e);
  const raw = e instanceof Error ? e.message : String(e);
  const fallback =
    status === 401
      ? (fallback401 || "Unable to verify your account. Please sign in again.")
      : (fallbackOther || "Unable to reserve usage for this operation.");
  const message = publicErrorMessage(raw, fallback, logPrefix);
  return { status, message };
}

/**
 * Handle a proxy error with optional usage refund. Sends the appropriate response.
 * @param {unknown} e - The caught error
 * @param {import("express").Response} res
 * @param {string} logPrefix - e.g. "[POST /api/stems/split]"
 * @param {{ usageReserved: boolean; usageUserId: string | null; usageCost: number }} usage
 */
export async function handleProxyError(e, res, logPrefix, usage) {
  if (usage.usageReserved && usage.usageUserId && usage.usageCost > 0) {
    try {
      await refundUsageTokens(usage.usageUserId, usage.usageCost);
    } catch (refundErr) {
      console.error(`${logPrefix} usage refund failed:`, refundErr);
    }
  }
  if (isProxyHttpError(e)) {
    console.warn(`${logPrefix} stem service error:`, e.statusCode, e.error);
    return res
      .status(e.statusCode)
      .json({ error: sanitizedProxyClientError(e.statusCode, e.error) });
  }
  const err =
    e && typeof e === "object" ? e : { name: "", message: String(e) };
  console.error(
    `${logPrefix} proxy error:`,
    err.name,
    err.message,
    err.cause ?? "",
  );
  const message =
    err.name === "TimeoutError" || err.message === "TimeoutError"
      ? "Stem service did not accept in time (check stem service is running)"
      : "Stem service unavailable (ensure stem service runs on port 5000; try STEM_SERVICE_URL=http://127.0.0.1:5000)";
  return res.status(502).json({ error: message });
}

/**
 * Handle a DB persistence failure after the worker service has accepted a job.
 * Returning an accepted paid job without a DB row loses the terminal refund path,
 * so compensate the reservation and fail the request while the user can retry.
 * @param {{
 *   res: import("express").Response,
 *   error: unknown,
 *   logPrefix: string,
 *   usageReserved: boolean,
 *   usageUserId: string | null,
 *   usageCost: number,
 *   mustPersistOwner: boolean,
 *   refundTokens?: typeof refundUsageTokens,
 * }} params
 * @returns {Promise<import("express").Response | null>}
 */
export async function handleAcceptedJobPersistenceFailure({
  res,
  error,
  logPrefix,
  usageReserved,
  usageUserId,
  usageCost,
  mustPersistOwner,
  refundTokens = refundUsageTokens,
}) {
  console.error(
    `${logPrefix} critical: failed to persist accepted job to DB:`,
    error instanceof Error ? error.message : error,
  );

  if (usageReserved && usageUserId && usageCost > 0) {
    try {
      await refundTokens(usageUserId, usageCost);
    } catch (refundErr) {
      console.error(`${logPrefix} usage refund after DB failure failed:`, refundErr);
    }
  }

  if (!mustPersistOwner) return null;

  return res.status(502).json({
    error: "Could not record your job. Please try again.",
  });
}

// Re-export commonly used items so route modules can import from one place
export {
  verifyClerkBearer,
  isUsageTokensEnabled,
  refundUsageTokens,
  reserveUsageTokens,
  publicErrorMessage,
  sanitizedProxyClientError,
  isProxyHttpError,
  DEV_BYPASS_UPLOAD_AUTH,
};
