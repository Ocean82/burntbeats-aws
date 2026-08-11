// @ts-check
/**
 * GET /status/:job_id — Poll job progress.
 * GET /status/:job_id/stream — SSE stream for real-time progress updates.
 */
import { Router } from "express";
import { existsSync, readFileSync } from "fs";

import {
  authMiddleware,
  jobTokenMiddleware,
} from "../../middleware/auth.js";
import { requireJobOwnership } from "../../middleware/ownership.js";
import { UUID_REGEX } from "../../helpers/validation.js";
import { getBaseUrl } from "../../helpers/baseUrl.js";
import { updateJobStatus, insertStems, transitionToTerminal } from "../../db-jobs.js";
import { getRedis } from "../../stripeRedis.js";

import { writeSseJson } from "../../helpers/sse.js";
import { publicErrorMessage } from "../../clientSafeError.js";

import { resolveStemJobPath } from "./shared.js";
import { refundUsageTokens } from "../../usageTokens.js";
import { sendStemCompletionEmail } from "../../email/stemNotifications.js";

/**
 * Client-safe progress payload: JSON only (no HTML). Strips internal paths and
 * sanitizes error text that may originate from upstream workers.
 * @param {Record<string, unknown>} data
 * @param {string} job_id
 * @param {string} baseUrl
 */
function prepareJobProgressResponse(data, job_id, baseUrl) {
  const out = { ...data };
  if (typeof out.error === "string") {
    out.error = publicErrorMessage(
      out.error,
      "Job failed. Please try again.",
      `[stems status ${job_id}]`,
    );
  }
  if (out.stems && Array.isArray(out.stems)) {
    out.stems = out.stems.map((s) => ({
      id: s.id,
      url: `${baseUrl}/api/stems/file/${job_id}/${s.id}.wav`,
    }));
  }
  return out;
}

const TERMINAL_STATUSES = ["completed", "failed", "cancelled"];

/**
 * @param {unknown} status
 * @returns {boolean}
 */
function isTerminalStemStatus(status) {
  return typeof status === "string" && TERMINAL_STATUSES.includes(status);
}

/**
 * Terminal statuses are cacheable only after the DB terminal transition succeeds.
 * Otherwise a transient DB failure could cache the terminal payload and bypass
 * the only polling path that triggers refunds, stem inserts, and notifications.
 * @param {unknown} status
 * @param {boolean} terminalTransitioned
 * @param {number} [activeTtl]
 * @returns {number | null}
 */
export function getStatusCacheTtl(status, terminalTransitioned, activeTtl = 2) {
  if (!isTerminalStemStatus(status)) return activeTtl;
  return terminalTransitioned ? 3600 : null;
}

/**
 * @param {Awaited<ReturnType<typeof getRedis>> | null} redis
 * @param {string} redisKey
 * @param {Record<string, unknown>} data
 * @param {Record<string, unknown>} clientData
 * @param {boolean} terminalTransitioned
 * @param {number} [activeTtl]
 */
async function cacheJobStatus(redis, redisKey, data, clientData, terminalTransitioned, activeTtl = 2) {
  if (!redis) return;
  const ttl = getStatusCacheTtl(data.status, terminalTransitioned, activeTtl);
  if (ttl == null) return;
  try {
    await redis.set(redisKey, JSON.stringify(clientData), { EX: ttl });
  } catch {
    /* ignore cache write error */
  }
}

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
    const progressPath = resolveStemJobPath(job_id, "progress.json");
    if (!progressPath || !existsSync(progressPath)) {
      return res.status(404).json({ error: "Job not found" });
    }
    let data;
    try {
      data = JSON.parse(readFileSync(progressPath, "utf-8"));
    } catch {
      return res.status(404).json({ error: "Job not found" });
    }
    const baseUrl = getBaseUrl(req);
    const clientData = prepareJobProgressResponse(data, job_id, baseUrl);

    // Update DB job status on terminal states (best-effort, non-blocking)
    let terminalTransitioned = false;
    if (isTerminalStemStatus(data.status)) {
      // Atomically transition to terminal — only succeeds for the FIRST caller.
      // This prevents duplicate refunds, duplicate emails, and duplicate stem inserts
      // when the status endpoint is polled repeatedly.
      const transitioned = await transitionToTerminal(job_id, data.status, {
        errorMessage: data.error || undefined,
        modelName: data.model || undefined,
      }).catch(() => null);

      if (transitioned) {
        terminalTransitioned = true;
        // First caller: run one-time actions (refund on failure, insert stems, send email)
        if ((data.status === "failed" || data.status === "cancelled") && !transitioned.is_sample) {
          const cost = Number(transitioned.token_cost) || 0;
          if (cost > 0 && transitioned.clerk_user_id) {
            refundUsageTokens(transitioned.clerk_user_id, cost, { jobId: job_id, reason: `job_${data.status}` })
              .catch((err) => console.error(`[status] refund for ${job_id} failed:`, err.message));
            console.log(`[status] Refunded ${cost} tokens to ${transitioned.clerk_user_id} for ${data.status} job ${job_id}`);
          }
        }
        if (data.status === "completed" && data.stems && Array.isArray(data.stems)) {
          const s3Meta = data.s3;
          const stemRecords = data.stems.map((s) => ({
            stemName: s.id,
            s3Key: s3Meta && s3Meta.keys ? s3Meta.keys[s.id] || null : null,
            fileSizeBytes: null,
          }));
          insertStems(job_id, stemRecords).catch(() => {});
        }
        sendStemCompletionEmail(job_id).catch(() => {});
      }
    } else if (data.status === "processing") {
      updateJobStatus(job_id, "processing").catch(() => {});
    }
    await cacheJobStatus(redis, redisKey, data, clientData, terminalTransitioned);
    res.json(clientData);
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

    const progressPath = resolveStemJobPath(job_id, "progress.json");
    if (!progressPath || !existsSync(progressPath)) {
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
      const clientData = prepareJobProgressResponse(data, job_id, baseUrl);

      if (!res.writableEnded) {
        try {
          writeSseJson(res, clientData);
        } catch {
          return true;
        }
      }

      let terminalTransitioned = false;
      if (isTerminalStemStatus(data.status)) {
        const transitioned = await transitionToTerminal(job_id, data.status, {
          errorMessage: data.error || undefined,
          modelName: data.model || undefined,
        }).catch(() => null);

        if (transitioned) {
          terminalTransitioned = true;
          if ((data.status === "failed" || data.status === "cancelled") && !transitioned.is_sample) {
            const cost = Number(transitioned.token_cost) || 0;
            if (cost > 0 && transitioned.clerk_user_id) {
              refundUsageTokens(transitioned.clerk_user_id, cost, { jobId: job_id, reason: `job_${data.status}` })
                .catch((err) => console.error(`[sse] refund for ${job_id} failed:`, err.message));
            }
          }
          if (data.status === "completed" && data.stems && Array.isArray(data.stems)) {
            const s3Meta = data.s3;
            const stemRecords = data.stems.map((s) => ({
              stemName: s.id,
              s3Key: s3Meta?.keys?.[s.id] || null,
              fileSizeBytes: null,
            }));
            insertStems(job_id, stemRecords).catch(() => {});
          }
          sendStemCompletionEmail(job_id).catch(() => {});
        }
        await cacheJobStatus(redis, redisKey, data, clientData, terminalTransitioned, 5);
        return true;
      }
      await cacheJobStatus(redis, redisKey, data, clientData, false, 5);
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
