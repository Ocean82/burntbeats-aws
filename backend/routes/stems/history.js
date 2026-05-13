// @ts-check
/**
 * GET /history — User's stem separation history with nested stem metadata.
 * GET /history/download — Generate presigned URL for a specific stem re-download.
 */
import { Router } from "express";
import { verifyClerkBearer } from "../../clerkAuth.js";
import { UUID_REGEX } from "../../helpers/validation.js";
import { getJobHistoryWithStems } from "../../db-jobs.js";
import { presignStemGetUrl } from "../../s3Presign.js";
import { getPool } from "../../db.js";

export const stemHistoryRouter = Router();

const ALLOWED_STEM_NAMES = ["vocals", "drums", "bass", "other", "instrumental"];

/**
 * Auth helper — verifies Clerk JWT and returns userId or sends error response.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @returns {Promise<string | null>}
 */
async function requireAuth(req, res) {
  try {
    return await verifyClerkBearer(req);
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e && typeof e.status === "number"
        ? e.status
        : 401;
    res.status(status).json({ error: "Authentication required" });
    return null;
  }
}

// ── GET /history ─────────────────────────────────────────────────────────────
stemHistoryRouter.get(
  "/",
  async (req, res) => {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const result = await getJobHistoryWithStems(userId, { limit, offset });
    res.json(result);
  },
);

// ── GET /history/download ────────────────────────────────────────────────────
stemHistoryRouter.get(
  "/download",
  async (req, res) => {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    const { job_id, stem_name } = req.query;

    // Validate inputs
    if (!job_id || !UUID_REGEX.test(job_id)) {
      return res.status(400).json({ error: "Invalid or missing job_id" });
    }
    if (!stem_name || !ALLOWED_STEM_NAMES.includes(stem_name)) {
      return res.status(400).json({ error: "Invalid or missing stem_name" });
    }

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: "Database unavailable" });
    }

    try {
      // Verify job belongs to this user and get s3_key
      const result = await pool.query(
        `SELECT s.s3_key
         FROM stems s
         JOIN jobs j ON j.job_id = s.job_id
         WHERE j.clerk_user_id = $1 AND s.job_id = $2 AND s.stem_name = $3`,
        [userId, job_id, stem_name],
      );

      if (result.rows.length === 0 || !result.rows[0].s3_key) {
        return res.status(404).json({ error: "Stem not found or not available for download" });
      }

      const s3Key = result.rows[0].s3_key;
      const bucket = process.env.S3_BUCKET || "burntbeatz2-storage";
      const region = process.env.S3_REGION || process.env.AWS_REGION || "us-east-1";

      const url = await presignStemGetUrl(bucket, s3Key, region);
      res.json({ url });
    } catch (err) {
      console.error("[stems/history/download] presign failed:", err instanceof Error ? err.message : err);
      return res.status(500).json({ error: "Failed to generate download URL" });
    }
  },
);
