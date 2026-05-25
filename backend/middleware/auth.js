// @ts-check
import { createHmac, timingSafeEqual } from "crypto";
import { verifyClerkBearer } from "../clerkAuth.js";
import { isUsageTokensEnabled } from "../usageTokens.js";
import { publicErrorMessage } from "../clientSafeError.js";
import { UUID_REGEX } from "../helpers/validation.js";

const JOB_TOKEN_TTL_MS =
  Number(process.env.JOB_TOKEN_TTL_MS) || 60 * 60 * 1000; // 1 hour default

const DEV_BYPASS_UPLOAD_AUTH =
  process.env.NODE_ENV !== "production" &&
  ["1", "true", "yes"].includes(
    (process.env.DEV_BYPASS_UPLOAD_AUTH || "").toLowerCase(),
  );

// ── Job token helpers (HMAC-SHA256, no external deps) ─────────────────────────
// Token format: "<jobId>.<expiresAt>.<hmac>" — all base64url encoded fields.

/**
 * Issue a signed job token for a given job_id.
 * @param {string} jobId
 * @returns {string}
 */
export function issueJobToken(jobId) {
  const secret = process.env.JOB_TOKEN_SECRET || "";
  const ttl = Number(process.env.JOB_TOKEN_TTL_MS) || JOB_TOKEN_TTL_MS;
  const expiresAt = Date.now() + ttl;
  const payload = `${jobId}.${expiresAt}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/**
 * Verify a job token. Returns the jobId if valid, null otherwise.
 * @param {string} token
 * @param {string} secret
 * @returns {string | null} jobId
 */
export function verifyJobToken(token, secret) {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [jobId, expiresAtStr, sig] = parts;
  if (!UUID_REGEX.test(jobId)) return null;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  const payload = `${jobId}.${expiresAtStr}`;
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return jobId;
}

/**
 * Validate the x-job-token header for a specific job id.
 * @param {import("express").Request} req
 * @param {string | undefined | null} jobId
 * @returns {{ ok: true } | { ok: false; status: number; error: string }}
 */
export function validateJobTokenForRequest(req, jobId) {
  const secret = process.env.JOB_TOKEN_SECRET || "";
  if (!secret) return { ok: true };
  if (!jobId) {
    return { ok: false, status: 400, error: "Missing job_id." };
  }
  const token = req.headers["x-job-token"];
  const verified = verifyJobToken(/** @type {string} */ (token), secret);
  if (!verified || verified !== jobId) {
    return { ok: false, status: 401, error: "Missing or invalid job token." };
  }
  return { ok: true };
}

/**
 * Middleware: when JOB_TOKEN_SECRET is set, require a valid x-job-token header
 * that matches the job_id (never accept tokens in the query string — URLs leak via Referer/logs).
 * Job id is resolved from: req.params.job_id → req.body.job_id
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export function jobTokenMiddleware(req, res, next) {
  const jobId = req.params.job_id || (req.body && req.body.job_id);
  const result = validateJobTokenForRequest(req, jobId);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  next();
}

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export function authMiddleware(req, res, next) {
  const key = process.env.API_KEY || "";
  if (!key) return next();
  const providedKey = req.headers["x-api-key"];
  if (!providedKey || providedKey !== key) {
    return res
      .status(401)
      .json({ error: "Unauthorized. Invalid or missing API key." });
  }
  next();
}

/**
 * Enforce Clerk auth before upload/scanning work when metered tokens are enabled.
 * This prevents unauthenticated clients from consuming upload/malware-scan resources.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export async function requireUsageAuthPreUpload(req, res, next) {
  if (DEV_BYPASS_UPLOAD_AUTH) return next();
  if (!isUsageTokensEnabled()) return next();
  try {
    const userId = await verifyClerkBearer(req);
    /** @type {any} */ (req)._usageUserId = userId;
    return next();
  } catch (e) {
    const status =
      e &&
      typeof e === "object" &&
      "status" in e &&
      typeof (/** @type {{ status?: number }} */ (e).status) === "number"
        ? /** @type {{ status?: number }} */ (e).status
        : 401;
    const raw = e instanceof Error ? e.message : "Missing auth token";
    const fallback =
      status === 401 ? "Unauthorized" : "Unable to verify your account.";
    const msg = publicErrorMessage(
      raw,
      fallback,
      "[requireUsageAuthPreUpload]",
    );
    return res.status(status).json({ error: msg });
  }
}

export { DEV_BYPASS_UPLOAD_AUTH };
