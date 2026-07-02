// @ts-check
/**
 * GET /source/:job_id — Stream the original uploaded audio for a conversion job.
 */
import { Router } from "express";

import { authMiddleware } from "../../middleware/auth.js";
import { requireJobOwnership } from "../../middleware/ownership.js";
import {
  isValidMidiJobId,
  mimeTypeForInputAudio,
  resolveMidiJobInputPath,
} from "./shared.js";

export const midiSourceRouter = Router();

midiSourceRouter.get(
  "/:job_id",
  authMiddleware,
  requireJobOwnership,
  async (req, res) => {
    const { job_id: jobId } = req.params;
    if (!isValidMidiJobId(jobId)) {
      return res.status(400).json({ error: "Invalid job_id" });
    }

    const inputPath = await resolveMidiJobInputPath(jobId);
    if (!inputPath) {
      return res.status(404).json({ error: "Source audio not found for job" });
    }

    const ext = inputPath.slice(inputPath.lastIndexOf(".")).toLowerCase();
    res.setHeader("Content-Type", mimeTypeForInputAudio(ext));
    res.setHeader("Cache-Control", "private, max-age=3600");
    return res.sendFile(inputPath);
  },
);
