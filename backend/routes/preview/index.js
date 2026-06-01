// @ts-check
/**
 * POST /generate — Create watermarked or clean 30s preview via FFmpeg.
 * GET /:preview_id/download — Download generated preview.
 */
import { Router } from "express";
import { existsSync, unlink } from "fs";
import { access, mkdir, readFile, stat, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

import { authMiddleware } from "../../middleware/auth.js";
import { verifyClerkBearer } from "../../clerkAuth.js";
import { UUID_REGEX } from "../../helpers/validation.js";
import { resolveEntitlementStateForUser } from "../../billing/entitlements.js";
import { findJobInputPath } from "../../usage/audioFile.js";
import { runFfmpeg } from "../../lib/ffmpeg.js";
import { STEM_OUTPUT_DIR } from "../stems/shared.js";
import { MIDI_OUTPUT_DIR } from "../midi/shared.js";

export const previewRouter = Router();

const PREVIEW_DIR = path.join(os.tmpdir(), "burntbeats-previews");
const DEFAULT_PREVIEW_SECONDS = 30;

/**
 * @param {string} jobId
 * @returns {string | null}
 */
function resolvePreviewInputPath(jobId) {
  if (!jobId || !UUID_REGEX.test(jobId)) return null;
  const stemInput = findJobInputPath(path.join(STEM_OUTPUT_DIR, jobId));
  if (stemInput) return stemInput;
  return findJobInputPath(path.join(MIDI_OUTPUT_DIR, jobId));
}

/**
 * @param {boolean} watermarked
 * @param {number} durationSec
 * @returns {string}
 */
function buildPreviewAudioFilter(watermarked, durationSec) {
  if (!watermarked) return `atrim=0:${durationSec}`;

  return [
    `atrim=0:${durationSec}`,
    "volume=0.8",
    "aeval=val(0)*if(mod(t\\,10)<0.5\\,0.9\\,1.0)",
    "aeval=val(0)+0.02*sin(2*PI*15000*t)",
  ].join(",");
}

/**
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {boolean} watermarked
 * @param {number} durationSec
 */
async function renderPreviewFile(inputPath, outputPath, watermarked, durationSec) {
  const filter = buildPreviewAudioFilter(watermarked, durationSec);
  const bitrate = watermarked ? "128k" : "192k";
  const args = [
    "-i",
    inputPath,
    "-af",
    filter,
    "-c:a",
    "mp3",
    "-b:a",
    bitrate,
    "-ar",
    "44100",
    "-y",
    outputPath,
  ];
  const result = await runFfmpeg(args, { timeoutMs: 120_000 });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.split("\n").slice(-10).join("\n") || "FFmpeg failed");
  }
}

previewRouter.post("/generate", authMiddleware, async (req, res) => {
  const body = req.body || {};
  const jobId = typeof body.job_id === "string" ? body.job_id : "";
  const durationSec = Math.min(
    120,
    Math.max(5, Number(body.duration_seconds) || DEFAULT_PREVIEW_SECONDS),
  );

  if (!jobId || !UUID_REGEX.test(jobId)) {
    return res.status(400).json({ error: "Invalid or missing job_id" });
  }

  const inputPath = resolvePreviewInputPath(jobId);
  if (!inputPath) {
    return res.status(404).json({ error: "Source audio not found for job" });
  }

  let watermarked = true;
  try {
    const userId = await verifyClerkBearer(req);
    const entitlements = await resolveEntitlementStateForUser(userId);
    const canClean =
      entitlements.capabilities.canDownloadFullPreview ||
      entitlements.capabilities.canShareCleanPreview;
    if (canClean) watermarked = false;
  } catch {
    watermarked = true;
  }

  if (body.watermarked === false) {
    try {
      const userId = await verifyClerkBearer(req);
      const entitlements = await resolveEntitlementStateForUser(userId);
      if (
        entitlements.capabilities.canDownloadFullPreview ||
        entitlements.capabilities.canShareCleanPreview
      ) {
        watermarked = false;
      }
    } catch {
      return res.status(403).json({
        error: "Clean previews require Premium or Studio subscription.",
      });
    }
  }

  await mkdir(PREVIEW_DIR, { recursive: true });

  // ── Caching Logic ──────────────────────────────────────────────────────────
  // Check if a preview for this job/duration/watermark already exists.
  const previewId = `${jobId}_${durationSec}_${watermarked ? "w" : "c"}`;
  const outputPath = path.join(PREVIEW_DIR, `audio_${previewId}.mp3`);
  const metaPath = path.join(PREVIEW_DIR, `meta_${previewId}.json`);

  try {
    if (existsSync(metaPath) && existsSync(outputPath)) {
      const fileStat = await stat(outputPath);
      // Basic expiry check (24h)
      if (Date.now() - fileStat.mtimeMs < 24 * 60 * 60 * 1000) {
        return res.status(200).json({
          preview_id: previewId,
          job_id: jobId,
          watermarked,
          duration_seconds: durationSec,
          download_url: `/api/preview/${previewId}/download`,
          cached: true,
        });
      }
    }
  } catch (e) {
    console.warn("[preview/cache] read error:", e instanceof Error ? e.message : e);
  }

  try {
    await renderPreviewFile(inputPath, outputPath, watermarked, durationSec);
    await writeFile(
      metaPath,
      JSON.stringify({
        preview_id: previewId,
        job_id: jobId,
        watermarked,
        duration_seconds: durationSec,
        created_at: new Date().toISOString(),
        file: path.basename(outputPath),
      }),
    );

    return res.status(201).json({
      preview_id: previewId,
      job_id: jobId,
      watermarked,
      duration_seconds: durationSec,
      download_url: `/api/preview/${previewId}/download`,
    });
  } catch (e) {
    unlink(outputPath, () => {});
    unlink(metaPath, () => {});
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/preview/generate]", msg);
    return res.status(500).json({ error: "Preview generation failed" });
  }
});

previewRouter.get("/:preview_id/download", authMiddleware, async (req, res) => {
  const previewId = req.params.preview_id;
  if (!previewId) {
    return res.status(400).json({ error: "Invalid preview_id" });
  }

  const metaPath = path.join(PREVIEW_DIR, `meta_${previewId}.json`);
  try {
    await access(metaPath);
  } catch {
    return res.status(404).json({ error: "Preview not found" });
  }

  const meta = JSON.parse(await readFile(metaPath, "utf-8"));
  const filePath = path.join(PREVIEW_DIR, meta.file);
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "Preview file missing" });
  }

  if (!meta.watermarked) {
    try {
      const userId = await verifyClerkBearer(req);
      const entitlements = await resolveEntitlementStateForUser(userId);
      if (
        !entitlements.capabilities.canDownloadFullPreview &&
        !entitlements.capabilities.canShareCleanPreview
      ) {
        return res.status(403).json({
          error: "Clean preview download requires Premium or Studio.",
        });
      }
    } catch {
      return res.status(403).json({ error: "Authentication required for clean preview." });
    }
  }

  const fileStat = await stat(filePath);
  if (Date.now() - fileStat.mtimeMs > 24 * 60 * 60 * 1000) {
    return res.status(410).json({ error: "Preview expired" });
  }

  res.setHeader("Content-Type", "audio/mpeg");
  return res.download(filePath, `preview_${previewId}.mp3`);
});
