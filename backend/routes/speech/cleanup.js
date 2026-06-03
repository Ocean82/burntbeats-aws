// @ts-check
/**
 * POST /cleanup — Remove old speech job directories.
 * GET /cleanup — 405 (cleanup is destructive, POST only).
 */
import { Router } from "express";
import { readdir, rm, stat } from "fs/promises";

import { authMiddleware } from "../../middleware/auth.js";
import { UUID_REGEX } from "../../helpers/validation.js";
import { resolvePathWithinBase } from "../../helpers/safePath.js";

import {
  SPEECH_OUTPUT_DIR,
  SPEECH_CLEANUP_DEFAULT_MAX_AGE_HOURS,
} from "./shared.js";

export const speechCleanupRouter = Router();
const CLEANUP_CONCURRENCY = 8;

/**
 * @template T
 * @param {T[]} values
 * @param {number} concurrency
 * @param {(value: T) => Promise<void>} worker
 */
async function forEachWithConcurrency(values, concurrency, worker) {
  if (values.length === 0) return;
  const maxConcurrency = Math.max(1, Math.min(concurrency, values.length));
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const current = values[cursor];
      cursor += 1;
      await worker(current);
    }
  }
  await Promise.all(Array.from({ length: maxConcurrency }, () => run()));
}

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
async function runSpeechCleanup(req, res) {
  if (!process.env.API_KEY) {
    return res
      .status(503)
      .json({ error: "Cleanup endpoint requires API_KEY to be configured." });
  }
  const maxAgeHours = Math.max(
    0,
    Number(req.query.maxAgeHours) || SPEECH_CLEANUP_DEFAULT_MAX_AGE_HOURS,
  );
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  let deleted = 0;
  try {
    const entries = await readdir(SPEECH_OUTPUT_DIR, { withFileTypes: true });
    const candidateDirs = entries.filter(
      (ent) => ent.isDirectory() && UUID_REGEX.test(ent.name),
    );
    await forEachWithConcurrency(
      candidateDirs,
      CLEANUP_CONCURRENCY,
      async (ent) => {
        const dirPath = resolvePathWithinBase(SPEECH_OUTPUT_DIR, ent.name);
        if (!dirPath) return;
        const stats = await stat(dirPath);
        if (stats.mtime.getTime() >= cutoff) return;
        await rm(dirPath, { recursive: true, force: true });
        deleted += 1;
      },
    );
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") {
      return res.json({ deleted: 0, message: "Output dir does not exist" });
    }
    const message =
      e && typeof e === "object" && "message" in e
        ? String(e.message)
        : "Unknown cleanup error";
    console.error("[speech cleanup] failed", { message });
    return res.status(500).json({ error: "Cleanup failed" });
  }
  return res.json({ deleted, maxAgeHours });
}

speechCleanupRouter.post("/", authMiddleware, runSpeechCleanup);

speechCleanupRouter.get("/", authMiddleware, (req, res) => {
  return res.status(405).json({
    error:
      "Method Not Allowed. Use POST /api/speech/cleanup for destructive cleanup.",
  });
});
