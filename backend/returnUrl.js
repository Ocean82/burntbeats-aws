// @ts-check
/**
 * Validates Stripe Checkout / Customer Portal return URLs to prevent open redirects.
 * Allowlist mirrors FRONTEND_ORIGINS (same as CORS).
 */

/**
 * @returns {Set<string>}
 */
function getAllowedOrigins() {
  const raw =
    process.env.FRONTEND_ORIGINS ||
    "http://localhost:5173,http://localhost:5174,http://localhost:3000";
  const set = new Set();
  for (const part of raw.split(",")) {
    const s = part.trim();
    if (!s) continue;
    try {
      set.add(new URL(s).origin);
    } catch {
      /* skip invalid entries */
    }
  }
  return set;
}

/**
 * @param {string} urlString
 * @param {string | undefined} requestOriginHeader
 * @returns {boolean}
 */
export function isAllowedReturnUrl(urlString, requestOriginHeader) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (u.username || u.password) return false;
    const allowed = getAllowedOrigins();
    if (allowed.has(u.origin)) return true;
    if (requestOriginHeader) {
      try {
        const reqOrigin = new URL(requestOriginHeader).origin;
        if (reqOrigin === u.origin) return true;
      } catch {
        /* ignore */
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Normalized return base for Stripe success/cancel URLs (no trailing slash, no query/hash).
 * @param {import("express").Request} req
 * @param {string | undefined} bodyReturnUrl
 * @returns {string}
 */
export function resolveStripeReturnUrl(req, bodyReturnUrl) {
  const fallback = (() => {
    try {
      const o = req.headers.origin || "http://localhost:5173";
      return new URL("/", o).href.replace(/\/$/, "") || o;
    } catch {
      return "http://localhost:5173";
    }
  })();

  if (typeof bodyReturnUrl !== "string" || !bodyReturnUrl.trim()) {
    return fallback;
  }
  let u;
  try {
    u = new URL(bodyReturnUrl.trim());
  } catch {
    throw Object.assign(new Error("Invalid returnUrl."), { status: 400 });
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw Object.assign(new Error("Invalid returnUrl protocol."), { status: 400 });
  }
  // Strip query/hash — clients often send window.location.href (?checkout=success, etc.)
  const base = `${u.origin}${u.pathname}`.replace(/\/$/, "") || u.origin;
  if (!isAllowedReturnUrl(base, req.headers.origin)) {
    throw Object.assign(
      new Error("Invalid returnUrl — origin must be listed in FRONTEND_ORIGINS."),
      { status: 400 },
    );
  }
  return base;
}
