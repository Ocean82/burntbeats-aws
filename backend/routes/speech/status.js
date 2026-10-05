// @ts-check
import { Router } from "express";
import { existsSync, readFileSync } from "fs";

import { authMiddleware } from "../../middleware/auth.js";
import { requireJobOwnership } from "../../middleware/ownership.js";
import { UUID_REGEX } from "../../helpers/validation.js";
import { getBaseUrl } from "../../helpers/baseUrl.js";
import { transitionToTerminal } from "../../db-jobs.js";
import { refundUsageTokens } from "../../usageTokens.js";

import { resolveSpeechJobPath } from "./shared.js";

export const speechStatusRouter = Router();

const terminalStatuses = new Set(["completed", "failed", "cancelled"]);

/**
 * @param {{
 *   jobId: string,
 *   statusData: Record<string, unknown>,
 *   transitionJobToTerminal?: typeof transitionToTerminal,
 *   refundTokens?: typeof refundUsageTokens,
 * }} params
 */
export async function reconcileSpeechTerminalStatus({
  jobId,
  statusData,
  transitionJobToTerminal = transitionToTerminal,
  refundTokens = refundUsageTokens,
}) {
  const status = String(statusData.status || "");
  if (!terminalStatuses.has(status)) return;

  const transitioned = await transitionJobToTerminal(jobId, /** @type {'completed' | 'failed' | 'cancelled'} */ (status), {
    errorMessage: typeof statusData.error === "string" ? statusData.error : undefined,
    modelName: typeof statusData.model === "string" ? statusData.model : undefined,
  }).catch((err) => {
    console.error(
      `[speech/status] terminal transition for ${jobId} failed:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  });

  if (!transitioned || (status !== "failed" && status !== "cancelled")) return;

  const cost = Number(transitioned.token_cost) || 0;
  if (cost <= 0 || !transitioned.clerk_user_id || transitioned.is_sample) return;

  refundTokens(transitioned.clerk_user_id, cost, {
    jobId,
  }).catch((err) => {
    console.error(
      `[speech/status] refund for ${jobId} failed:`,
      err instanceof Error ? err.message : err,
    );
  });
}

speechStatusRouter.get(
  "/:job_id",
  authMiddleware,
  requireJobOwnership,
  async (req, res) => {
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
    await reconcileSpeechTerminalStatus({ jobId: job_id, statusData: data });
    res.json(data);
  },
);
