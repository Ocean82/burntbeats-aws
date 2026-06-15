// @ts-check
/**
 * GET /status/:jobId — Poll MIDI conversion progress.
 * GET /status/:job_id/stream — SSE stream for real-time progress.
 */
import { Router } from "express";
import http from "http";
import { existsSync, readFileSync } from "fs";

import { authMiddleware } from "../../middleware/auth.js";
import { requireJobOwnership } from "../../middleware/ownership.js";
import { writeSseJson } from "../../helpers/sse.js";
import {
  MIDI_OUTPUT_DIR,
  MIDI_SERVICE_URL,
  resolveMidiJobPath,
  withMidiServiceAuthHeader,
} from "./shared.js";

export const midiStatusRouter = Router();

async function proxyMidiStatus(jobId) {
  const url = new URL(`/status/${jobId}`, MIDI_SERVICE_URL);
  const headers = withMidiServiceAuthHeader({});

  return new Promise((resolve, reject) => {
    const proxyReq = http.get(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        headers,
      },
      (proxyRes) => {
        const chunks = [];
        proxyRes.on("data", (d) => chunks.push(d));
        proxyRes.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf-8");
          try {
            resolve({
              statusCode: proxyRes.statusCode || 500,
              data: JSON.parse(body),
            });
          } catch {
            reject(new Error("Invalid JSON from MIDI service"));
          }
        });
        proxyRes.on("error", reject);
      },
    );
    proxyReq.on("error", reject);
    proxyReq.setTimeout(10_000, () => {
      proxyReq.destroy();
      reject(new Error("TimeoutError"));
    });
  });
}

midiStatusRouter.get("/:job_id", authMiddleware, requireJobOwnership, async (req, res) => {
  const { job_id: jobId } = req.params;

  if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) {
    return res.status(400).json({ error: "Invalid job_id" });
  }

  try {
    const data = await proxyMidiStatus(jobId);
    return res.status(data.statusCode).json(data.data);
  } catch (e) {
    console.error("[GET /api/midi/status] proxy error:", e?.message || e);
    return res.status(502).json({
      error: "MIDI service unavailable",
    });
  }
});

midiStatusRouter.get(
  "/:job_id/stream",
  authMiddleware,
  requireJobOwnership,
  async (req, res) => {
    const { job_id: jobId } = req.params;
    if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) {
      return res.status(400).json({ error: "Invalid job_id" });
    }

    const progressPath = resolveMidiJobPath(jobId, "progress.json");
    if (!progressPath || !existsSync(progressPath)) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    async function sendProgress() {
      let data;
      try {
        if (progressPath && existsSync(progressPath)) {
          data = JSON.parse(readFileSync(progressPath, "utf-8"));
        } else {
          const proxied = await proxyMidiStatus(jobId);
          if (proxied.statusCode >= 400) return false;
          data = proxied.data;
        }
      } catch {
        return false;
      }

      if (!res.writableEnded) {
        try {
          writeSseJson(res, data);
        } catch {
          return true;
        }
      }

      const terminal = ["completed", "failed", "cancelled"];
      return terminal.includes(data.status);
    }

    try {
      const done = await sendProgress();
      if (done) {
        res.end();
        return;
      }
    } catch (err) {
      console.error(`[midi-sse] initial progress failed for ${jobId}:`, err);
      if (!res.writableEnded) res.end();
      return;
    }

    const intervalId = setInterval(async () => {
      try {
        const finished = await sendProgress();
        if (finished) {
          clearInterval(intervalId);
          res.end();
        }
      } catch (err) {
        console.error(`[midi-sse] interval error for ${jobId}:`, err);
        clearInterval(intervalId);
        if (!res.writableEnded) res.end();
      }
    }, 500);

    req.on("close", () => {
      clearInterval(intervalId);
    });
  },
);
