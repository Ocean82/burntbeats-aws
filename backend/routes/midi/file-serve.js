// @ts-check
/**
 * GET /file/:job_id/:filename — Serve generated MIDI files.
 */
import { Router } from "express";
import path from "path";
import { stat } from "fs/promises";

import { authMiddleware, jobTokenMiddleware } from "../../middleware/auth.js";
import { MIDI_OUTPUT_DIR } from "./shared.js";

export const midiFileRouter = Router();

const ALLOWED_FILENAMES = new Set(["output.mid"]);

midiFileRouter.get("/:job_id/:filename", authMiddleware, jobTokenMiddleware, async (req, res) => {
  const { job_id: jobId, filename } = req.params;

  if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) {
    return res.status(400).json({ error: "Invalid job_id" });
  }
  if (!ALLOWED_FILENAMES.has(filename)) {
    return res.status(400).json({ error: "Unknown file" });
  }

  const filePath = path.resolve(MIDI_OUTPUT_DIR, jobId, filename);

  // Prevent path traversal
  if (!filePath.startsWith(path.resolve(MIDI_OUTPUT_DIR))) {
    return res.status(400).json({ error: "Invalid path" });
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return res.status(404).json({ error: "File not ready" });
    }
  } catch {
    return res.status(404).json({ error: "File not ready" });
  }

  res.setHeader("Content-Type", "audio/midi");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`,
  );
  return res.sendFile(filePath);
});
