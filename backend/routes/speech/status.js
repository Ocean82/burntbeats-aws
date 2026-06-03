// @ts-check
import { Router } from "express";
import { existsSync, readFileSync } from "fs";

import { authMiddleware } from "../../middleware/auth.js";
import { requireJobOwnership } from "../../middleware/ownership.js";
import { UUID_REGEX } from "../../helpers/validation.js";
import { getBaseUrl } from "../../helpers/baseUrl.js";

import { resolveSpeechJobPath } from "./shared.js";

export const speechStatusRouter = Router();

speechStatusRouter.get(
  "/:job_id",
  authMiddleware,
  requireJobOwnership,
  (req, res) => {
    const { job_id } = req.params;
    if (!job_id || !UUID_REGEX.test(job_id)) {
      return res.status(400).json({ error: "Invalid job_id" });
    }
    const progressPath = resolveSpeechJobPath(job_id, "progress.json");
    if (!progressPath || !existsSync(progressPath)) {
      return res.status(404).json({ error: "Job not found" });
    }
    let data;
    try {
      data = JSON.parse(readFileSync(progressPath, "utf-8"));
    } catch {
      return res.status(404).json({ error: "Job not found" });
    }
    const baseUrl = getBaseUrl(req);
    if (data.status === "completed") {
      data.output_url = `${baseUrl}/api/speech/file/${job_id}/enhanced.wav`;
    }
    res.json(data);
  },
);
