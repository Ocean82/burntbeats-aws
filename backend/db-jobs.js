// @ts-check
/**
 * Database operations for job tracking and stem metadata.
 *
 * All functions are no-ops (return gracefully) when the DB pool is unavailable,
 * so the app continues to work without a database connection.
 */
import { getPool } from "./db.js";

/**
 * Ensure a user row exists (upsert from Clerk data).
 * Called lazily on first job or token operation for a user.
 * @param {string} clerkUserId
 * @param {{ email?: string, stripeCustomerId?: string }} [meta]
 */
export async function ensureUser(clerkUserId, meta = {}) {
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO users (clerk_user_id, email, stripe_customer_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (clerk_user_id) DO UPDATE SET
         email = COALESCE(EXCLUDED.email, users.email),
         stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, users.stripe_customer_id),
         updated_at = now()`,
      [clerkUserId, meta.email || null, meta.stripeCustomerId || null],
    );
  } catch (err) {
    console.error("[db-jobs] ensureUser failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Record a new job when the stem service accepts it (202).
 * @param {{
 *   jobId: string,
 *   clerkUserId: string | null,
 *   stems: number,
 *   quality: string | null,
 *   isSample: boolean,
 *   originalFilename: string | null,
 *   durationSeconds: number | null,
 *   tokenCost: number,
 * }} params
 */
export async function insertJob(params) {
  const pool = getPool();
  if (!pool) return;
  try {
    if (params.clerkUserId) {
      await ensureUser(params.clerkUserId);
    }
    await pool.query(
      `INSERT INTO jobs (job_id, clerk_user_id, status, stems, quality, is_sample, original_filename, duration_seconds, token_cost)
       VALUES ($1, $2, 'accepted', $3, $4, $5, $6, $7, $8)
       ON CONFLICT (job_id) DO NOTHING`,
      [
        params.jobId,
        params.clerkUserId,
        params.stems,
        params.quality || null,
        params.isSample,
        params.originalFilename || null,
        params.durationSeconds,
        params.tokenCost,
      ],
    );
  } catch (err) {
    console.error("[db-jobs] insertJob failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Update job status (called when polling detects completion/failure, or from a webhook).
 * @param {string} jobId
 * @param {'processing' | 'completed' | 'failed' | 'cancelled'} status
 * @param {{ errorMessage?: string, modelName?: string }} [extra]
 */
export async function updateJobStatus(jobId, status, extra = {}) {
  const pool = getPool();
  if (!pool) return;
  try {
    const sets = ["status = $2"];
    const params = [jobId, status];
    let idx = 3;

    if (status === "processing") {
      sets.push(`started_at = now()`);
    }
    if (status === "completed" || status === "failed" || status === "cancelled") {
      sets.push(`completed_at = now()`);
    }
    if (extra.errorMessage) {
      sets.push(`error_message = $${idx}`);
      params.push(extra.errorMessage);
      idx++;
    }
    if (extra.modelName) {
      sets.push(`model_name = $${idx}`);
      params.push(extra.modelName);
      idx++;
    }

    await pool.query(
      `UPDATE jobs SET ${sets.join(", ")} WHERE job_id = $1`,
      params,
    );
  } catch (err) {
    console.error("[db-jobs] updateJobStatus failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Record individual stem output files for a completed job.
 * @param {string} jobId
 * @param {{ stemName: string, s3Key?: string, fileSizeBytes?: number }[]} stems
 */
export async function insertStems(jobId, stems) {
  const pool = getPool();
  if (!pool || stems.length === 0) return;
  try {
    // Batch insert
    const values = [];
    const params = [];
    let idx = 1;
    for (const s of stems) {
      values.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3})`);
      params.push(jobId, s.stemName, s.s3Key || null, s.fileSizeBytes || null);
      idx += 4;
    }
    await pool.query(
      `INSERT INTO stems (job_id, stem_name, s3_key, file_size_bytes) VALUES ${values.join(", ")}
       ON CONFLICT DO NOTHING`,
      params,
    );
  } catch (err) {
    console.error("[db-jobs] insertStems failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Get job history for a user (most recent first).
 * @param {string} clerkUserId
 * @param {{ limit?: number, offset?: number }} [opts]
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function getJobHistory(clerkUserId, opts = {}) {
  const pool = getPool();
  if (!pool) return [];
  const limit = opts.limit || 50;
  const offset = opts.offset || 0;
  try {
    const result = await pool.query(
      `SELECT job_id, status, stems, quality, is_sample, original_filename,
              duration_seconds, token_cost, model_name, error_message,
              created_at, started_at, completed_at
       FROM jobs
       WHERE clerk_user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [clerkUserId, limit, offset],
    );
    return result.rows;
  } catch (err) {
    console.error("[db-jobs] getJobHistory failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
