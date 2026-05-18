// @ts-check
import { Router } from "express";
import { existsSync, readFileSync } from "fs";
import path from "path";

import { authMiddleware, jobTokenMiddleware } from "../../middleware/auth.js";
import { UUID_REGEX } from "../../helpers/validation.js";
import { getBaseUrl } from "../../helpers/baseUrl.js";

import { SPEECH_OUTPUT_DIR } from "./shared.js";

export const speechStatusRouter = Router();

speechStatusRouter.get(
  "/:job_id",
  authMiddleware,
  jobTokenMiddleware,
  (req, res) => {
    const { job_id } = req.params;
    if (!job_id || !UUID_REGEX.test(job_id)) {
      return res.status(400).json({ error: "Invalid job_id" });
    }
    const progressPath = path.join(SPEECH_OUTPUT_DIR, job_id, "progress.json");
    if (!existsSync(progressPath)) {
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
