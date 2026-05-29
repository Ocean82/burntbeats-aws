// @ts-check
/**
 * POST /render — FFmpeg-based CPU mastering using genre presets.
 */
import { Router } from "express";
import { existsSync, unlink } from "fs";
import { mkdir } from "fs/promises";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

import { authMiddleware } from "../../middleware/auth.js";
import { UUID_REGEX } from "../../helpers/validation.js";
import { findJobInputPath } from "../../usage/audioFile.js";
import { runFfmpeg } from "../../lib/ffmpeg.js";
import {
  buildMasteringFfmpegArgs,
  getMasteringPreset,
  loadMasteringPresets,
} from "../../lib/mastering.js";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { STEM_OUTPUT_DIR } from "../stems/shared.js";
import { MIDI_OUTPUT_DIR } from "../midi/shared.js";

export const masterRouter = Router();

const MIXER_GENRE_PRESETS_PATH = fileURLToPath(
  new URL("../../data/mixer-genre-presets.json", import.meta.url),
);

/**
 * @param {string | undefined} inputPath
 * @param {string} jobId
 * @param {string | undefined} source
 * @returns {string | null}
 */
function resolveMasterInputPath(inputPath, jobId, source) {
  if (inputPath && typeof inputPath === "string" && existsSync(inputPath)) {
    return inputPath;
  }

  if (jobId && UUID_REGEX.test(jobId)) {
    const stemDir = path.join(STEM_OUTPUT_DIR, jobId);
    const stemInput = findJobInputPath(stemDir);
    if (stemInput && (source === "stem" || source === "auto" || !source)) {
      return stemInput;
    }

    const midiDir = path.join(MIDI_OUTPUT_DIR, jobId);
    const midiInput = findJobInputPath(midiDir);
    if (midiInput) return midiInput;
  }

  return null;
}

masterRouter.get("/mixer-presets", authMiddleware, async (_req, res) => {
  try {
    const raw = await readFile(MIXER_GENRE_PRESETS_PATH, "utf-8");
    const data = JSON.parse(raw);
    const presets = Array.isArray(data.presets) ? data.presets : [];
    return res.json({
      presets: presets.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        category: p.category,
        stems: p.stems,
      })),
    });
  } catch (e) {
    console.error("[GET /api/master/mixer-presets]", e);
    return res.status(500).json({ error: "Failed to load mixer genre presets" });
  }
});

masterRouter.get("/presets", authMiddleware, async (_req, res) => {
  try {
    const data = await loadMasteringPresets();
    return res.json({
      presets: data.presets.map((p) => ({
        id: p.id,
        name: p.name,
        genre: p.genre,
        description: p.description,
      })),
    });
  } catch (e) {
    console.error("[GET /api/master/presets]", e);
    return res.status(500).json({ error: "Failed to load mastering presets" });
  }
});

masterRouter.post("/render", authMiddleware, async (req, res) => {
  const body = req.body || {};
  const jobId = typeof body.job_id === "string" ? body.job_id : "";
  const presetId = typeof body.preset_id === "string" ? body.preset_id : "";
  const inputPathRaw =
    typeof body.input_path === "string" ? body.input_path : undefined;
  const source =
    typeof body.source === "string" ? body.source.toLowerCase() : "auto";

  if (!presetId) {
    return res.status(400).json({ error: "Missing preset_id" });
  }

  const preset = await getMasteringPreset(presetId);
  if (!preset) {
    return res.status(400).json({ error: `Unknown preset_id: ${presetId}` });
  }

  const inputPath = resolveMasterInputPath(inputPathRaw, jobId, source);
  if (!inputPath) {
    return res.status(400).json({
      error:
        "Could not resolve input audio. Provide input_path or a valid job_id with source audio.",
    });
  }

  const tmpDir = path.join(os.tmpdir(), "burntbeats-master");
  await mkdir(tmpDir, { recursive: true });
  const renderId = randomUUID();
  const outputPath = path.join(tmpDir, `${renderId}.wav`);

  try {
    const args = buildMasteringFfmpegArgs(inputPath, outputPath, preset);
    const result = await runFfmpeg(args, { timeoutMs: 180_000 });
    if (result.exitCode !== 0) {
      console.error(
        "[POST /api/master/render] ffmpeg failed:",
        result.stderr.split("\n").slice(-20).join("\n"),
      );
      return res.status(500).json({ error: "Mastering render failed" });
    }

    if (!existsSync(outputPath)) {
      return res.status(500).json({ error: "Mastering output was not produced" });
    }

    const downloadName = `${preset.id}_master.wav`;
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("X-Master-Preset", preset.id);
    return res.download(outputPath, downloadName, (err) => {
      unlink(outputPath, () => {});
      if (err) {
        console.error("[POST /api/master/render] download error:", err.message);
      }
    });
  } catch (e) {
    unlink(outputPath, () => {});
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/master/render]", msg);
    return res.status(500).json({ error: "Mastering render failed" });
  }
});
