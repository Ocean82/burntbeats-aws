// @ts-check
/**
 * POST /merge — Merge multiple completed MIDI jobs into a single multi-track MIDI file.
 * Produces a MIDI Type 1 file with separate tracks per stem, ready for DAW import.
 */
import { Router } from "express";
import http from "http";

import { authMiddleware } from "../../middleware/auth.js";
import {
  MIDI_SERVICE_URL,
  withMidiServiceAuthHeader,
} from "./shared.js";

export const midiMergeRouter = Router();

midiMergeRouter.post("/", authMiddleware, async (req, res) => {
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

  try {
    const url = new URL("/merge", MIDI_SERVICE_URL);
    const headers = withMidiServiceAuthHeader({
      "Content-Type": "application/json",
    });

    // Forward correlation ID for distributed tracing
    const correlationId = /** @type {any} */ (req).correlationId;
    if (correlationId) {
      headers["X-Correlation-ID"] = correlationId;
    }

    const payload = JSON.stringify({ jobs, bpm: bpm || 120 });

    const result = await new Promise((resolve, reject) => {
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
      proxyReq.setTimeout(30_000, () => {
        proxyReq.destroy();
        reject(new Error("TimeoutError"));
      });
      proxyReq.write(payload);
      proxyReq.end();
    });

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
    const err = e && typeof e === "object" ? e : { message: String(e) };
    console.error("[POST /api/midi/merge] proxy error:", err.message);

    const message =
      err.message === "TimeoutError"
        ? "MIDI service did not respond in time"
        : "MIDI service unavailable";
    return res.status(502).json({ error: message });
  }
});
