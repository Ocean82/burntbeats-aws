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
 *   quality: string | null,  // stem_quality enum for stem jobs; null for speech/midi
 *   isSample: boolean,
 *   originalFilename: string | null,
 *   durationSeconds: number | null,
 *   tokenCost: number,
 *   splitIntent?: Record<string, unknown> | null,
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
      `INSERT INTO jobs (job_id, clerk_user_id, status, stems, quality, is_sample, original_filename, duration_seconds, token_cost, split_intent)
       VALUES ($1, $2, 'accepted', $3, $4, $5, $6, $7, $8, $9::jsonb)
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
        params.splitIntent ? JSON.stringify(params.splitIntent) : null,
      ],
    );
  } catch (err) {
    console.error("[db-jobs] insertJob failed:", err instanceof Error ? err.message : err);
    throw err; // Re-throw so caller knows persistence failed
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
       ON CONFLICT (job_id, stem_name) DO UPDATE SET
         s3_key = COALESCE(EXCLUDED.s3_key, stems.s3_key),
         file_size_bytes = COALESCE(EXCLUDED.file_size_bytes, stems.file_size_bytes)`,
      params,
    );
  } catch (err) {
    console.error("[db-jobs] insertStems failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Get a single job by ID.
 * @param {string} jobId
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function getJobById(jobId) {
  const pool = getPool();
  if (!pool) return null;
  try {
    const result = await pool.query(
      `SELECT job_id, clerk_user_id, status, stems, quality, is_sample, original_filename,
              duration_seconds, token_cost, error_message, model_name,
              created_at, started_at, completed_at, email_notified_at
       FROM jobs WHERE job_id = $1`,
      [jobId],
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error("[db-jobs] getJobById failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Mark a job's email notification as sent.
 * @param {string} jobId
 * @param {string} [error]
 */
export async function markJobEmailNotified(jobId, error) {
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `UPDATE jobs SET email_notified_at = now(), email_notification_error = $2
       WHERE job_id = $1`,
      [jobId, error || null],
    );
  } catch (err) {
    console.error("[db-jobs] markJobEmailNotified failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Atomically transition a job to a terminal status ONLY if it's currently in a non-terminal state.
 * Returns the job's clerk_user_id and token_cost if the transition actually happened (first caller),
 * or null if the job was already in a terminal state (subsequent polls).
 *
 * This prevents duplicate token refunds and duplicate email sends when the status endpoint
 * is polled multiple times after completion.
 *
 * @param {string} jobId
 * @param {'completed' | 'failed' | 'cancelled'} status
 * @param {{ errorMessage?: string, modelName?: string }} [extra]
 * @returns {Promise<{ clerk_user_id: string | null, token_cost: number, is_sample: boolean } | null>}
 */
export async function transitionToTerminal(jobId, status, extra = {}) {
  const pool = getPool();
  if (!pool) return null;
  try {
    const sets = ["status = $2", "completed_at = now()"];
    const params = [jobId, status];
    let idx = 3;

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

    // Only match if the job is currently in a non-terminal state
    const result = await pool.query(
      `UPDATE jobs SET ${sets.join(", ")}
       WHERE job_id = $1
         AND status NOT IN ('completed', 'failed', 'cancelled')
       RETURNING clerk_user_id, token_cost, is_sample`,
      params,
    );

    return result.rows[0] || null;
  } catch (err) {
    console.error("[db-jobs] transitionToTerminal failed:", err instanceof Error ? err.message : err);
    return null;
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
              duration_seconds, token_cost, split_intent, model_name, error_message,
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

/**
 * Get job history with nested stem metadata for a user.
 * Used by the "My Stems" page to show past jobs with download links.
 * @param {string} clerkUserId
 * @param {{ limit?: number, offset?: number }} [opts]
 * @returns {Promise<{ jobs: Array<Record<string, unknown>>, total: number }>}
 */
export async function getJobHistoryWithStems(clerkUserId, opts = {}) {
  const pool = getPool();
  if (!pool) return { jobs: [], total: 0 };
  const limit = Math.min(opts.limit || 50, 200);
  const offset = Math.max(opts.offset || 0, 0);
  try {
    // Get total count of completed jobs
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM jobs WHERE clerk_user_id = $1 AND status = 'completed'`,
      [clerkUserId],
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get jobs with nested stem metadata
    const result = await pool.query(
      `SELECT 
        j.job_id, j.status, j.stems, j.quality, j.original_filename,
        j.duration_seconds, j.token_cost, j.split_intent, j.model_name, j.created_at, j.completed_at,
        COALESCE(
          json_agg(
            json_build_object(
              'stem_name', s.stem_name,
              's3_key', s.s3_key,
              'file_size_bytes', s.file_size_bytes
            )
          ) FILTER (WHERE s.id IS NOT NULL),
          '[]'::json
        ) AS stem_files
      FROM jobs j
      LEFT JOIN stems s ON s.job_id = j.job_id
      WHERE j.clerk_user_id = $1 AND j.status = 'completed'
      GROUP BY j.job_id
      ORDER BY j.created_at DESC
      LIMIT $2 OFFSET $3`,
      [clerkUserId, limit, offset],
    );
    return { jobs: result.rows, total };
  } catch (err) {
    console.error("[db-jobs] getJobHistoryWithStems failed:", err instanceof Error ? err.message : err);
    return { jobs: [], total: 0 };
  }
}

/**
 * Reap jobs that are stuck in 'processing' or 'accepted' state for longer than the timeout.
 * Marks them as 'failed' with a clear error message. Called once on backend startup.
 *
 * @param {{ timeoutMinutes?: number }} [options]
 * @returns {Promise<number>} Number of reaped jobs (0 = nothing to clean up)
 */
export async function reapStaleJobs(options = {}) {
  const pool = getPool();
  if (!pool) return 0;

  const timeoutMinutes = options.timeoutMinutes ?? 30;
  const errorMessage = `Job stalled — exceeded ${timeoutMinutes} minute timeout without completion. The stem service may have restarted or crashed during processing.`;

  try {
    const result = await pool.query(
      `UPDATE jobs
       SET status = 'failed',
           error_message = $1,
           completed_at = now()
       WHERE status IN ('accepted', 'processing')
         AND created_at < now() - ($2::integer * interval '1 minute')
       RETURNING job_id, clerk_user_id, token_cost`,
      [errorMessage, timeoutMinutes],
    );

    if (result.rowCount > 0) {
      console.warn(
        `[db-jobs] reapStaleJobs: marked ${result.rowCount} stalled job(s) as failed:`,
        result.rows.map((r) => r.job_id).join(", "),
      );
    }
    return result.rowCount;
  } catch (err) {
    console.error("[db-jobs] reapStaleJobs failed:", err instanceof Error ? err.message : err);
    return 0;
  }
}
