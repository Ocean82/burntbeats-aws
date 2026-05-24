// @ts-check
/**
 * POST /split — Upload audio file and start stem separation job.
 */
import { Router } from "express";
import FormData from "form-data";
import { createReadStream, unlink } from "fs";
import { unlink as unlinkPromise } from "fs/promises";
import path from "path";

import {
  authMiddleware,
  requireUsageAuthPreUpload,
  issueJobToken,
  DEV_BYPASS_UPLOAD_AUTH,
} from "../../middleware/auth.js";
import { proxyFormRequest } from "../../middleware/proxy.js";
import { upload, MAX_UPLOAD_MB } from "../../middleware/upload.js";
import { getBaseUrl } from "../../helpers/baseUrl.js";

import { verifyClerkBearer } from "../../clerkAuth.js";
import {
  computeSplitCost,
  getAudioDurationSeconds,
  isUsageTokensEnabled,
  reserveUsageTokens,
} from "../../usageTokens.js";
import { scanUploadedFile } from "../../malwareScan.js";
import { verifyUploadMatchesExtension } from "../../uploadSniff.js";
import { insertJob, updateJobStatus } from "../../db-jobs.js";

import {
  SPLIT_ACCEPT_TIMEOUT_MS,
  usageErrorResponse,
  handleProxyError,
} from "./shared.js";

export const splitRouter = Router();

splitRouter.post(
  "/",
  authMiddleware,
  requireUsageAuthPreUpload,
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({
            error: `File too large. Maximum size is ${MAX_UPLOAD_MB}MB.`,
          });
        }
        if (err.code === "INVALID_FILE_TYPE") {
          return res.status(415).json({ error: err.message });
        }
        console.error(
          "[POST /api/stems/split] multer error:",
          err.code || err.message,
        );
        return res
          .status(400)
          .json({ error: "Upload failed. Please try again." });
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      const ct = req.get("content-type") || "";
      console.warn(
        "[POST /api/stems/split] 400: no file (field must be 'file'); Content-Type:",
        ct.slice(0, 50),
      );
      return res.status(400).json({
        error: "Missing file. Upload an audio file and use form field 'file'.",
      });
    }
    const filePath = req.file.path;
    const declaredExt =
      path.extname(req.file.originalname || "").toLowerCase() ||
      path.extname(filePath).toLowerCase();
    const sniff = verifyUploadMatchesExtension(filePath, declaredExt);
    if (!sniff.ok) {
      console.warn(
        "[POST /api/stems/split] sniff failed: ext=%s filename=%s message=%s",
        declaredExt,
        req.file?.originalname || "unknown",
        sniff.message,
      );
      await unlinkPromise(filePath).catch(() => {});
      return res.status(415).json({ error: sniff.message });
    }

    const stems = (req.body && req.body.stems) || "4";
    /** @type {string | undefined} */
    const rawQuality = req.body && req.body.quality;
    // Validate stems and quality before proxying to Python service
    if (stems !== "2" && stems !== "4") {
      await unlinkPromise(filePath).catch(() => {});
      return res.status(400).json({ error: "stems must be '2' or '4'" });
    }
    const VALID_QUALITY = new Set(["speed", "balanced", "quality", "ultra"]);
    if (rawQuality && !VALID_QUALITY.has(rawQuality)) {
      await unlinkPromise(filePath).catch(() => {});
      return res.status(400).json({
        error: "quality must be 'speed', 'balanced', 'quality', or 'ultra'",
      });
    }
    const quality = rawQuality;

    const scanResult = await scanUploadedFile(filePath);
    if (!scanResult.ok) {
      await unlinkPromise(filePath).catch(() => {});
      if (scanResult.threat) {
        console.warn(
          "[POST /api/stems/split] malware scan rejected:",
          scanResult.detail,
        );
        return res.status(422).json({
          error:
            "File did not pass security screening. Please use a different audio file.",
        });
      }
      console.error(
        "[POST /api/stems/split] malware scan error:",
        scanResult.detail,
      );
      return res.status(503).json({
        error:
          "Security screening is temporarily unavailable. Please try again later.",
      });
    }

    /** @type {string | null} */
    let usageUserId = null;
    let usageCost = 0;
    let usageReserved = false;
    /** @type {number | null} */
    let durationSeconds = null;
    const isSample = req.body && req.body.sample === "true";

    if (isUsageTokensEnabled() && !DEV_BYPASS_UPLOAD_AUTH && !isSample) {
      try {
        usageUserId =
          /** @type {any} */ (req)._usageUserId ||
          (await verifyClerkBearer(req));
        const durationSec = await getAudioDurationSeconds(filePath);
        durationSeconds = durationSec;
        usageCost = computeSplitCost(durationSec, quality, stems, isSample);
        await reserveUsageTokens(usageUserId, usageCost);
        usageReserved = usageCost > 0;
      } catch (e) {
        await unlinkPromise(filePath).catch(() => {});
        const { status, message } = usageErrorResponse(
          e,
          "[POST /api/stems/split usage]",
          "Unable to verify your account. Please sign in again.",
          "Unable to reserve usage for this upload.",
        );
        return res.status(status).json({ error: message });
      }
    }

    // Stream from disk to Python using form-data pipe
    const form = new FormData();
    form.append("file", createReadStream(filePath), {
      filename: req.file.originalname || "audio.wav",
    });
    form.append("stems", stems);
    if (quality) form.append("quality", quality);
    if (isSample) form.append("sample", "true");

    try {
      const data = await proxyFormRequest("/split", form, {
        timeoutMs: SPLIT_ACCEPT_TIMEOUT_MS,
        correlationId: /** @type {any} */ (req).correlationId,
      });

      if (data.statusCode === 202) {
        const jobId = data.data.job_id;
        // Record job in database (non-blocking, best-effort)
        insertJob({
          jobId,
          clerkUserId: usageUserId,
          stems: Number(stems),
          quality: quality || null,
          isSample: !!isSample,
          originalFilename: req.file?.originalname || null,
          durationSeconds,
          tokenCost: usageCost,
        }).catch((err) => console.error("[split] db insertJob error:", err));
        // Mark as processing immediately (sets started_at)
        updateJobStatus(jobId, "processing").catch(() => {});
        const response = {
          job_id: jobId,
          status: data.data.status ?? "accepted",
        };
        if (process.env.JOB_TOKEN_SECRET)
          response.job_token = issueJobToken(jobId);
        return res.status(202).json(response);
      }
      const baseUrl = getBaseUrl(req);
      const d = data.data;
      d.stems = (d.stems || []).map((s) => ({
        id: s.id,
        url: `${baseUrl}/api/stems/file/${d.job_id}/${s.id}.wav`,
        path: s.path,
      }));
      res.json(d);
    } catch (e) {
      await handleProxyError(e, res, "[POST /api/stems/split]", {
        usageReserved,
        usageUserId,
        usageCost,
      });
    } finally {
      unlink(filePath, (unlinkErr) => {
        if (unlinkErr)
          console.error(
            "[POST /api/stems/split] cleanup temp file:",
            unlinkErr.message,
          );
      });
    }
  },
);
