// @ts-check
/**
 * GET /file/:job_id/:filename — Serve generated MIDI files.
 */
import { Router } from "express";
import { writeFile } from "fs/promises";

import { authMiddleware } from "../../middleware/auth.js";
import { requireJobOwnership } from "../../middleware/ownership.js";
import {
  MIDI_OUTPUT_FILENAME,
  midiOutputExists,
  resolveMidiJobPath,
} from "./shared.js";

export const midiFileRouter = Router();

const ALLOWED_FILENAMES = new Set([MIDI_OUTPUT_FILENAME]);

midiFileRouter.get(
  "/:job_id/:filename",
  authMiddleware,
  requireJobOwnership,
  async (req, res) => {
    const { job_id: jobId, filename } = req.params;

    if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) {
      return res.status(400).json({ error: "Invalid job_id" });
    }
    if (!ALLOWED_FILENAMES.has(filename)) {
      return res.status(400).json({ error: "Unknown file" });
    }

    const filePath = resolveMidiJobPath(jobId, filename);
    if (!filePath) {
      return res.status(400).json({ error: "Invalid path" });
    }

    if (!(await midiOutputExists(jobId))) {
      return res.status(404).json({ error: "File not ready" });
    }

    res.setHeader("Content-Type", "audio/midi");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    return res.sendFile(filePath);
  },
);

midiFileRouter.put(
  "/:job_id/:filename",
  authMiddleware,
  requireJobOwnership,
  async (req, res) => {
    const { job_id: jobId, filename } = req.params;

    if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) {
      return res.status(400).json({ error: "Invalid job_id" });
    }
    if (!ALLOWED_FILENAMES.has(filename)) {
      return res.status(400).json({ error: "Unknown file" });
    }

    const filePath = resolveMidiJobPath(jobId, filename);
    if (!filePath) {
      return res.status(400).json({ error: "Invalid path" });
    }

    const body = req.body;
    let midiBytes;
    if (Buffer.isBuffer(body)) {
      midiBytes = body;
    } else if (body && typeof body === "object" && typeof body.data === "string") {
      try {
        midiBytes = Buffer.from(body.data, "base64");
      } catch {
        return res.status(400).json({ error: "Invalid base64 MIDI payload" });
      }
    } else {
      return res.status(400).json({
        error: "Request body must be raw MIDI bytes or JSON { data: base64 }.",
      });
    }

    if (!midiBytes.length) {
      return res.status(400).json({ error: "Empty MIDI payload" });
    }
    if (midiBytes.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: "MIDI payload exceeds 10MB limit" });
    }
    if (
      midiBytes[0] !== 0x4d ||
      midiBytes[1] !== 0x54 ||
      midiBytes[2] !== 0x68 ||
      midiBytes[3] !== 0x64
    ) {
      return res.status(400).json({ error: "Payload is not a valid MIDI file (missing MThd header)" });
    }

    try {
      await writeFile(filePath, midiBytes);
      return res.status(200).json({
        ok: true,
        job_id: jobId,
        filename,
        bytes: midiBytes.length,
      });
    } catch (e) {
      console.error("[PUT /api/midi/file] write error:", e?.message || e);
      return res.status(500).json({ error: "Failed to save MIDI file" });
    }
  },
);
