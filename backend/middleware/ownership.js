// @ts-check
/**
 * Job ownership enforcement middleware.
 *
 * For jobs with a known DB owner (clerk_user_id), requires Clerk auth matching
 * that owner. For jobs with no DB record or no owner, falls back to job token.
 *
 * Supports test injection via req.app.locals.verifyClerkBearer
 * (same pattern as midi/shared.js verifyMidiOwner).
 */
import { getPool } from "../db.js";
import { verifyClerkBearer } from "../clerkAuth.js";
import { validateJobTokenForRequest } from "./auth.js";

/**
 * Query the DB for a job's owner.
 * @param {string} jobId
 * @returns {Promise<string | null>} clerk_user_id or null
 */
export async function getJobOwner(jobId) {
  const pool = getPool();
  if (!pool) return null;
  try {
    const result = await pool.query(
      `SELECT clerk_user_id FROM jobs WHERE job_id = $1`,
      [jobId],
    );
    if (result.rows.length === 0) return null;
    const owner = result.rows[0].clerk_user_id;
    return owner && typeof owner === "string" && owner.trim() ? owner.trim() : null;
  } catch (err) {
    console.error("[ownership] getJobOwner failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Verify Clerk bearer with test injection support.
 * @param {import("express").Request} req
 * @returns {Promise<string>}
 */
async function verifyOwner(req) {
  const testVerifier = req.app?.locals?.verifyClerkBearer;
  if (typeof testVerifier === "function") {
    return await testVerifier(req);
  }
  return await verifyClerkBearer(req);
}

/**
 * Express middleware: enforce job ownership when the DB has a known owner,
 * falling back to job token when the job has no DB record or no owner.
 *
 * Expects job_id in req.params.job_id.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export async function requireJobOwnership(req, res, next) {
  const jobId = req.params.job_id;
  if (!jobId) {
    return res.status(400).json({ error: "Missing job_id." });
  }

  const owner = await getJobOwner(jobId);

  // No DB owner → fall back to job token
  if (!owner) {
    const tokenResult = validateJobTokenForRequest(req, jobId);
    if (!tokenResult.ok) {
      return res.status(tokenResult.status).json({ error: tokenResult.error });
    }
    return next();
  }

  // DB has an owner → require Clerk auth matching that owner
  try {
    const authenticatedUserId = await verifyOwner(req);
    if (authenticatedUserId !== owner) {
      return res.status(403).json({ error: "You do not have access to this job." });
    }
    return next();
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e && typeof e.status === "number"
        ? e.status
        : 401;
    return res.status(status).json({ error: "Authentication required" });
  }
}
