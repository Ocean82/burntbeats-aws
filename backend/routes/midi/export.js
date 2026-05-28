// @ts-check
/**
 * /export routes — enqueue, poll, and download MIDI export artifacts.
 */
import { Router } from "express";
import http from "http";

import { authMiddleware, jobTokenMiddleware, issueJobToken } from "../../middleware/auth.js";
import { getBaseUrl } from "../../helpers/baseUrl.js";
import {
  MIDI_SERVICE_URL,
  withMidiServiceAuthHeader,
} from "./shared.js";

export const midiExportRouter = Router();

function isValidId(id) {
  return !!id && /^[0-9a-f-]{36}$/i.test(id);
}

midiExportRouter.post("/", authMiddleware, async (req, res) => {
  const payload = JSON.stringify(req.body || {});
  try {
    const url = new URL("/export", MIDI_SERVICE_URL);
    const headers = withMidiServiceAuthHeader({
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(payload)),
    });
    const result = await new Promise((resolve, reject) => {
      const proxyReq = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: "POST",
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
      proxyReq.setTimeout(30_000, () => {
        proxyReq.destroy();
        reject(new Error("TimeoutError"));
      });
      proxyReq.write(payload);
      proxyReq.end();
    });

    if (result.statusCode !== 202 || !isValidId(result.data?.export_id)) {
      return res.status(502).json({ error: "MIDI service did not accept export job" });
    }

    const exportId = result.data.export_id;
    const exportToken = issueJobToken(exportId);
    const baseUrl = getBaseUrl(req);
    return res.status(202).json({
      export_id: exportId,
      status: result.data?.status || "queued",
      export_token: exportToken,
      status_url: `${baseUrl}/api/midi/export/status/${exportId}`,
      archive_url: `${baseUrl}/api/midi/export/file/${exportId}/stems.zip`,
    });
  } catch (e) {
    const message = e?.message === "TimeoutError" ? "MIDI service did not respond in time" : "MIDI service unavailable";
    return res.status(502).json({ error: message });
  }
});

midiExportRouter.get("/status/:job_id", authMiddleware, jobTokenMiddleware, async (req, res) => {
  const exportId = req.params.job_id;
  if (!isValidId(exportId)) {
    return res.status(400).json({ error: "Invalid export_id" });
  }

  try {
    const url = new URL(`/export/status/${exportId}`, MIDI_SERVICE_URL);
    const headers = withMidiServiceAuthHeader({});
    const result = await new Promise((resolve, reject) => {
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
              resolve({ statusCode: proxyRes.statusCode || 500, data: JSON.parse(body) });
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
    return res.status(result.statusCode).json(result.data);
  } catch {
    return res.status(502).json({ error: "MIDI service unavailable" });
  }
});

midiExportRouter.get("/file/:job_id/:filename", authMiddleware, jobTokenMiddleware, async (req, res) => {
  const exportId = req.params.job_id;
  const { filename } = req.params;
  if (!isValidId(exportId)) {
    return res.status(400).json({ error: "Invalid export_id" });
  }
  if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("\0")) {
    return res.status(400).json({ error: "Invalid filename" });
  }

  try {
    const url = new URL(`/export/file/${exportId}/${encodeURIComponent(filename)}`, MIDI_SERVICE_URL);
    const headers = withMidiServiceAuthHeader({});
    const result = await new Promise((resolve, reject) => {
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
          proxyRes.on("end", () =>
            resolve({
              statusCode: proxyRes.statusCode || 500,
              headers: proxyRes.headers,
              body: Buffer.concat(chunks),
            }),
          );
          proxyRes.on("error", reject);
        },
      );
      proxyReq.on("error", reject);
      proxyReq.setTimeout(20_000, () => {
        proxyReq.destroy();
        reject(new Error("TimeoutError"));
      });
    });

    if (result.statusCode !== 200) {
      let error = "Export file unavailable";
      try {
        const parsed = JSON.parse(result.body.toString("utf-8"));
        error = parsed.detail || parsed.error || error;
      } catch {
        // keep default
      }
      return res.status(result.statusCode).json({ error });
    }

    const contentType = result.headers["content-type"] || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(result.body);
  } catch (e) {
    const message = e?.message === "TimeoutError" ? "MIDI service did not respond in time" : "MIDI service unavailable";
    return res.status(502).json({ error: message });
  }
});
