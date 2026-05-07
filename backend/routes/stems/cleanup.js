// @ts-check
/**
 * POST /cleanup — Remove old stem job directories.
 * GET /cleanup — 405 (cleanup is destructive, POST only).
 */
import { Router } from "express";
import { existsSync, readdirSync, rmSync, statSync } from "fs";
import { unlink as unlinkPromise } from "fs/promises";
import path from "path";

import { authMiddleware } from "../../middleware/auth.js";
import { UUID_REGEX } from "../../helpers/validation.js";

import { STEM_OUTPUT_DIR, STEM_CLEANUP_DEFAULT_MAX_AGE_HOURS, UPLOAD_TMP_DIR } from "./shared.js";

export const cleanupRouter = Router();

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
    const entries = readdirSync(STEM_OUTPUT_DIR, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (!UUID_REGEX.test(ent.name)) continue;
      const dirPath = path.join(STEM_OUTPUT_DIR, ent.name);
      const stat = statSync(dirPath);
      if (stat.mtime.getTime() < cutoff) {
        rmSync(dirPath, { recursive: true });
        deleted++;
      }
    }

    if (existsSync(UPLOAD_TMP_DIR)) {
      const uploadEntries = readdirSync(UPLOAD_TMP_DIR, {
        withFileTypes: true,
      });
      for (const ent of uploadEntries) {
        if (!ent.isFile() || !ent.name.startsWith("upload-")) continue;
        const filePath = path.join(UPLOAD_TMP_DIR, ent.name);
        const stat = statSync(filePath);
        if (stat.mtime.getTime() < cutoff) {
          try {
            await unlinkPromise(filePath);
            deleted++;
          } catch (err) {
            console.error(
              "[cleanup] Failed to delete orphaned temp file:",
              err.message,
            );
          }
        }
      }
    }
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") {
      return res.json({ deleted: 0, message: "Output dir does not exist" });
    }
    console.error("[cleanup]", e);
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
