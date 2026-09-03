// @ts-check
/**
 * MIDI render routes — proxy render requests to midi_service and stream results.
 */
import { Router } from "express";

import {
  authMiddleware,
  requireUsageAuthPreUpload,
  issueJobToken,
  DEV_BYPASS_UPLOAD_AUTH,
  validateJobTokenForRequest,
} from "../../middleware/auth.js";
import { getJobOwner, requireJobOwnership } from "../../middleware/ownership.js";
import { getBaseUrl } from "../../helpers/baseUrl.js";
import { verifyClerkBearer } from "../../clerkAuth.js";
import {
  isUsageTokensEnabled,
  reserveUsageTokens,
  refundUsageTokens,
} from "../../usageTokens.js";
import { insertJob } from "../../db-jobs.js";

import {
  MIDI_ACCEPT_TIMEOUT_MS,
  MIDI_SERVICE_URL,
  withMidiServiceAuthHeader,
  handleMidiProxyError,
  isValidMidiJobId,
} from "./shared.js";

export const midiRenderRouter = Router();

/** Token cost for a render job (more expensive than extraction). */
const MIDI_RENDER_TOKEN_COST = Math.ceil(
  Number(process.env.MIDI_RENDER_TOKEN_COST) || 2,
);

/**
 * @param {string} message
 * @param {number} status
 * @returns {Error & { status: number }}
 */
function createHttpError(message, status) {
  return Object.assign(new Error(message), { status });
}

/**
 * Rendering from a saved MIDI conversion reads that source server-side, so the
 * source job needs the same ownership boundary as direct MIDI downloads.
 * @param {import("express").Request} req
 * @param {string} sourceJobId
 * @returns {Promise<string | null>}
 */
async function verifyRenderSourceAccess(req, sourceJobId) {
  if (!isValidMidiJobId(sourceJobId)) {
    throw createHttpError("Invalid source_job_id.", 400);
  }

  const testGetJobOwner = req.app?.locals?.getJobOwner;
  const owner =
    typeof testGetJobOwner === "function"
      ? await testGetJobOwner(sourceJobId)
      : await getJobOwner(sourceJobId);

  if (!owner) {
    const tokenResult = validateJobTokenForRequest(req, sourceJobId);
    if (!tokenResult.ok) {
      throw createHttpError(tokenResult.error, tokenResult.status);
    }
    return null;
  }

  const testVerifier = req.app?.locals?.verifyClerkBearer;
  const authenticatedUserId =
    /** @type {any} */ (req)._usageUserId ||
    (typeof testVerifier === "function"
      ? await testVerifier(req)
      : await verifyClerkBearer(req));

  if (authenticatedUserId !== owner) {
    throw createHttpError("You do not have access to this MIDI source job.", 403);
  }

  return authenticatedUserId;
}

/**
 * POST /render — Submit a MIDI-to-audio render job.
 */
midiRenderRouter.post(
  "/",
  authMiddleware,
  requireUsageAuthPreUpload,
  async (req, res) => {
    let usageReserved = false;
    let usageUserId = null;
    const usageCost = MIDI_RENDER_TOKEN_COST;

    try {
      const body = req.body;
      if (!body) {
        return res.status(400).json({ error: "Request body is required" });
      }

      // Validate: need either source_job_id or notes
      if (!body.source_job_id && !body.notes) {
        return res.status(400).json({
          error: "Either source_job_id or notes must be provided",
        });
      }
      if (body.source_job_id && body.notes) {
        return res.status(400).json({
          error: "Provide either source_job_id or notes, not both",
        });
      }

      if (body.source_job_id) {
        try {
          usageUserId = await verifyRenderSourceAccess(req, body.source_job_id);
        } catch (e) {
          const status =
            e && typeof e === "object" && "status" in e && typeof e.status === "number"
              ? e.status
              : 401;
          const message = e instanceof Error ? e.message : "Authentication required";
          return res.status(status).json({ error: message });
        }
      }

      // Reserve usage tokens
      if (isUsageTokensEnabled() && !DEV_BYPASS_UPLOAD_AUTH) {
        usageUserId =
          usageUserId ||
          /** @type {any} */ (req)._usageUserId ||
          (await verifyClerkBearer(req));
        if (usageUserId && usageCost > 0) {
          await reserveUsageTokens(usageUserId, usageCost);
          usageReserved = true;
        }
      }

      // Forward to MIDI service
      const headers = withMidiServiceAuthHeader({
        "Content-Type": "application/json",
      });
      if (/** @type {any} */ (req).correlationId) {
        headers["X-Correlation-Id"] = /** @type {any} */ (req).correlationId;
      }

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        MIDI_ACCEPT_TIMEOUT_MS,
      );

      let serviceRes;
      try {
        serviceRes = await fetch(`${MIDI_SERVICE_URL}/render`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!serviceRes.ok) {
        const errText = await serviceRes.text().catch(() => "Unknown error");
        let detail;
        try {
          detail = JSON.parse(errText);
        } catch {
          detail = errText;
        }
        // Refund if MIDI service rejected
        if (usageReserved && usageUserId && usageCost > 0) {
          await refundUsageTokens(usageUserId, usageCost).catch(() => {});
        }
        return res.status(serviceRes.status).json({
          error: detail?.detail || detail || "MIDI render service error",
        });
      }

      const data = await serviceRes.json();
      const jobId = data.job_id;

      if (!jobId) {
        if (usageReserved && usageUserId && usageCost > 0) {
          await refundUsageTokens(usageUserId, usageCost).catch(() => {});
        }
        return res
          .status(502)
          .json({ error: "MIDI service did not return a job_id" });
      }

      // Persist to DB
      if (!usageUserId) {
        try {
          usageUserId = await verifyClerkBearer(req);
        } catch {
          // Non-fatal
        }
      }
      try {
        await insertJob({
          jobId,
          clerkUserId: usageUserId,
          stems: 0,
          quality: null,
          isSample: false,
          originalFilename: "midi-render",
          durationSeconds: null,
          tokenCost: usageCost,
          splitIntent: null,
        });
      } catch (dbErr) {
        console.error("[midi/render] failed to persist job to DB:", dbErr);
      }

      const baseUrl = getBaseUrl(req);
      const response = {
        job_id: jobId,
        status: data.status || "queued",
        status_url: `${baseUrl}/api/midi/render/status/${jobId}`,
        download_url: `${baseUrl}/api/midi/render/file/${jobId}`,
      };
      if (process.env.JOB_TOKEN_SECRET) {
        response.job_token = issueJobToken(jobId);
      }
      return res.status(202).json(response);
    } catch (e) {
      await handleMidiProxyError(e, res, "[POST /api/midi/render]", {
        usageReserved,
        usageUserId,
        usageCost,
      });
    }
  },
);

/**
 * GET /render/status/:job_id — Poll render job status.
 */
midiRenderRouter.get("/status/:job_id", authMiddleware, requireJobOwnership, async (req, res) => {
  const { job_id: jobId } = req.params;
  if (!isValidMidiJobId(jobId)) {
    return res.status(400).json({ error: "Invalid job_id" });
  }

  try {
    const headers = withMidiServiceAuthHeader({});
    if (/** @type {any} */ (req).correlationId) {
      headers["X-Correlation-Id"] = /** @type {any} */ (req).correlationId;
    }

    const serviceRes = await fetch(
      `${MIDI_SERVICE_URL}/render/status/${jobId}`,
      { headers },
    );

    if (!serviceRes.ok) {
      const errText = await serviceRes.text().catch(() => "");
      return res.status(serviceRes.status).json({
        error: errText || "Render status lookup failed",
      });
    }

    const data = await serviceRes.json();
    return res.json(data);
  } catch (e) {
    console.error("[GET /api/midi/render/status] error:", e);
    return res.status(502).json({ error: "MIDI service unavailable" });
  }
});

/**
 * GET /render/file/:job_id — Download the rendered audio file.
 */
midiRenderRouter.get("/file/:job_id", authMiddleware, requireJobOwnership, async (req, res) => {
  const { job_id: jobId } = req.params;
  if (!isValidMidiJobId(jobId)) {
    return res.status(400).json({ error: "Invalid job_id" });
  }

  try {
    const headers = withMidiServiceAuthHeader({});
    if (/** @type {any} */ (req).correlationId) {
      headers["X-Correlation-Id"] = /** @type {any} */ (req).correlationId;
    }

    // First check status to get the filename
    const statusRes = await fetch(
      `${MIDI_SERVICE_URL}/render/status/${jobId}`,
      { headers },
    );
    if (!statusRes.ok) {
      return res.status(statusRes.status).json({ error: "Render not found" });
    }
    const status = await statusRes.json();
    if (status.status !== "completed") {
      return res.status(409).json({ error: "Render job is not complete" });
    }

    const filename = status.result?.filename || "render.wav";

    const fileRes = await fetch(
      `${MIDI_SERVICE_URL}/render/file/${jobId}/${filename}`,
      { headers },
    );

    if (!fileRes.ok) {
      return res.status(fileRes.status).json({ error: "File not available" });
    }

    const contentType = fileRes.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );

    const buffer = Buffer.from(await fileRes.arrayBuffer());
    return res.send(buffer);
  } catch (e) {
    console.error("[GET /api/midi/render/file] error:", e);
    return res.status(502).json({ error: "MIDI service unavailable" });
  }
});
