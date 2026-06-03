// @ts-check
/**
 * GET /status/:jobId — Poll MIDI conversion progress.
 */
import { Router } from "express";
import http from "http";

import { authMiddleware } from "../../middleware/auth.js";
import { requireJobOwnership } from "../../middleware/ownership.js";
import {
  MIDI_SERVICE_URL,
  withMidiServiceAuthHeader,
} from "./shared.js";

export const midiStatusRouter = Router();

midiStatusRouter.get("/:job_id", authMiddleware, requireJobOwnership, async (req, res) => {
  const { job_id: jobId } = req.params;

  if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) {
    return res.status(400).json({ error: "Invalid job_id" });
  }

  try {
    const url = new URL(`/status/${jobId}`, MIDI_SERVICE_URL);
    const headers = withMidiServiceAuthHeader({});

    const data = await new Promise((resolve, reject) => {
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

    return res.status(data.statusCode).json(data.data);
  } catch (e) {
    console.error("[GET /api/midi/status] proxy error:", e?.message || e);
    return res.status(502).json({
      error: "MIDI service unavailable",
    });
  }
});
