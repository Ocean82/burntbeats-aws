// @ts-check
/**
 * POST /merge — Merge multiple completed MIDI jobs into a single multi-track MIDI file.
 * Produces a MIDI Type 1 file with separate tracks per stem, ready for DAW import.
 */
import { Router } from "express";
import http from "http";

import { authMiddleware } from "../../middleware/auth.js";
import { midiServiceClient, CircuitOpenError } from "../../lib/serviceClients.js";
import { createRedisRateLimiter } from "../../lib/redisRateLimiter.js";
import { createMemoryRateLimitStore } from "../../lib/memoryRateLimitStore.js";
import { getRedis } from "../../lib/redisClient.js";
import {
  MIDI_SERVICE_URL,
  readMidiJobMetadata,
  verifyMidiOwner,
  withMidiServiceAuthHeader,
} from "./shared.js";

export const midiMergeRouter = Router();

// ── Rate limiter: isolated to the merge route ────────────────────────────────
const MIDI_MERGE_WINDOW_MS = 60_000;
const MIDI_MERGE_MAX_REQUESTS = 5;

const midiMergeMemoryStore = createMemoryRateLimitStore({ name: "midi-merge" });
const redisMidiMergeLimiter = createRedisRateLimiter({
  windowMs: MIDI_MERGE_WINDOW_MS,
  maxRequests: MIDI_MERGE_MAX_REQUESTS,
  keyPrefix: "rl:midi-merge",
});

// Prune expired entries every 2 minutes to prevent unbounded memory growth
// when Redis is unavailable and the in-memory store is actively used.
const MIDI_MERGE_PRUNE_INTERVAL_MS = 120_000;
setInterval(() => midiMergeMemoryStore.pruneAll(), MIDI_MERGE_PRUNE_INTERVAL_MS).unref();

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
async function midiMergeRateLimitMiddleware(req, res, next) {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const redis = await getRedis();
    if (redis?.isOpen) {
      const result = await redisMidiMergeLimiter(ip);
      if (!result.allowed) {
        res.set("Retry-After", String(Math.ceil(MIDI_MERGE_WINDOW_MS / 1000)));
        return res.status(429).json({ error: "Too many requests. Please slow down." });
      }
      return next();
    }
    const mem = midiMergeMemoryStore.check(ip, MIDI_MERGE_WINDOW_MS, MIDI_MERGE_MAX_REQUESTS);
    if (!mem.allowed) {
      res.set("Retry-After", String(mem.retryAfterSec));
      return res.status(429).json({ error: "Too many requests. Please slow down." });
    }
    next();
  } catch {
    next(); // fail open on internal error
  }
}

midiMergeRouter.post("/", midiMergeRateLimitMiddleware, authMiddleware, async (req, res) => {
  const { jobs, bpm } = req.body || {};

  if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
    return res.status(400).json({
      error: "Request body must include a non-empty 'jobs' array.",
    });
  }

  if (jobs.length > 10) {
    return res.status(400).json({
      error: "Maximum 10 tracks per merge.",
    });
  }

  // Validate each job entry has at minimum a job_id
  for (const job of jobs) {
    if (!job.job_id || !/^[0-9a-f-]{36}$/i.test(job.job_id)) {
      return res.status(400).json({
        error: `Invalid or missing job_id in merge request: ${job.job_id || "undefined"}`,
      });
    }
  }

  let authenticatedUserId;
  try {
    authenticatedUserId = await verifyMidiOwner(req);
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e && typeof e.status === "number"
        ? e.status
        : 401;
    return res.status(status).json({ error: "Authentication required" });
  }

  for (const job of jobs) {
    const metadata = await readMidiJobMetadata(job.job_id);
    const ownerUserId =
      metadata &&
      typeof metadata.user_id === "string" &&
      metadata.user_id.trim()
        ? metadata.user_id.trim()
        : null;
    if (ownerUserId && ownerUserId !== authenticatedUserId) {
      return res.status(403).json({
        error: `You do not have access to job ${job.job_id}.`,
      });
    }
  }

  try {
    const headers = withMidiServiceAuthHeader({
      "Content-Type": "application/json",
    });

    const correlationId = /** @type {any} */ (req).correlationId;
    if (correlationId) {
      headers["X-Correlation-ID"] = correlationId;
    }
    const sentryTrace = req.get("sentry-trace");
    const baggage = req.get("baggage");
    if (sentryTrace) headers["sentry-trace"] = sentryTrace;
    if (baggage) headers["baggage"] = baggage;

    const payload = JSON.stringify({ jobs, bpm: bpm || 120 });

    if (jobs.length >= 3) {
      const asyncUrl = new URL("/merge/async", MIDI_SERVICE_URL);
      const acceptRes = await fetch(asyncUrl, {
        method: "POST",
        headers,
        body: payload,
      });
      if (!acceptRes.ok) {
        const errText = await acceptRes.text().catch(() => "");
        let errorMsg = "Multi-track merge failed";
        try {
          const parsed = JSON.parse(errText);
          if (parsed.detail) errorMsg = parsed.detail;
        } catch {
          /* default */
        }
        return res.status(acceptRes.status).json({ error: errorMsg });
      }
      const accepted = await acceptRes.json();
      const mergeId = accepted.merge_id;
      if (!mergeId) {
        return res.status(502).json({ error: "MIDI service did not return merge_id" });
      }

      let attempts = 0;
      while (attempts < 120) {
        const statusRes = await fetch(`${MIDI_SERVICE_URL}/merge/status/${mergeId}`, {
          headers: withMidiServiceAuthHeader({
            ...(sentryTrace ? { "sentry-trace": sentryTrace } : {}),
            ...(baggage ? { baggage } : {}),
          }),
        });
        if (!statusRes.ok) {
          return res.status(statusRes.status).json({ error: "Merge status lookup failed" });
        }
        const statusData = await statusRes.json();
        if (statusData.status === "completed") break;
        if (statusData.status === "failed") {
          return res.status(500).json({ error: statusData.error || "Merge job failed" });
        }
        attempts += 1;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (attempts >= 120) {
        return res.status(504).json({ error: "Merge timed out" });
      }

      const fileRes = await fetch(`${MIDI_SERVICE_URL}/merge/file/${mergeId}/multitrack.mid`, {
        headers: withMidiServiceAuthHeader({
          ...(sentryTrace ? { "sentry-trace": sentryTrace } : {}),
          ...(baggage ? { baggage } : {}),
        }),
      });
      if (!fileRes.ok) {
        return res.status(fileRes.status).json({ error: "Merge file not available" });
      }
      const body = Buffer.from(await fileRes.arrayBuffer());
      const trackCount = fileRes.headers.get("x-merge-tracks") || String(jobs.length);
      res.setHeader("Content-Type", "audio/midi");
      res.setHeader("Content-Disposition", 'attachment; filename="multitrack.mid"');
      res.setHeader("X-Merge-Tracks", trackCount);
      return res.send(body);
    }

    const url = new URL("/merge", MIDI_SERVICE_URL);

    const result = await midiServiceClient.breaker.call(() =>
      new Promise((resolve, reject) => {
        const proxyReq = http.request(
          {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: "POST",
            headers: {
              ...headers,
              "Content-Length": Buffer.byteLength(payload),
            },
          },
          (proxyRes) => {
            const chunks = [];
            proxyRes.on("data", (d) => chunks.push(d));
            proxyRes.on("end", () => {
              const body = Buffer.concat(chunks);
              resolve({
                statusCode: proxyRes.statusCode || 500,
                headers: proxyRes.headers,
                body,
              });
            });
            proxyRes.on("error", reject);
          },
        );
        proxyReq.on("error", reject);
        proxyReq.setTimeout(90_000, () => {
          proxyReq.destroy();
          reject(new Error("TimeoutError"));
        });
        proxyReq.write(payload);
        proxyReq.end();
      })
    );

    if (result.statusCode !== 200) {
      // Try to parse error from Python service
      let errorMsg = "Multi-track merge failed";
      try {
        const parsed = JSON.parse(result.body.toString("utf-8"));
        if (parsed.detail) errorMsg = parsed.detail;
      } catch {
        // use default
      }
      return res.status(result.statusCode).json({ error: errorMsg });
    }

    // Stream the MIDI file back to the client
    const trackCount = result.headers["x-merge-tracks"] || "1";
    res.setHeader("Content-Type", "audio/midi");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="multitrack.mid"',
    );
    res.setHeader("X-Merge-Tracks", trackCount);
    return res.send(result.body);
  } catch (e) {
    if (e instanceof CircuitOpenError) {
      res.set("Retry-After", String(e.retryAfter));
      return res.status(503).json({
        error: "Service temporarily unavailable. Try again in 30s.",
      });
    }
    const err = e && typeof e === "object" ? e : { message: String(e) };
    console.error("[POST /api/midi/merge] proxy error:", err.message);

    const message =
      err.message === "TimeoutError"
        ? "MIDI service did not respond in time"
        : "MIDI service unavailable";
    return res.status(502).json({ error: message });
  }
});
