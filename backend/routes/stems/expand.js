// @ts-check
/**
 * POST /expand — Expand a 2-stem job to 4 stems.
 */
import { Router } from "express";
import FormData from "form-data";

import {
  authMiddleware,
  jobTokenMiddleware,
  issueJobToken,
} from "../../middleware/auth.js";
import { proxyFormRequest } from "../../middleware/proxy.js";
import { UUID_REGEX } from "../../helpers/validation.js";

import {
  computeExpandCost,
  getAudioDurationSeconds,
  isUsageTokensEnabled,
  reserveUsageTokens,
} from "../../usageTokens.js";
import { insertJob } from "../../db-jobs.js";

import {
  DEV_BYPASS_UPLOAD_AUTH,
  findStemJobInputPath,
  usageErrorResponse,
  handleProxyError,
} from "./shared.js";
import { requireExpandEntitlements } from "./entitlements.js";

export const expandRouter = Router();

expandRouter.post(
  "/",
  authMiddleware,
  jobTokenMiddleware,
  async (req, res) => {
    const jobId = req.body && req.body.job_id;
    if (!jobId || !UUID_REGEX.test(jobId)) {
      return res.status(400).json({
        error:
          "Invalid or missing job_id. Provide the 2-stem job id in the JSON body.",
      });
    }
    /** @type {string | undefined} */
    const rawQuality = req.body && req.body.quality;
    // Validate quality before proxying
    const VALID_QUALITY = new Set(["speed", "quality"]);
    if (rawQuality && !VALID_QUALITY.has(rawQuality)) {
      return res.status(400).json({
        error: "quality must be 'speed' or 'quality'",
      });
    }
    const quality = rawQuality;

    /** @type {string | null} */
    let entitlementUserId = null;
    const entitlementCheck = await requireExpandEntitlements(req);
    if (!entitlementCheck.ok) {
      return res
        .status(entitlementCheck.status)
        .json({ error: entitlementCheck.error });
    }
    entitlementUserId = entitlementCheck.userId;

    /** @type {string | null} */
    let usageUserId = entitlementUserId;
    let usageCost = 0;
    let usageReserved = false;
    if (isUsageTokensEnabled() && !DEV_BYPASS_UPLOAD_AUTH) {
      try {
        const inputPath = findStemJobInputPath(jobId);
        if (!inputPath) {
          return res
            .status(400)
            .json({ error: "Source job input not found for expand." });
        }
        const durationSec = await getAudioDurationSeconds(inputPath);
        usageCost = computeExpandCost(durationSec, quality);
        await reserveUsageTokens(usageUserId, usageCost);
        usageReserved = usageCost > 0;
      } catch (e) {
        const { status, message } = usageErrorResponse(
          e,
          "[POST /api/stems/expand usage]",
          "Unable to verify your account. Please sign in again.",
          "Unable to reserve usage for expand.",
        );
        return res.status(status).json({ error: message });
      }
    }

    const form = new FormData();
    form.append("job_id", jobId);
    if (quality) form.append("quality", quality);
    try {
      const data = await proxyFormRequest("/expand", form, {
        correlationId: /** @type {any} */ (req).correlationId,
      });
      if (data.statusCode === 202) {
        const newJobId = data.data.job_id;
        // Record expand job in database (non-blocking)
        insertJob({
          jobId: newJobId,
          clerkUserId: usageUserId,
          stems: 4, // expand always produces 4 stems
          quality: quality || null,
          isSample: false,
          originalFilename: null,
          durationSeconds: null,
          tokenCost: usageCost,
        }).catch((err) => console.error("[expand] db insertJob error:", err));
        const response = {
          job_id: newJobId,
          status: data.data.status ?? "accepted",
          queue_position:
            typeof data.data.queue_position === "number"
              ? data.data.queue_position
              : undefined,
        };
        if (process.env.JOB_TOKEN_SECRET)
          response.job_token = issueJobToken(newJobId);
        return res.status(202).json(response);
      }
      return res.status(data.statusCode).json(data.data);
    } catch (e) {
      await handleProxyError(e, res, "[POST /api/stems/expand]", {
        usageReserved,
        usageUserId,
        usageCost,
      });
    }
  },
);
