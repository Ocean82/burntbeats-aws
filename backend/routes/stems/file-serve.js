// @ts-check
/**
 * GET /file/:job_id/:stemId — Serve stem WAV files (S3 proxy or disk).
 * DELETE /:job_id — Cancel/delete a stem separation job.
 */
import { Router } from "express";
import { createReadStream, existsSync, readFileSync } from "fs";
import path from "path";

import {
  authMiddleware,
  jobTokenMiddleware,
} from "../../middleware/auth.js";
import { requireJobOwnership } from "../../middleware/ownership.js";
import {
  stemFileRateLimitMiddleware,
} from "../../middleware/rateLimiter.js";
import {
  withStemServiceAuthHeader,
  getStemServiceUrl,
} from "../../middleware/proxy.js";
import { UUID_REGEX, validateStemFileParams } from "../../helpers/validation.js";

import { presignStemGetUrl } from "../../s3Presign.js";

import { resolveStemJobPath } from "./shared.js";

export const fileServeRouter = Router();

// ── GET /file/:job_id/:stemId ────────────────────────────────────────────────
fileServeRouter.get(
  "/file/:job_id/:stemId",
  authMiddleware,
  requireJobOwnership,
  stemFileRateLimitMiddleware,
  async (req, res) => {
    const { job_id, stemId } = req.params;
    const validated = validateStemFileParams(job_id, stemId);
    if (!validated.ok) {
      return res.status(400).json({ error: "Invalid job_id or stem id" });
    }
    const stemBase = stemId.replace(/\.wav$/i, "");
    const progressPath = resolveStemJobPath(job_id, "progress.json");
    if (progressPath && existsSync(progressPath)) {
      try {
        const progress = JSON.parse(readFileSync(progressPath, "utf-8"));
        const s3 = progress.s3;
        const key =
          s3 && s3.keys && typeof s3.keys === "object"
            ? s3.keys[stemBase]
            : null;
        if (key && s3.bucket) {
          const url = await presignStemGetUrl(s3.bucket, key, s3.region);
          // Proxy the S3 response instead of redirecting to avoid CORS issues.
          // A 302 redirect causes the browser to make a cross-origin request
          // directly to S3, which fails without S3 bucket CORS configuration.
          try {
            const s3Res = await fetch(url);
            if (!s3Res.ok) {
              console.warn(
                `[GET /api/stems/file] S3 fetch failed: ${s3Res.status}`,
              );
              return res
                .status(s3Res.status)
                .json({ error: "Failed to fetch stem from storage" });
            }
            res.setHeader("Content-Type", "audio/wav");
            const contentLength = s3Res.headers.get("content-length");
            if (contentLength) {
              res.setHeader("Content-Length", contentLength);
            }
            // @ts-ignore — Node 18+ fetch body is a ReadableStream
            const body = /** @type {import("stream").Readable} */ (
              s3Res.body
            );
            const { Readable } = await import("stream");
            Readable.fromWeb(/** @type {any} */ (body)).pipe(res);
            return;
          } catch (proxyErr) {
            console.warn(
              "[GET /api/stems/file] S3 proxy failed, trying disk:",
              proxyErr instanceof Error ? proxyErr.message : proxyErr,
            );
          }
        }
      } catch (e) {
        console.warn(
          "[GET /api/stems/file] S3 presign failed, trying disk:",
          e instanceof Error ? e.message : e,
        );
      }
    }
    const filePath = resolveStemJobPath(job_id, "stems", validated.stemId);
    if (!filePath || !existsSync(filePath)) {
      return res.status(404).json({ error: "Stem file not found" });
    }
    res.setHeader("Content-Type", "audio/wav");
    const stream = createReadStream(filePath);
    stream.on("error", (err) => {
      if (!res.headersSent)
        res.status(500).json({ error: "Failed to read stem file" });
      else res.destroy();
      console.error("[GET /api/stems/file] stream error:", err.message);
    });
    stream.pipe(res);
  },
);

// ── DELETE /:job_id ──────────────────────────────────────────────────────────
fileServeRouter.delete("/:job_id", authMiddleware, requireJobOwnership, async (req, res) => {
  const { job_id } = req.params;
  if (!job_id || !UUID_REGEX.test(job_id)) {
    return res.status(400).json({ error: "Invalid job_id" });
  }
  try {
    const r = await fetch(`${getStemServiceUrl()}/split/${job_id}`, {
      method: "DELETE",
      headers: withStemServiceAuthHeader({}),
    });
    const contentType = r.headers.get("content-type") || "";
    const hasJson = r.ok && contentType.includes("application/json");
    const data = hasJson && r.status !== 204 ? await r.json() : {};
    return res
      .status(r.status)
      .json(Object.keys(data).length ? data : { deleted: true });
  } catch (e) {
    console.error("[DELETE /api/stems/:job_id] proxy error:", e);
    return res.status(502).json({ error: "Stem service unavailable" });
  }
});
