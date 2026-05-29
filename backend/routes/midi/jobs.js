// @ts-check
/**
 * DELETE /jobs/:job_id — Cancel a MIDI conversion job (proxy to midi_service).
 */
import { Router } from "express";
import http from "http";

import { authMiddleware, jobTokenMiddleware } from "../../middleware/auth.js";
import {
  MIDI_SERVICE_URL,
  isValidMidiJobId,
  withMidiServiceAuthHeader,
} from "./shared.js";

export const midiJobsRouter = Router();

/**
 * @param {string} jobId
 * @param {Record<string, string>} headers
 */
function proxyMidiServiceDelete(jobId, headers) {
  const url = new URL(`/jobs/${jobId}`, MIDI_SERVICE_URL);
  return new Promise((resolve, reject) => {
    const proxyReq = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "DELETE",
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
              data: body ? JSON.parse(body) : {},
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
    proxyReq.end();
  });
}

midiJobsRouter.delete(
  "/:job_id",
  authMiddleware,
  jobTokenMiddleware,
  async (req, res) => {
    const { job_id: jobId } = req.params;

    if (!isValidMidiJobId(jobId)) {
      return res.status(400).json({ error: "Invalid job_id" });
    }

    try {
      const headers = withMidiServiceAuthHeader({});
      const data = await proxyMidiServiceDelete(jobId, headers);
      return res.status(data.statusCode).json(data.data);
    } catch (e) {
      console.error("[DELETE /api/midi/jobs] proxy error:", e?.message || e);
      return res.status(502).json({
        error: "MIDI service unavailable",
      });
    }
  },
);
