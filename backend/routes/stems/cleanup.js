// @ts-check
/**
 * POST /cleanup — Remove old stem job directories.
 * GET /cleanup — 405 (cleanup is destructive, POST only).
 */
import { Router } from "express";
import { readdir, rm, stat, unlink as unlinkPromise } from "fs/promises";
import path from "path";

import { authMiddleware } from "../../middleware/auth.js";
import { UUID_REGEX } from "../../helpers/validation.js";

import { STEM_OUTPUT_DIR, STEM_CLEANUP_DEFAULT_MAX_AGE_HOURS, UPLOAD_TMP_DIR } from "./shared.js";

export const cleanupRouter = Router();
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
 * Shared cleanup implementation for destructive cleanup endpoints.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
async function runStemsCleanup(req, res) {
  // Cleanup is a destructive operation — require API_KEY to be configured
  if (!process.env.API_KEY) {
    return res
      .status(503)
      .json({ error: "Cleanup endpoint requires API_KEY to be configured." });
  }
  const maxAgeHours = Math.max(
    0,
    Number(req.query.maxAgeHours) || STEM_CLEANUP_DEFAULT_MAX_AGE_HOURS,
  );
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  let deleted = 0;
  try {
    const entries = await readdir(STEM_OUTPUT_DIR, { withFileTypes: true });
    const candidateDirs = entries.filter(
      (ent) => ent.isDirectory() && UUID_REGEX.test(ent.name),
    );
    await forEachWithConcurrency(
      candidateDirs,
      CLEANUP_CONCURRENCY,
      async (ent) => {
        const dirPath = path.join(STEM_OUTPUT_DIR, ent.name);
        const stats = await stat(dirPath);
        if (stats.mtime.getTime() >= cutoff) return;
        await rm(dirPath, { recursive: true, force: true });
        deleted += 1;
      },
    );

    try {
      const uploadEntries = await readdir(UPLOAD_TMP_DIR, {
        withFileTypes: true,
      });
      const uploadCandidates = uploadEntries.filter(
        (ent) => ent.isFile() && ent.name.startsWith("upload-"),
      );
      await forEachWithConcurrency(
        uploadCandidates,
        CLEANUP_CONCURRENCY,
        async (ent) => {
          const filePath = path.join(UPLOAD_TMP_DIR, ent.name);
          const stats = await stat(filePath);
          if (stats.mtime.getTime() >= cutoff) return;
          await unlinkPromise(filePath);
          deleted += 1;
        },
      );
    } catch (uploadErr) {
      if (
        !(
          uploadErr &&
          typeof uploadErr === "object" &&
          "code" in uploadErr &&
          uploadErr.code === "ENOENT"
        )
      ) {
        const message =
          uploadErr &&
          typeof uploadErr === "object" &&
          "message" in uploadErr
            ? String(uploadErr.message)
            : "Unknown upload cleanup error";
        console.error("[cleanup] upload temp cleanup failed", { message });
      }
    }
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") {
      return res.json({ deleted: 0, message: "Output dir does not exist" });
    }
    const message =
      e && typeof e === "object" && "message" in e
        ? String(e.message)
        : "Unknown cleanup error";
    console.error("[cleanup] failed", { message });
    return res.status(500).json({ error: "Cleanup failed" });
  }
  return res.json({ deleted, maxAgeHours });
}

cleanupRouter.post("/", authMiddleware, runStemsCleanup);

// Deprecated: cleanup is destructive, so GET is intentionally not allowed.
cleanupRouter.get("/", authMiddleware, (req, res) => {
  return res.status(405).json({
    error:
      "Method Not Allowed. Use POST /api/stems/cleanup for destructive cleanup.",
  });
});
