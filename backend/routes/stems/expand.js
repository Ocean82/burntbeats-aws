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
import { normalizeStemQuality } from "../../helpers/stemQuality.js";

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
import { stemServiceClient, CircuitOpenError } from "../../lib/serviceClients.js";
import { requireExpandEntitlements } from "./entitlements.js";

// Bypass expand entitlements in test mode. Separate from TEST_BYPASS_PREMIUM_ENTITLEMENTS
// (used by split) because server.test.js sets that flag but still expects expand to
// require Clerk auth (expand is always premium-gated, unlike split which is conditional).
const TEST_BYPASS_EXPAND_ENTITLEMENTS =
  process.env.NODE_ENV === "test" &&
  ["1", "true", "yes"].includes(
    (process.env.TEST_BYPASS_EXPAND_ENTITLEMENTS || "").toLowerCase(),
  );

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
    const rawQuality = req.body && req.body.quality;
    const qualityResult = normalizeStemQuality(rawQuality);
    if (!qualityResult.ok) {
      return res.status(400).json({ error: qualityResult.error });
    }
    const quality = qualityResult.quality;

    /** @type {string | null} */
    let entitlementUserId = null;
    if (!TEST_BYPASS_EXPAND_ENTITLEMENTS) {
      const entitlementCheck = await requireExpandEntitlements(req);
      if (!entitlementCheck.ok) {
        return res
          .status(entitlementCheck.status)
          .json({ error: entitlementCheck.error });
      }
      entitlementUserId = entitlementCheck.userId;
    }

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
      const data = await stemServiceClient.breaker.call(() =>
        proxyFormRequest("/expand", form, {
          correlationId: /** @type {any} */ (req).correlationId,
        })
      );
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
      if (e instanceof CircuitOpenError) {
        res.set("Retry-After", String(e.retryAfter));
        return res.status(503).json({
          error: "Service temporarily unavailable. Try again in 30s.",
        });
      }
      await handleProxyError(e, res, "[POST /api/stems/expand]", {
        usageReserved,
        usageUserId,
        usageCost,
      });
    }
  },
);
