// @ts-check
/**
 * POST /convert — Upload audio file (or reference a stem) and start MIDI conversion.
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
  validateJobTokenForRequest,
} from "../../middleware/auth.js";
import { getJobOwner } from "../../middleware/ownership.js";
import { proxyFormRequestTo } from "../../middleware/proxy.js";
import { upload, MAX_UPLOAD_MB } from "../../middleware/upload.js";
import { getBaseUrl } from "../../helpers/baseUrl.js";
import { scanUploadedFile } from "../../malwareScan.js";
import { verifyUploadMatchesExtension } from "../../uploadSniff.js";
import { verifyClerkBearer } from "../../clerkAuth.js";
import {
  isUsageTokensEnabled,
  reserveUsageTokens,
} from "../../usageTokens.js";
import { getPool } from "../../db.js";
import { insertJob } from "../../db-jobs.js";

import {
  MIDI_ACCEPT_TIMEOUT_MS,
  MIDI_MAX_UPLOAD_BYTES,
  MIDI_SERVICE_URL,
  MIDI_TOKEN_COST,
  withMidiServiceAuthHeader,
  handleMidiProxyError,
} from "./shared.js";
import { midiServiceClient, CircuitOpenError } from "../../lib/serviceClients.js";
import {
  cleanupTempStemFile,
  resolveStemAudioPath,
} from "../../helpers/resolveStemAudio.js";
import { refundReservedMidiUsage } from "./refunds.js";

export const midiConvertRouter = Router();

const MIDI_ALLOWED_UPLOAD_EXTS = new Set([
  ".mp3",
  ".wav",
  ".flac",
  ".ogg",
  ".m4a",
  ".webm",
]);
const MIDI_ALLOWED_UPLOAD_FORMATS_LABEL = "MP3, WAV, FLAC, OGG, M4A, WebM";

/**
 * @param {string} message
 * @param {number} status
 * @returns {Error & { status: number }}
 */
function createHttpError(message, status) {
  return Object.assign(new Error(message), { status });
}

/**
 * Stem-job source conversion reads the protected stem server-side, so it must
 * enforce the same ownership boundary as direct stem downloads.
 * @param {import("express").Request} req
 * @param {string} stemJobId
 * @returns {Promise<string | null>}
 */
async function verifyStemSourceAccess(req, stemJobId) {
  const testGetJobOwner = req.app?.locals?.getJobOwner;
  const owner =
    typeof testGetJobOwner === "function"
      ? await testGetJobOwner(stemJobId)
      : await getJobOwner(stemJobId);

  if (!owner) {
    const tokenResult = validateJobTokenForRequest(req, stemJobId);
    if (!tokenResult.ok) {
      throw createHttpError(tokenResult.error, tokenResult.status);
    }
    return null;
  }

  const testVerifier = req.app?.locals?.verifyClerkBearer;
  const authenticatedUserId =
    typeof testVerifier === "function"
      ? await testVerifier(req)
      : await verifyClerkBearer(req);

  if (authenticatedUserId !== owner) {
    throw createHttpError("You do not have access to this stem job.", 403);
  }

  return authenticatedUserId;
}

midiConvertRouter.post(
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
        return res
          .status(400)
          .json({ error: "Upload failed. Please try again." });
      }
      next();
    });
  },
  async (req, res) => {
    const stemJobId = req.body?.stem_job_id;
    const stemName = req.body?.stem_name;
    let filePath = req.file?.path || null;
    let useStemFile = false;
    let isTempStemFile = false;
    let usageReserved = false;
    let usageUserId = null;
    const usageCost = MIDI_TOKEN_COST;

    // If referencing a stem from a previous split, resolve local disk or S3 fallback
    if (stemJobId && stemName && !req.file) {
      try {
        usageUserId = await verifyStemSourceAccess(req, stemJobId);
      } catch (e) {
        const status =
          e && typeof e === "object" && "status" in e && typeof e.status === "number"
            ? e.status
            : 401;
        const message = e instanceof Error ? e.message : "Authentication required";
        return res.status(status).json({ error: message });
      }
      const resolved = await resolveStemAudioPath(stemJobId, stemName);
      if (!resolved) {
        return res.status(404).json({
          error: `Stem file not found: ${stemName} from job ${stemJobId}`,
        });
      }
      filePath = resolved.filePath;
      isTempStemFile = resolved.isTempFile;
      useStemFile = true;
    }

    if (!filePath) {
      return res.status(400).json({
        error:
          "Provide either an audio file (field 'file') or stem_job_id + stem_name.",
      });
    }

    if (!useStemFile && req.file && req.file.size > MIDI_MAX_UPLOAD_BYTES) {
      const mb = Math.round(MIDI_MAX_UPLOAD_BYTES / (1024 * 1024));
      return res.status(413).json({
        error: `File too large for MIDI conversion. Maximum size is ${mb}MB.`,
      });
    }

    try {
      // Validate uploaded file (skip for stem references — already validated)
      if (!useStemFile) {
        const declaredExt =
          path.extname(req.file?.originalname || "").toLowerCase() ||
          path.extname(filePath).toLowerCase();
        if (!MIDI_ALLOWED_UPLOAD_EXTS.has(declaredExt)) {
          return res.status(415).json({
            error: `Unsupported format (${declaredExt || "unknown"}). Accepted for MIDI: ${MIDI_ALLOWED_UPLOAD_FORMATS_LABEL}.`,
          });
        }
        const sniff = verifyUploadMatchesExtension(filePath, declaredExt);
        if (!sniff.ok) {
          return res.status(415).json({ error: sniff.message || "Invalid audio file" });
        }

        const scanResult = await scanUploadedFile(filePath);
        if (!scanResult.ok) {
          if (scanResult.threat) {
            return res.status(422).json({
              error: "File did not pass security screening.",
            });
          }
          return res.status(503).json({
            error: "Security screening temporarily unavailable.",
          });
        }
      }

      // Reserve usage tokens
      if (isUsageTokensEnabled() && !DEV_BYPASS_UPLOAD_AUTH) {
        usageUserId =
          /** @type {any} */ (req)._usageUserId ||
          (await verifyClerkBearer(req));
        if (usageUserId && usageCost > 0) {
          await reserveUsageTokens(usageUserId, usageCost);
          usageReserved = true;
        }
      }

      // Parse conversion options from request body
      const minConfidence = req.body?.min_confidence || "0.5";
      const minNoteLengthMs = req.body?.min_note_length_ms || "58";
      const includePitchBends = req.body?.include_pitch_bends || "true";

      // Build form to proxy to MIDI service
      const form = new FormData();
      form.append("file", createReadStream(filePath), {
        filename: req.file?.originalname || `${stemName || "audio"}.wav`,
      });
      form.append("min_confidence", minConfidence);
      form.append("min_note_length_ms", minNoteLengthMs);
      form.append("include_pitch_bends", includePitchBends);

      // Quantization parameters
      const quantize = req.body?.quantize || "false";
      const quantizeGrid = req.body?.quantize_grid || "1/16";
      const quantizeBpm = req.body?.quantize_bpm || "120";
      const quantizeStrength = req.body?.quantize_strength ?? "1.0";
      const normalizeVelocity = req.body?.normalize_velocity ?? "true";
      const targetVelocity = req.body?.target_velocity ?? "90";
      const maxNoteLengthMs = req.body?.max_note_length_ms ?? "0";
      const transpose = req.body?.transpose ?? "0";
      form.append("quantize", quantize);
      form.append("quantize_grid", quantizeGrid);
      form.append("quantize_bpm", quantizeBpm);
      form.append("quantize_strength", String(quantizeStrength));
      form.append("normalize_velocity", normalizeVelocity);
      form.append("target_velocity", String(targetVelocity));
      form.append("max_note_length_ms", String(maxNoteLengthMs));
      form.append("transpose", String(transpose));

      // Forward metadata fields for history tracking
      if (stemJobId) form.append("stem_job_id", stemJobId);
      if (stemName) form.append("stem_name", stemName);
      // Forward user_id from Clerk auth (resolve if not already set by usage token flow)
      if (!usageUserId) {
        try {
          usageUserId = await verifyClerkBearer(req);
        } catch {
          // Non-fatal: history just won't be associated with a user
        }
      }
      if (usageUserId) form.append("user_id", usageUserId);

      const { statusCode, data } = await midiServiceClient.breaker.call(() =>
        proxyFormRequestTo(
          MIDI_SERVICE_URL,
          "/convert",
          form,
          {
            timeoutMs: MIDI_ACCEPT_TIMEOUT_MS,
            authHeaderFn: withMidiServiceAuthHeader,
            correlationId: /** @type {any} */ (req).correlationId,
          },
        )
      );

      if (statusCode !== 202 || !data?.job_id) {
        await refundReservedMidiUsage({
          usageReserved,
          usageUserId,
          usageCost,
          logPrefix: "[midi/convert]",
        });
        return res
          .status(502)
          .json({ error: "MIDI service did not accept the job" });
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
          originalFilename: req.file?.originalname || stemName || null,
          durationSeconds: null,
          tokenCost: usageReserved ? usageCost : 0,
          splitIntent: null,
        });
      } catch (dbErr) {
        console.error(
          mustPersistOwner
            ? "[midi/convert] critical: failed to persist job to DB:"
            : "[midi/convert] failed to persist job to DB:",
          dbErr instanceof Error ? dbErr.message : dbErr,
        );
        if (mustPersistOwner) {
          await refundReservedMidiUsage({
            usageReserved,
            usageUserId,
            usageCost,
            logPrefix: "[midi/convert]",
          });
          return res.status(502).json({
            error: "Could not record your job. Please try again.",
          });
        }
      }

      const baseUrl = getBaseUrl(req);
      const response = {
        job_id: jobId,
        status: data.status || "queued",
        file_url: `${baseUrl}/api/midi/file/${jobId}/output.mid`,
        status_url: `${baseUrl}/api/midi/status/${jobId}`,
      };
      if (process.env.JOB_TOKEN_SECRET) {
        response.job_token = issueJobToken(jobId);
      }
      return res.status(202).json(response);
    } catch (e) {
      if (e instanceof CircuitOpenError) {
        res.set("Retry-After", String(e.retryAfter));
        return res.status(503).json({
          error: "Service temporarily unavailable. Try again in 30s.",
        });
      }
      await handleMidiProxyError(e, res, "[POST /api/midi/convert]", {
        usageReserved,
        usageUserId,
        usageCost,
      });
    } finally {
      if (isTempStemFile && filePath) {
        cleanupTempStemFile(filePath).catch(() => {});
      } else if (!useStemFile && filePath) {
        unlinkPromise(filePath).catch(() => {
          unlink(filePath, () => {});
        });
      }
    }
  },
);
