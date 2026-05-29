// @ts-check
/**
 * GET /waveform/:job_id and /spectrum/:job_id — Proxy waveform/spectrum from midi_service.
 */
import { Router } from "express";
import http from "http";

import { authMiddleware, jobTokenMiddleware } from "../../middleware/auth.js";
import {
  MIDI_SERVICE_URL,
  isValidMidiJobId,
  withMidiServiceAuthHeader,
} from "./shared.js";

export const midiWaveformRouter = Router();

/**
 * @param {string} pathname
 * @param {Record<string, string>} headers
 * @param {number} timeoutMs
 */
function proxyMidiServiceGet(pathname, headers, timeoutMs = 15_000) {
  const url = new URL(pathname, MIDI_SERVICE_URL);
  return new Promise((resolve, reject) => {
    const proxyReq = http.get(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
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
    proxyReq.setTimeout(timeoutMs, () => {
      proxyReq.destroy();
      reject(new Error("TimeoutError"));
    });
  });
}

midiWaveformRouter.get(
  "/:job_id",
  authMiddleware,
  jobTokenMiddleware,
  async (req, res) => {
    const { job_id: jobId } = req.params;
    if (!isValidMidiJobId(jobId)) {
      return res.status(400).json({ error: "Invalid job_id" });
    }

    const points = req.query.points ? String(req.query.points) : "512";
    try {
      const headers = withMidiServiceAuthHeader({});
      const data = await proxyMidiServiceGet(
        `/waveform/${jobId}?points=${encodeURIComponent(points)}`,
        headers,
      );
      return res.status(data.statusCode).json(data.data);
    } catch (e) {
      console.error("[GET /api/midi/waveform] proxy error:", e?.message || e);
      return res.status(502).json({ error: "MIDI service unavailable" });
    }
  },
);

export const midiSpectrumRouter = Router();

midiSpectrumRouter.get(
  "/:job_id",
  authMiddleware,
  jobTokenMiddleware,
  async (req, res) => {
    const { job_id: jobId } = req.params;
    if (!isValidMidiJobId(jobId)) {
      return res.status(400).json({ error: "Invalid job_id" });
    }

    const fftSize = req.query.fft_size ? String(req.query.fft_size) : "2048";
    try {
      const headers = withMidiServiceAuthHeader({});
      const data = await proxyMidiServiceGet(
        `/spectrum/${jobId}?fft_size=${encodeURIComponent(fftSize)}`,
        headers,
      );
      return res.status(data.statusCode).json(data.data);
    } catch (e) {
      console.error("[GET /api/midi/spectrum] proxy error:", e?.message || e);
      return res.status(502).json({ error: "MIDI service unavailable" });
    }
  },
);
