// @ts-check
/**
 * POST /split — Upload audio file and start stem separation job.
 */
import { Router } from "express";
import FormData from "form-data";
import { createReadStream, unlink } from "fs";
import { unlink as unlinkPromise, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

import {
  authMiddleware,
  requireUsageAuthPreUpload,
  issueJobToken,
  DEV_BYPASS_UPLOAD_AUTH,
} from "../../middleware/auth.js";
// ... (rest of imports)
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
import { parseSplitRequestBody } from "../../helpers/splitIntent.js";
import {
  isPremiumSplitRequest,
  requireSplitEntitlements,
} from "./entitlements.js";

export const splitRouter = Router();

splitRouter.post(
  "/",
  authMiddleware,
  requireUsageAuthPreUpload,
  async (req, res, next) => {
    // If user provides s3_key, skip multer and handle as JSON/body
    if (req.body?.s3_key || req.query?.s3_key) {
      return next();
    }
    // Otherwise, handle as traditional file upload
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
    let filePath = req.file?.path || "";
    let s3Key = req.body?.s3_key || req.query?.s3_key;
    let originalFilename = req.file?.originalname || req.body?.filename || "audio.wav";

    // If s3_key provided, download it to temp disk for processing
    if (s3Key && !filePath) {
      const bucket = process.env.S3_UPLOAD_BUCKET;
      if (!bucket) return res.status(501).json({ error: "S3 processing not configured" });
      
      const tmpPath = path.join(path.dirname(STEM_OUTPUT_DIR), "burntbeats-upload", `s3-${randomUUID()}-${path.basename(s3Key)}`);
      try {
        const s3 = new S3Client({ region: process.env.S3_REGION || "us-east-1" });
        const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: s3Key }));
        if (!obj.Body) throw new Error("Empty S3 body");
        // @ts-expect-error stream type
        const buffer = await obj.Body.transformToByteArray();
        await writeFile(tmpPath, buffer);
        filePath = tmpPath;
      } catch (err) {
        console.error("[split] S3 download failed:", err.message);
        return res.status(400).json({ error: "Failed to retrieve file from S3 storage" });
      }
    }

    if (!filePath) {
      return res.status(400).json({
        error: "Missing file or s3_key. Upload an audio file or provide S3 reference.",
      });
    }
    const declaredExt =
      path.extname(originalFilename).toLowerCase() ||
      path.extname(filePath).toLowerCase();
    const sniff = verifyUploadMatchesExtension(filePath, declaredExt);
    if (!sniff.ok) {
      console.warn(
        "[POST /api/stems/split] sniff failed: ext=%s filename=%s message=%s",
        declaredExt,
        originalFilename,
        sniff.message,
      );
      await unlinkPromise(filePath).catch(() => {});
      return res.status(415).json({ error: sniff.message });
    }

    const parsed = parseSplitRequestBody(
      /** @type {Record<string, unknown> | undefined} */ (req.body),
    );
    if (parsed.error) {
      await unlinkPromise(filePath).catch(() => {});
      return res.status(400).json({ error: parsed.error });
    }
    const { intent, stems, quality, intentJson } = parsed;
    if (!intent) {
      if (stems !== "2" && stems !== "4") {
        await unlinkPromise(filePath).catch(() => {});
        return res.status(400).json({ error: "stems must be '2' or '4'" });
      }
      const VALID_QUALITY = new Set(["speed", "quality"]);
      if (quality && !VALID_QUALITY.has(quality)) {
        await unlinkPromise(filePath).catch(() => {});
        return res.status(400).json({
          error: "quality must be 'speed' or 'quality'",
        });
      }
    }
    /** @type {string | null} */
    let entitlementUserId = null;
    if (isPremiumSplitRequest(stems, quality, intent)) {
      const entitlementCheck = await requireSplitEntitlements(req, {
        stems,
        quality,
      });
      if (!entitlementCheck.ok) {
        await unlinkPromise(filePath).catch(() => {});
        return res
          .status(entitlementCheck.status)
          .json({ error: entitlementCheck.error });
      }
      entitlementUserId = entitlementCheck.userId;
    }

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
          entitlementUserId ||
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
      filename: originalFilename,
    });
    form.append("stems", stems);
    if (quality) form.append("quality", quality);
    if (intentJson) form.append("intent", intentJson);
    if (isSample) form.append("sample", "true");

    try {
      const data = await proxyFormRequest("/split", form, {
        timeoutMs: SPLIT_ACCEPT_TIMEOUT_MS,
        correlationId: /** @type {any} */ (req).correlationId,
      });

      if (data.statusCode === 202) {
        const jobId = data.data.job_id;
        // Record job in database (blocking, ensure persistence)
        try {
          await insertJob({
            jobId,
            clerkUserId: usageUserId,
            stems: Number(stems),
            quality: quality || null,
            isSample: !!isSample,
            originalFilename: originalFilename,
            durationSeconds,
            tokenCost: usageCost,
            splitIntent: intent ?? null,
          });
        } catch (dbErr) {
          console.error("[split] critical: failed to persist job to DB:", dbErr.message);
          // If we reserved tokens but failed to record the job, we have a ledger mismatch.
          // In a high-resilience system we might want to trigger a compensating refund here.
        }

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
