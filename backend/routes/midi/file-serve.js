// @ts-check
/**
 * GET /file/:job_id/:filename — Serve generated MIDI files.
 */
import { Router } from "express";
import { writeFile } from "fs/promises";

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

/**
 * Verify ownership or job token before mutating job files.
 * @param {import("express").Request} req
 * @param {string} jobId
 */
async function authorizeMidiJobWrite(req, jobId) {
  const metadata = await readMidiJobMetadata(jobId);
  const ownerUserId =
    metadata && typeof metadata.user_id === "string" && metadata.user_id.trim()
      ? metadata.user_id.trim()
      : null;

  if (ownerUserId) {
    const authenticatedUserId = await verifyMidiOwner(req);
    if (authenticatedUserId !== ownerUserId) {
      const err = new Error("You do not have access to this MIDI file.");
      /** @type {any} */ (err).status = 403;
      throw err;
    }
    return;
  }

  const tokenResult = validateJobTokenForRequest(req, jobId);
  if (!tokenResult.ok) {
    const err = new Error(tokenResult.error);
    /** @type {any} */ (err).status = tokenResult.status;
    throw err;
  }
}

midiFileRouter.put("/:job_id/:filename", authMiddleware, async (req, res) => {
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
    await authorizeMidiJobWrite(req, jobId);
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e && typeof e.status === "number"
        ? e.status
        : 401;
    const message = e instanceof Error ? e.message : "Authentication required";
    return res.status(status).json({ error: message });
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
});
