// @ts-check
/**
 * POST /cleanup — Remove old MIDI job directories.
 * GET /cleanup — 405 (cleanup is destructive, POST only).
 */
import { Router } from "express";
import { readdirSync, rmSync, statSync } from "fs";
import path from "path";

import { authMiddleware } from "../../middleware/auth.js";
import { UUID_REGEX } from "../../helpers/validation.js";

import {
  MIDI_OUTPUT_DIR,
  MIDI_CLEANUP_DEFAULT_MAX_AGE_HOURS,
} from "./shared.js";

export const midiCleanupRouter = Router();

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
async function runMidiCleanup(req, res) {
  if (!process.env.API_KEY) {
    return res
      .status(503)
      .json({ error: "Cleanup endpoint requires API_KEY to be configured." });
  }
  const maxAgeHours = Math.max(
    0,
    Number(req.query.maxAgeHours) || MIDI_CLEANUP_DEFAULT_MAX_AGE_HOURS,
  );
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  let deleted = 0;
  try {
    const entries = readdirSync(MIDI_OUTPUT_DIR, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (!UUID_REGEX.test(ent.name)) continue;
      const dirPath = path.join(MIDI_OUTPUT_DIR, ent.name);
      const stat = statSync(dirPath);
      if (stat.mtime.getTime() < cutoff) {
        rmSync(dirPath, { recursive: true });
        deleted++;
      }
    }
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") {
      return res.json({ deleted: 0, message: "Output dir does not exist" });
    }
    console.error("[midi cleanup]", e);
    return res.status(500).json({ error: "Cleanup failed" });
  }
  return res.json({ deleted, maxAgeHours });
}

midiCleanupRouter.post("/", authMiddleware, runMidiCleanup);

midiCleanupRouter.get("/", authMiddleware, (req, res) => {
  return res.status(405).json({
    error:
      "Method Not Allowed. Use POST /api/midi/cleanup for destructive cleanup.",
  });
});
