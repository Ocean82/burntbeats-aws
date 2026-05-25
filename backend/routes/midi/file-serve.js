// @ts-check
/**
 * GET /file/:job_id/:filename — Serve generated MIDI files.
 */
import { Router } from "express";

import { authMiddleware, validateJobTokenForRequest } from "../../middleware/auth.js";
import {
  MIDI_OUTPUT_FILENAME,
  midiOutputExists,
  readMidiJobMetadata,
  resolveMidiJobPath,
  verifyMidiOwner,
} from "./shared.js";

export const midiFileRouter = Router();

const ALLOWED_FILENAMES = new Set([MIDI_OUTPUT_FILENAME]);

midiFileRouter.get("/:job_id/:filename", authMiddleware, async (req, res) => {
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

  const metadata = await readMidiJobMetadata(jobId);
  const ownerUserId =
    metadata && typeof metadata.user_id === "string" && metadata.user_id.trim()
      ? metadata.user_id.trim()
      : null;

  if (ownerUserId) {
    try {
      const authenticatedUserId = await verifyMidiOwner(req);
      if (authenticatedUserId !== ownerUserId) {
        return res.status(403).json({ error: "You do not have access to this MIDI file." });
      }
    } catch (e) {
      const status =
        e && typeof e === "object" && "status" in e && typeof e.status === "number"
          ? e.status
          : 401;
      return res.status(status).json({ error: "Authentication required" });
    }
  } else {
    const tokenResult = validateJobTokenForRequest(req, jobId);
    if (!tokenResult.ok) {
      return res.status(tokenResult.status).json({ error: tokenResult.error });
    }
  }

  res.setHeader("Content-Type", "audio/midi");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`,
  );
  return res.sendFile(filePath);
});
