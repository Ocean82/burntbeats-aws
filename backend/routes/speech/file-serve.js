// @ts-check
import { Router } from "express";
import { createReadStream, existsSync } from "fs";

import { authMiddleware } from "../../middleware/auth.js";
import { requireJobOwnership } from "../../middleware/ownership.js";
import { UUID_REGEX } from "../../helpers/validation.js";

import { resolveSpeechJobPath } from "./shared.js";

export const speechFileRouter = Router();

speechFileRouter.get(
  "/:job_id/:filename",
  authMiddleware,
  requireJobOwnership,
  (req, res) => {
    const { job_id, filename } = req.params;
    if (!job_id || !UUID_REGEX.test(job_id)) {
      return res.status(400).json({ error: "Invalid job_id" });
    }
    if (filename !== "enhanced.wav") {
      return res.status(400).json({ error: "Unknown file" });
    }
    const filePath = resolveSpeechJobPath(job_id, filename);
    if (!filePath || !existsSync(filePath)) {
      return res.status(404).json({ error: "File not ready" });
    }
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    createReadStream(filePath).pipe(res);
  },
);
