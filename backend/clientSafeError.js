// @ts-check
/**
 * Reduce accidental leakage of stack traces, paths, and infra errors in JSON `error` fields.
 * Set EXPOSE_UPSTREAM_ERROR_DETAILS=1 to forward raw messages (local debugging only).
 */

const EXPOSE_DETAILS = ["1", "true", "yes"].includes(
  (process.env.EXPOSE_UPSTREAM_ERROR_DETAILS || "").toLowerCase(),
);

/**
 * @param {string} s
 * @returns {boolean}
 */
export function isLikelySafeUserFacingMessage(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (!t || t.length > 240) return false;
  if (/[\n\r\x00-\x1f]/.test(t)) return false;
  const lower = t.toLowerCase();
  if (
    /(traceback|file "|"<module|exception wrapping|errno |econnrefused|aggregateerror|prisma\.|sql|postgres|redis|mongodb|internal server|stack overflow|unhandled|undefined is not)/i.test(
      lower,
    )
  ) {
    return false;
  }
  if (/\/(?:tmp|var|usr|home|repo|app|mnt|proc|sys)(?:\/|\b)/i.test(lower)) return false;
  if (/\\[a-zA-Z.:]|[a-z]:\\|\\\\/i.test(t)) return false;
  return true;
}

/**
 * @param {unknown} raw
 * @param {string} fallback
 * @param {string} logPrefix
 * @returns {string}
 */
export function publicErrorMessage(raw, fallback, logPrefix) {
  if (typeof raw !== "string") return fallback;
  const t = raw.trim();
  if (!t) return fallback;
  if (EXPOSE_DETAILS) return t.slice(0, 500);
  if (isLikelySafeUserFacingMessage(t)) return t.slice(0, 300);
  console.warn(logPrefix, "suppressed client error detail");
  return fallback;
}

/**
 * @param {number} statusCode
 * @param {unknown} raw
 * @returns {string}
 */
export function sanitizedProxyClientError(statusCode, raw) {
  const fallback =
    statusCode >= 500
      ? "The stem service had a problem. Please try again."
      : "Request could not be completed.";
  return publicErrorMessage(raw, fallback, `[stem proxy ${statusCode}]`);
}
