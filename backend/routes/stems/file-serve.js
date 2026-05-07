// @ts-check
/**
 * GET /file/:job_id/:stemId — Serve stem WAV files (S3 presign or disk).
 * DELETE /:job_id — Cancel/delete a stem separation job.
 */
import { Router } from "express";
import { createReadStream, existsSync, readFileSync } from "fs";
import path from "path";

import {
  authMiddleware,
  jobTokenMiddleware,
} from "../../middleware/auth.js";
import {
  stemFileRateLimitMiddleware,
} from "../../middleware/rateLimiter.js";
import {
  withStemServiceAuthHeader,
  getStemServiceUrl,
} from "../../middleware/proxy.js";
import { UUID_REGEX, validateStemFileParams } from "../../helpers/validation.js";

import { presignStemGetUrl } from "../../s3Presign.js";

import { STEM_OUTPUT_DIR } from "./shared.js";

export const fileServeRouter = Router();

// ── GET /file/:job_id/:stemId ────────────────────────────────────────────────
fileServeRouter.get(
  "/file/:job_id/:stemId",
  authMiddleware,
  jobTokenMiddleware,
  stemFileRateLimitMiddleware,
  async (req, res) => {
    const { job_id, stemId } = req.params;
    const validated = validateStemFileParams(job_id, stemId);
    if (!validated.ok) {
      return res.status(400).json({ error: "Invalid job_id or stem id" });
    }
    const stemBase = stemId.replace(/\.wav$/i, "");
    const progressPath = path.join(STEM_OUTPUT_DIR, job_id, "progress.json");
    if (existsSync(progressPath)) {
      try {
        const progress = JSON.parse(readFileSync(progressPath, "utf-8"));
        const s3 = progress.s3;
        const key =
          s3 && s3.keys && typeof s3.keys === "object"
            ? s3.keys[stemBase]
            : null;
        if (key && s3.bucket) {
          const url = await presignStemGetUrl(s3.bucket, key, s3.region);
          return res.redirect(302, url);
        }
      } catch (e) {
        console.warn(
          "[GET /api/stems/file] S3 presign failed, trying disk:",
          e instanceof Error ? e.message : e,
        );
      }
    }
    const filePath = path.join(
      STEM_OUTPUT_DIR,
      job_id,
      "stems",
      validated.stemId,
    );
    if (!existsSync(filePath)) {
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
fileServeRouter.delete("/:job_id", authMiddleware, async (req, res) => {
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
