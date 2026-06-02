// @ts-check
/**
 * GET /status/:job_id — Poll job progress.
 * GET /status/:job_id/stream — SSE stream for real-time progress updates.
 */
import { Router } from "express";
import { existsSync, readFileSync } from "fs";
import path from "path";

import {
  authMiddleware,
  jobTokenMiddleware,
} from "../../middleware/auth.js";
import { requireJobOwnership } from "../../middleware/ownership.js";
import { UUID_REGEX } from "../../helpers/validation.js";
import { getBaseUrl } from "../../helpers/baseUrl.js";
import { updateJobStatus, insertStems } from "../../db-jobs.js";
import { getRedis } from "../../stripeRedis.js";

import { STEM_OUTPUT_DIR } from "./shared.js";

export const statusRouter = Router();

// ── GET /status/:job_id ──────────────────────────────────────────────────────
statusRouter.get(
  "/:job_id",
  authMiddleware,
  requireJobOwnership,
  async (req, res) => {
    const { job_id } = req.params;
    if (!job_id || !UUID_REGEX.test(job_id)) {
      return res.status(400).json({ error: "Invalid job_id" });
    }

    const redis = await getRedis();
    const redisKey = `job:status:${job_id}`;
    
    // 1. Try Redis cache first
    if (redis) {
      try {
        const cached = await redis.get(redisKey);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      } catch { /* skip cache on error */ }
    }

    // 2. Fallback to disk
    const progressPath = path.join(STEM_OUTPUT_DIR, job_id, "progress.json");
    if (!existsSync(progressPath)) {
      return res.status(404).json({ error: "Job not found" });
    }
    let data;
    try {
      data = JSON.parse(readFileSync(progressPath, "utf-8"));
    } catch {
      return res.status(404).json({ error: "Job not found" });
    }
    const baseUrl = getBaseUrl(req);
    // Stem file URLs intentionally omit job_token: clients must use x-job-token (or Authorization) on fetch.
    if (data.stems && Array.isArray(data.stems)) {
      data.stems = data.stems.map((s) => ({
        id: s.id,
        url: `${baseUrl}/api/stems/file/${job_id}/${s.id}.wav`,
        path: s.path,
      }));
    }

    // 3. Populate Redis cache
    if (redis) {
      try {
        const terminal = ["completed", "failed", "cancelled"].includes(data.status);
        const ttl = terminal ? 3600 : 2; // 1 hour for terminal, 2s for active
        await redis.set(redisKey, JSON.stringify(data), { EX: ttl });
      } catch { /* ignore cache write error */ }
    }

    // Update DB job status on terminal states (best-effort, non-blocking)
    const terminalStatuses = ["completed", "failed", "cancelled"];
    if (terminalStatuses.includes(data.status)) {
// ...
      updateJobStatus(job_id, data.status, {
        errorMessage: data.error || undefined,
        modelName: data.model || undefined,
      }).catch(() => {});
      // Record stem metadata (including S3 keys) when job completes
      if (data.status === "completed" && data.stems && Array.isArray(data.stems)) {
        const s3Meta = data.s3;
        const stemRecords = data.stems.map((s) => ({
          stemName: s.id,
          s3Key: s3Meta && s3Meta.keys ? s3Meta.keys[s.id] || null : null,
          fileSizeBytes: null,
        }));
        insertStems(job_id, stemRecords).catch(() => {});
      }
    } else if (data.status === "processing") {
      updateJobStatus(job_id, "processing").catch(() => {});
    }
    res.json(data);
  },
);

// ── GET /status/:job_id/stream (SSE) ─────────────────────────────────────────
/**
 * SSE stream for job progress. Pushes progress.json updates every 500ms until
 * the job reaches a terminal state (completed/failed/cancelled).
 *
 * Uses fetch + ReadableStream on the client (not EventSource) so Authorization
 * and x-job-token headers can be sent. Auth is enforced by the same middleware
 * as the polling endpoint.
 *
 * nginx / ALB: set `proxy_buffering off` and `proxy_read_timeout 300s` for this path.
 */
statusRouter.get(
  "/:job_id/stream",
  authMiddleware,
  requireJobOwnership,
  async (req, res) => {
    const { job_id } = req.params;
    if (!job_id || !UUID_REGEX.test(job_id)) {
      return res.status(400).json({ error: "Invalid job_id" });
    }

    const progressPath = path.join(STEM_OUTPUT_DIR, job_id, "progress.json");
    if (!existsSync(progressPath)) {
      return res.status(404).json({ error: "Job not found" });
    }

    const redis = await getRedis();
    const redisKey = `job:status:${job_id}`;

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    const baseUrl = getBaseUrl(req);

    /**
     * Read progress.json, enrich stem URLs, and send as an SSE data event.
     * Returns true if the job has reached a terminal state.
     * @returns {Promise<boolean>}
     */
    async function sendProgress() {
      let data;
      try {
        data = JSON.parse(readFileSync(progressPath, "utf-8"));
      } catch {
        return false;
      }
      if (data.stems && Array.isArray(data.stems)) {
        data.stems = data.stems.map((s) => ({
          id: s.id,
          url: `${baseUrl}/api/stems/file/${job_id}/${s.id}.wav`,
          path: s.path,
        }));
      }

      if (redis) {
        const terminal = ["completed", "failed", "cancelled"].includes(data.status);
        const ttl = terminal ? 3600 : 5;
        redis.set(redisKey, JSON.stringify(data), { EX: ttl }).catch(() => {});
      }

      if (!res.writableEnded) {
        try {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch {
          return true;
        }
      }

      const terminal = ["completed", "failed", "cancelled"];
      if (terminal.includes(data.status)) {
        updateJobStatus(job_id, data.status, {
          errorMessage: data.error || undefined,
          modelName: data.model || undefined,
        }).catch(() => {});
        return true;
      }
      return false;
    }

    try {
      const done = await sendProgress();
      if (done) {
        res.end();
        return;
      }
    } catch (err) {
      console.error(`[sse] initial progress failed for ${job_id}:`, err);
      if (!res.writableEnded) res.end();
      return;
    }

    const SSE_POLL_INTERVAL_MS = 500;
    const intervalId = setInterval(async () => {
      try {
        const finished = await sendProgress();
        if (finished) {
          clearInterval(intervalId);
          res.end();
        }
      } catch (err) {
        console.error(`[sse] interval error for ${job_id}:`, err);
        clearInterval(intervalId);
        if (!res.writableEnded) res.end();
      }
    }, SSE_POLL_INTERVAL_MS);

    req.on("close", () => {
      clearInterval(intervalId);
    });
  },
);
