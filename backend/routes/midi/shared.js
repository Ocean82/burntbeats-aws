// @ts-check
/**
 * Shared constants and helpers for MIDI route modules.
 */
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

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

/** Output directory for MIDI files — must match midi_service MIDI_OUTPUT_DIR. */
export const MIDI_OUTPUT_DIR = path.resolve(
  process.env.MIDI_OUTPUT_DIR ||
    path.join(__dirname, "..", "..", "..", "tmp", "midi"),
);

/** Time to wait for MIDI service to accept the job (202). */
export const MIDI_ACCEPT_TIMEOUT_MS =
  Number(process.env.MIDI_ACCEPT_TIMEOUT_MS) || 30_000;

/** MIDI service base URL. */
export const MIDI_SERVICE_URL =
  process.env.MIDI_SERVICE_URL || "http://localhost:5002";

/** MIDI service API token for service-to-service auth. */
export const MIDI_SERVICE_API_TOKEN =
  process.env.MIDI_SERVICE_API_TOKEN || "";

/** Token cost for a single MIDI conversion (half a stem split). */
export const MIDI_TOKEN_COST = Number(process.env.MIDI_TOKEN_COST) || 0.5;

/** Default age for cleanup endpoint when `maxAgeHours` query is omitted */
export const MIDI_CLEANUP_DEFAULT_MAX_AGE_HOURS = (() => {
  const raw = Number(process.env.MIDI_CLEANUP_DEFAULT_MAX_AGE_HOURS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return 24;
})();

/**
 * Attach MIDI service auth header when token protection is enabled.
 * @param {Record<string, string>} headers
 * @returns {Record<string, string>}
 */
export function withMidiServiceAuthHeader(headers) {
  if (!MIDI_SERVICE_API_TOKEN) return headers;
  return { ...headers, "X-Midi-Service-Token": MIDI_SERVICE_API_TOKEN };
}

/**
 * Handle a proxy error with optional usage refund.
 * @param {unknown} e
 * @param {import("express").Response} res
 * @param {string} logPrefix
 * @param {{ usageReserved: boolean; usageUserId: string | null; usageCost: number }} usage
 */
export async function handleMidiProxyError(e, res, logPrefix, usage) {
  if (usage.usageReserved && usage.usageUserId && usage.usageCost > 0) {
    try {
      await refundUsageTokens(usage.usageUserId, usage.usageCost);
    } catch (refundErr) {
      console.error(`${logPrefix} usage refund failed:`, refundErr);
    }
  }
  if (isProxyHttpError(e)) {
    console.warn(`${logPrefix} MIDI service error:`, e.statusCode, e.error);
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
      ? "MIDI service did not respond in time (check midi_service is running)"
      : "MIDI service unavailable (ensure midi_service runs on port 5002)";
  return res.status(502).json({ error: message });
}

// Re-export commonly used items
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
