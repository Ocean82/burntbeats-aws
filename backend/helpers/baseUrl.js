// @ts-check

/**
 * Get the correct base URL protocol for the current request.
 * Handles cases where the app is behind a reverse proxy/load balancer.
 * When TLS terminates before Node (e.g. ALB → nginx on HTTP), `X-Forwarded-Proto`
 * can be wrong if nginx sets it from `$scheme` only — set PUBLIC_BASE_URL in production.
 * @param {import("express").Request} req
 * @returns {string}
 */
export function getBaseUrl(req) {
  const fixed = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  if (fixed) return fixed;
  const proto = req.get("x-forwarded-proto") || req.protocol;
  const host = req.get("host") || "burntbeats.com";
  return `${proto}://${host}`;
}
