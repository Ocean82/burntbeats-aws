// @ts-check
/**
 * Correlation ID middleware for Express.
 *
 * Reads X-Correlation-ID from the incoming request header (or generates a UUID
 * if absent), attaches it to `req.correlationId`, and sets it on the response.
 * Also sets X-Service-Version for operational visibility.
 *
 * Downstream service calls should forward `req.correlationId` as
 * `X-Correlation-ID` to enable distributed tracing across all services.
 */
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_VERSION = JSON.parse(
  readFileSync(path.join(__dirname, "..", "package.json"), "utf-8"),
).version;

/**
 * Express middleware that ensures every request has a correlation ID
 * and sets the service version header.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export function correlationIdMiddleware(req, res, next) {
  const correlationId =
    req.headers["x-correlation-id"] || randomUUID();

  // Attach to request for downstream use
  /** @type {any} */ (req).correlationId = correlationId;

  // Set on response so clients can trace their request
  res.setHeader("X-Correlation-ID", correlationId);
  res.setHeader("X-Service-Version", SERVICE_VERSION);

  next();
}

/**
 * Get the correlation ID from a request object.
 * @param {import("express").Request} req
 * @returns {string}
 */
export function getCorrelationId(req) {
  return /** @type {any} */ (req).correlationId || "unknown";
}
