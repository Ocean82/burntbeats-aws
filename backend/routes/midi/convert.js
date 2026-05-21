// @ts-check
/**
 * POST /convert — Upload audio file (or reference a stem) and start MIDI conversion.
 */
import { Router } from "express";
import FormData from "form-data";
import { createReadStream, existsSync, unlink } from "fs";
import { unlink as unlinkPromise } from "fs/promises";
import path from "path";

import {
  authMiddleware,
  requireUsageAuthPreUpload,
  issueJobToken,
  DEV_BYPASS_UPLOAD_AUTH,
} from "../../middleware/auth.js";
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

import {
  MIDI_ACCEPT_TIMEOUT_MS,
  MIDI_MAX_UPLOAD_BYTES,
  MIDI_SERVICE_URL,
  MIDI_TOKEN_COST,
  withMidiServiceAuthHeader,
  handleMidiProxyError,
} from "./shared.js";
import { STEM_OUTPUT_DIR } from "../stems/shared.js";

export const midiConvertRouter = Router();

/**
 * Resolve a stem WAV path from a previous split job.
 * @param {string} stemJobId
 * @param {string} stemName - e.g. "vocals", "drums", "bass", "melody"
 * @returns {string | null} Absolute path to the WAV file, or null if not found.
 */
function resolveStemPath(stemJobId, stemName) {
  // Validate inputs to prevent injection
  if (!/^[0-9a-f-]{36}$/i.test(stemJobId)) return null;
  if (!/^[a-z_]+$/i.test(stemName)) return null;

  // Stem files are stored as: STEM_OUTPUT_DIR/<jobId>/stems/<stemName>.wav
  const candidate = path.join(STEM_OUTPUT_DIR, stemJobId, "stems", `${stemName}.wav`);
  try {
    const resolved = path.resolve(candidate);
    // Prevent path traversal
    if (!resolved.startsWith(path.resolve(STEM_OUTPUT_DIR))) return null;
    // Verify file actually exists
    if (!existsSync(resolved)) return null;
    return resolved;
  } catch {
    return null;
  }
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

    // If referencing a stem from a previous split, resolve its path
    if (stemJobId && stemName && !req.file) {
      const resolved = resolveStemPath(stemJobId, stemName);
      if (!resolved) {
        return res.status(404).json({
          error: `Stem file not found: ${stemName} from job ${stemJobId}`,
        });
      }
      filePath = resolved;
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

    let usageReserved = false;
    let usageUserId = null;
    const usageCost = MIDI_TOKEN_COST;

    try {
      // Validate uploaded file (skip for stem references — already validated)
      if (!useStemFile) {
        const declaredExt =
          path.extname(req.file?.originalname || "").toLowerCase() ||
          path.extname(filePath).toLowerCase();
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
      form.append("quantize", quantize);
      form.append("quantize_grid", quantizeGrid);
      form.append("quantize_bpm", quantizeBpm);
      form.append("quantize_strength", String(quantizeStrength));
      form.append("normalize_velocity", normalizeVelocity);
      form.append("target_velocity", String(targetVelocity));
      form.append("max_note_length_ms", String(maxNoteLengthMs));

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

      const { statusCode, data } = await proxyFormRequestTo(
        MIDI_SERVICE_URL,
        "/convert",
        form,
        {
          timeoutMs: MIDI_ACCEPT_TIMEOUT_MS,
          authHeaderFn: withMidiServiceAuthHeader,
        },
      );

      if (statusCode !== 202 || !data?.job_id) {
        return res
          .status(502)
          .json({ error: "MIDI service did not accept the job" });
      }

      const jobToken = issueJobToken(data.job_id);
      const baseUrl = getBaseUrl(req);
      return res.status(202).json({
        job_id: data.job_id,
        status: data.status || "queued",
        job_token: jobToken,
        file_url: `${baseUrl}/api/midi/file/${data.job_id}/output.mid`,
        status_url: `${baseUrl}/api/midi/status/${data.job_id}`,
      });
    } catch (e) {
      await handleMidiProxyError(e, res, "[POST /api/midi/convert]", {
        usageReserved,
        usageUserId,
        usageCost,
      });
    } finally {
      // Clean up uploaded temp file (don't delete stem references)
      if (!useStemFile && filePath) {
        unlinkPromise(filePath).catch(() => {
          unlink(filePath, () => {});
        });
      }
    }
  },
);
