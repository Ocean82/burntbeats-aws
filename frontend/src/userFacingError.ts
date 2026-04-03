/**
 * Keep user-visible error copy short and non-technical in production (no stacks, paths, HTML error pages).
 * Full text remains available in dev via import.meta.env.DEV.
 */

const MAX_SAFE_LEN = 220;

/**
 * @param s
 * @returns true if string is plausibly a deliberate API validation message, not a stack trace or HTML.
 */
export function isLikelySafeUserFacingErrorText(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > MAX_SAFE_LEN) return false;
  if (/[\n\r\x00-\x08\x0b\x0c\x0e-\x1f]/.test(t)) return false;
  const lower = t.toLowerCase();
  if (
    /(traceback|stack overflow|stack trace|error:|at\s+\w+\.|\.js:\d+|<!doctype|<\s*html|internal server|errno |econnrefused|aggregateerror|unhandled|undefined is not|syntaxerror|referenceerror)/i.test(
      lower,
    )
  ) {
    return false;
  }
  if (/\/(?:tmp|var|usr|home|repo|app|mnt|proc)\b/i.test(lower)) return false;
  if (/\\[a-zA-Z.:]|[a-z]:\\/i.test(t)) return false;
  return true;
}

/**
 * @param raw message from API or thrown upstream
 * @param fallback generic copy when raw is missing or unsafe (production)
 */
export function userFacingApiError(raw: string | null | undefined, fallback: string): string {
  if (!raw?.trim()) return fallback;
  const t = raw.trim();
  if (import.meta.env.DEV) return t.slice(0, 2000);
  if (isLikelySafeUserFacingErrorText(t)) return t;
  return fallback;
}

/**
 * Prefer a safe JSON `error` string; otherwise status-based generic copy (production).
 */
export function userFacingHttpError(
  status: number,
  bodyError: string | null | undefined,
  devFallback: string,
): string {
  const fromBody = bodyError ? userFacingApiError(bodyError, "") : "";
  if (fromBody) return fromBody;
  if (import.meta.env.DEV) return devFallback || `Request failed (${status})`;
  if (status === 413) return "This file is too large.";
  if (status === 401 || status === 403) return "Please sign in and try again.";
  if (status === 429) return "Too many requests. Please wait a moment.";
  if (status >= 500 && status < 600) return "Something went wrong on our end. Please try again.";
  return "Something went wrong. Please try again.";
}
