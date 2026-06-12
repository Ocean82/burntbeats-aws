// @ts-check
import { Router } from "express";
import FormData from "form-data";
import { createReadStream, unlink } from "fs";
import { unlink as unlinkPromise } from "fs/promises";
import path from "path";

import {
  authMiddleware,
  requireUsageAuthPreUpload,
  issueJobToken,
} from "../../middleware/auth.js";
import { getPool } from "../../db.js";
import { insertJob } from "../../db-jobs.js";
import { proxySpeechFormRequest } from "../../middleware/proxy.js";
import { speechServiceClient, CircuitOpenError } from "../../lib/serviceClients.js";
import { upload, MAX_UPLOAD_MB } from "../../middleware/upload.js";
import { getBaseUrl } from "../../helpers/baseUrl.js";
import { scanUploadedFile } from "../../malwareScan.js";
import { verifyUploadMatchesExtension } from "../../uploadSniff.js";
import {
  computeSplitCost,
  getAudioDurationSeconds,
  isUsageTokensEnabled,
  reserveUsageTokens,
} from "../../usageTokens.js";
import { isProxyHttpError } from "../../middleware/proxy.js";
import { publicErrorMessage, sanitizedProxyClientError } from "../../clientSafeError.js";

import { SPEECH_ACCEPT_TIMEOUT_MS, SPEECH_MAX_UPLOAD_BYTES } from "./shared.js";

export const enhanceRouter = Router();

enhanceRouter.post(
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
        return res.status(400).json({ error: "Upload failed. Please try again." });
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: "Missing file. Upload speech audio with form field 'file'.",
      });
    }

    if (req.file.size > SPEECH_MAX_UPLOAD_BYTES) {
      const mb = Math.round(SPEECH_MAX_UPLOAD_BYTES / (1024 * 1024));
      return res.status(413).json({
        error: `File too large for speech enhancement. Maximum size is ${mb}MB.`,
      });
    }

    const filePath = req.file.path;
    let usageReserved = false;
    let usageUserId = null;
    let usageCost = 0;

    try {
      const declaredExt =
        path.extname(req.file.originalname || "").toLowerCase() ||
        path.extname(filePath).toLowerCase();
      const sniff = verifyUploadMatchesExtension(filePath, declaredExt);
      if (!sniff.ok) {
        return res.status(415).json({ error: sniff.message || "Invalid audio file" });
      }

      const scanResult = await scanUploadedFile(filePath);
      if (!scanResult.ok) {
        if (scanResult.threat) {
          return res.status(422).json({
            error: "File did not pass security screening. Please use a different audio file.",
          });
        }
        return res.status(503).json({
          error: "Security screening is temporarily unavailable. Please try again later.",
        });
      }

      if (isUsageTokensEnabled()) {
        usageUserId = /** @type {any} */ (req)._usageUserId || null;
        const durationSec = await getAudioDurationSeconds(filePath);
        usageCost = computeSplitCost(durationSec);
        if (usageUserId && usageCost > 0) {
          await reserveUsageTokens(usageUserId, usageCost);
          usageReserved = true;
        }
      }

      const denoise = (req.body?.denoise ?? "true").toString().toLowerCase();
      const batch = (req.body?.batch ?? "false").toString().toLowerCase();

      const form = new FormData();
      form.append("file", createReadStream(filePath), {
        filename: req.file.originalname || path.basename(filePath),
      });
      form.append("denoise", denoise);
      form.append("batch", batch);

      const { statusCode, data } = await speechServiceClient.breaker.call(() =>
        proxySpeechFormRequest("/enhance", form, {
          timeoutMs: SPEECH_ACCEPT_TIMEOUT_MS,
          correlationId: /** @type {any} */ (req).correlationId,
        })
      );

      if (statusCode !== 202 || !data?.job_id) {
        return res.status(502).json({ error: "Speech service did not accept the job" });
      }

      const jobId = data.job_id;
      const mustPersistOwner = Boolean(usageUserId && getPool());
      try {
        await insertJob({
          jobId,
          clerkUserId: usageUserId,
          stems: 0,
          quality: null,
          isSample: false,
          originalFilename: req.file.originalname || null,
          durationSeconds: null,
          tokenCost: usageCost,
          splitIntent: null,
        });
      } catch (dbErr) {
        console.error(
          mustPersistOwner
            ? "[speech/enhance] critical: failed to persist job to DB:"
            : "[speech/enhance] failed to persist job to DB:",
          dbErr instanceof Error ? dbErr.message : dbErr,
        );
        if (mustPersistOwner) {
          if (usageReserved && usageUserId && usageCost > 0) {
            try {
              const { refundUsageTokens } = await import("../../usageTokens.js");
              await refundUsageTokens(usageUserId, usageCost);
            } catch {
              /* ignore refund errors */
            }
          }
          return res.status(502).json({
            error: "Could not record your job. Please try again.",
          });
        }
      }

      const baseUrl = getBaseUrl(req);
      const response = {
        job_id: jobId,
        status: data.status || "queued",
        output_url: `${baseUrl}/api/speech/file/${jobId}/enhanced.wav`,
        status_url: `${baseUrl}/api/speech/status/${jobId}`,
      };
      if (process.env.JOB_TOKEN_SECRET) {
        response.job_token = issueJobToken(jobId);
      }
      return res.status(202).json(response);
    } catch (e) {
      if (usageReserved && usageUserId && usageCost > 0) {
        try {
          const { refundUsageTokens } = await import("../../usageTokens.js");
          await refundUsageTokens(usageUserId, usageCost);
        } catch {
          /* ignore refund errors */
        }
      }
      if (e instanceof CircuitOpenError) {
        res.set("Retry-After", String(e.retryAfter));
        return res.status(503).json({
          error: "Service temporarily unavailable. Try again in 30s.",
        });
      }
      if (isProxyHttpError(e)) {
        return res
          .status(e.statusCode)
          .json({ error: sanitizedProxyClientError(e.statusCode, e.error) });
      }
      const message = publicErrorMessage(
        e instanceof Error ? e.message : String(e),
        "Speech service unavailable (ensure speech_service runs on port 5001)",
        "[POST /api/speech/enhance]",
      );
      return res.status(502).json({ error: message });
    } finally {
      try {
        await unlinkPromise(filePath);
      } catch {
        unlink(filePath, () => {});
      }
    }
  },
);
