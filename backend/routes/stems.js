// @ts-check
/**
 * Stem routes: split, status, stream, expand, server-export, file serving, delete, cleanup.
 */
import { Router } from "express";
import FormData from "form-data";
import {
  createReadStream,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlink,
} from "fs";
import { mkdir, unlink as unlinkPromise } from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { randomUUID } from "crypto";

import {
  authMiddleware,
  jobTokenMiddleware,
  issueJobToken,
  requireUsageAuthPreUpload,
  DEV_BYPASS_UPLOAD_AUTH,
} from "../middleware/auth.js";
import {
  stemFileRateLimitMiddleware,
  serverExportRateLimitMiddleware,
} from "../middleware/rateLimiter.js";
import {
  proxyFormRequest,
  isProxyHttpError,
  withStemServiceAuthHeader,
  getStemServiceUrl,
} from "../middleware/proxy.js";
import { upload, MAX_UPLOAD_MB } from "../middleware/upload.js";
import { UUID_REGEX, validateStemFileParams } from "../helpers/validation.js";
import { getBaseUrl } from "../helpers/baseUrl.js";

import { verifyClerkBearer } from "../clerkAuth.js";
import {
  computeExpandCost,
  computeServerExportCost,
  computeSplitCost,
  findJobInputPath,
  getAudioDurationSeconds,
  isUsageTokensEnabled,
  refundUsageTokens,
  reserveUsageTokens,
} from "../usageTokens.js";
import { presignStemGetUrl } from "../s3Presign.js";
import { scanUploadedFile } from "../malwareScan.js";
import { verifyUploadMatchesExtension } from "../uploadSniff.js";
import {
  publicErrorMessage,
  sanitizedProxyClientError,
} from "../clientSafeError.js";
import { insertJob, updateJobStatus } from "../db-jobs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Must match stem_service OUTPUT_BASE (Python STEM_OUTPUT_DIR). Same path so GET /api/stems/file can serve files Python wrote.
const STEM_OUTPUT_DIR = path.resolve(
  process.env.STEM_OUTPUT_DIR ||
    path.join(__dirname, "..", "..", "tmp", "stems"),
);

/** Default age for cleanup endpoint when `maxAgeHours` query is omitted */
const STEM_CLEANUP_DEFAULT_MAX_AGE_HOURS = (() => {
  const raw = Number(process.env.STEM_CLEANUP_DEFAULT_MAX_AGE_HOURS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return 24;
})();

// Time to wait for stem service to accept (202). Separation runs in background; frontend polls for completion.
const SPLIT_ACCEPT_TIMEOUT_MS =
  Number(process.env.SPLIT_ACCEPT_TIMEOUT_MS) || 5 * 60 * 1000;

/** Temp dir for streaming uploads (one file per request; cleaned after proxy). */
const UPLOAD_TMP_DIR = path.join(os.tmpdir(), "burntbeats-upload");

export const stemsRouter = Router();


// ── POST /split ──────────────────────────────────────────────────────────────
stemsRouter.post(
  "/split",
  authMiddleware,
  requireUsageAuthPreUpload,
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({
            error: `File too large. Maximum size is ${MAX_UPLOAD_MB}MB.`,
          });
        }
        if (err.code === "INVALID_FILE_TYPE") {
          return res.status(415).json({ error: err.message });
        }
        console.error(
          "[POST /api/stems/split] multer error:",
          err.code || err.message,
        );
        return res
          .status(400)
          .json({ error: "Upload failed. Please try again." });
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      const ct = req.get("content-type") || "";
      console.warn(
        "[POST /api/stems/split] 400: no file (field must be 'file'); Content-Type:",
        ct.slice(0, 50),
      );
      return res.status(400).json({
        error: "Missing file. Upload an audio file and use form field 'file'.",
      });
    }
    const filePath = req.file.path;
    const declaredExt =
      path.extname(req.file.originalname || "").toLowerCase() ||
      path.extname(filePath).toLowerCase();
    const sniff = verifyUploadMatchesExtension(filePath, declaredExt);
    if (!sniff.ok) {
      console.warn(
        "[POST /api/stems/split] sniff failed: ext=%s filename=%s message=%s",
        declaredExt,
        req.file?.originalname || "unknown",
        sniff.message,
      );
      await unlinkPromise(filePath).catch(() => {});
      return res.status(415).json({ error: sniff.message });
    }

    const stems = (req.body && req.body.stems) || "4";
    /** @type {string | undefined} */
    const rawQuality = req.body && req.body.quality;
    // Validate stems and quality before proxying to Python service
    if (stems !== "2" && stems !== "4") {
      await unlinkPromise(filePath).catch(() => {});
      return res.status(400).json({ error: "stems must be '2' or '4'" });
    }
    const VALID_QUALITY = new Set(["speed", "balanced", "quality", "ultra"]);
    if (rawQuality && !VALID_QUALITY.has(rawQuality)) {
      await unlinkPromise(filePath).catch(() => {});
      return res.status(400).json({
        error: "quality must be 'speed', 'balanced', 'quality', or 'ultra'",
      });
    }
    const quality = rawQuality;

    const scanResult = await scanUploadedFile(filePath);
    if (!scanResult.ok) {
      await unlinkPromise(filePath).catch(() => {});
      if (scanResult.threat) {
        console.warn(
          "[POST /api/stems/split] malware scan rejected:",
          scanResult.detail,
        );
        return res.status(422).json({
          error:
            "File did not pass security screening. Please use a different audio file.",
        });
      }
      console.error(
        "[POST /api/stems/split] malware scan error:",
        scanResult.detail,
      );
      return res.status(503).json({
        error:
          "Security screening is temporarily unavailable. Please try again later.",
      });
    }

    /** @type {string | null} */
    let usageUserId = null;
    let usageCost = 0;
    let usageReserved = false;
    /** @type {number | null} */
    let durationSeconds = null;
    const isSample = req.body && req.body.sample === "true";

    if (isUsageTokensEnabled() && !DEV_BYPASS_UPLOAD_AUTH && !isSample) {
      try {
        usageUserId =
          /** @type {any} */ (req)._usageUserId ||
          (await verifyClerkBearer(req));
        const durationSec = await getAudioDurationSeconds(filePath);
        durationSeconds = durationSec;
        usageCost = computeSplitCost(durationSec, quality, stems, isSample);
        await reserveUsageTokens(usageUserId, usageCost);
        usageReserved = usageCost > 0;
      } catch (e) {
        await unlinkPromise(filePath).catch(() => {});
        const status =
          e &&
          typeof e === "object" &&
          "status" in e &&
          typeof (/** @type {{ status?: number }} */ (e).status) === "number"
            ? /** @type {{ status?: number }} */ (e).status
            : 500;
        const raw = e instanceof Error ? e.message : String(e);
        const fallback =
          status === 401
            ? "Unable to verify your account. Please sign in again."
            : "Unable to reserve usage for this upload.";
        const msg = publicErrorMessage(
          raw,
          fallback,
          "[POST /api/stems/split usage]",
        );
        return res.status(status).json({ error: msg });
      }
    }

    // Stream from disk to Python using form-data pipe (fetch + form-data stream can corrupt multipart boundary)
    const form = new FormData();
    form.append("file", createReadStream(filePath), {
      filename: req.file.originalname || "audio.wav",
    });
    form.append("stems", stems);
    if (quality) form.append("quality", quality);
    if (isSample) form.append("sample", "true");

    try {
      const data = await proxyFormRequest("/split", form, {
        timeoutMs: SPLIT_ACCEPT_TIMEOUT_MS,
      });

      if (data.statusCode === 202) {
        const jobId = data.data.job_id;
        // Record job in database (non-blocking, best-effort)
        insertJob({
          jobId,
          clerkUserId: usageUserId,
          stems: Number(stems),
          quality: quality || null,
          isSample: !!isSample,
          originalFilename: req.file?.originalname || null,
          durationSeconds,
          tokenCost: usageCost,
        }).catch((err) => console.error("[split] db insertJob error:", err));
        const response = {
          job_id: jobId,
          status: data.data.status ?? "accepted",
        };
        if (process.env.JOB_TOKEN_SECRET)
          response.job_token = issueJobToken(jobId);
        return res.status(202).json(response);
      }
      const baseUrl = getBaseUrl(req);
      const d = data.data;
      d.stems = (d.stems || []).map((s) => ({
        id: s.id,
        url: `${baseUrl}/api/stems/file/${d.job_id}/${s.id}.wav`,
        path: s.path,
      }));
      res.json(d);
    } catch (e) {
      if (usageReserved && usageUserId && usageCost > 0) {
        try {
          await refundUsageTokens(usageUserId, usageCost);
        } catch (refundErr) {
          console.error(
            "[POST /api/stems/split] usage refund failed:",
            refundErr,
          );
        }
      }
      if (isProxyHttpError(e)) {
        console.warn(
          "[POST /api/stems/split] stem service error:",
          e.statusCode,
          e.error,
        );
        return res
          .status(e.statusCode)
          .json({ error: sanitizedProxyClientError(e.statusCode, e.error) });
      }
      const err =
        e && typeof e === "object" ? e : { name: "", message: String(e) };
      console.error(
        "[POST /api/stems/split] proxy error:",
        err.name,
        err.message,
        err.cause ?? "",
      );
      const message =
        err.name === "TimeoutError" || err.message === "TimeoutError"
          ? "Stem service did not accept in time (check stem service is running)"
          : "Stem service unavailable (ensure stem service runs on port 5000; try STEM_SERVICE_URL=http://127.0.0.1:5000)";
      res.status(502).json({ error: message });
    } finally {
      unlink(filePath, (unlinkErr) => {
        if (unlinkErr)
          console.error(
            "[POST /api/stems/split] cleanup temp file:",
            unlinkErr.message,
          );
      });
    }
  },
);


// ── GET /status/:job_id ──────────────────────────────────────────────────────
stemsRouter.get(
  "/status/:job_id",
  authMiddleware,
  jobTokenMiddleware,
  (req, res) => {
    const { job_id } = req.params;
    if (!job_id || !UUID_REGEX.test(job_id)) {
      return res.status(400).json({ error: "Invalid job_id" });
    }
    const progressPath = path.join(STEM_OUTPUT_DIR, job_id, "progress.json");
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
    // Stem file URLs intentionally omit job_token: clients must use x-job-token (or Authorization) on fetch.
    if (data.stems && Array.isArray(data.stems)) {
      data.stems = data.stems.map((s) => ({
        id: s.id,
        url: `${baseUrl}/api/stems/file/${job_id}/${s.id}.wav`,
        path: s.path,
      }));
    }
    // Update DB job status on terminal states (best-effort, non-blocking)
    const terminalStatuses = ["completed", "failed", "cancelled"];
    if (terminalStatuses.includes(data.status)) {
      updateJobStatus(job_id, data.status, {
        errorMessage: data.error || undefined,
        modelName: data.model || undefined,
      }).catch(() => {});
    } else if (data.status === "processing") {
      updateJobStatus(job_id, "processing").catch(() => {});
    }
    res.json(data);
  },
);

// ── GET /status/:job_id/stream (SSE) ─────────────────────────────────────────
/**
 * SSE stream for job progress. Pushes progress.json updates every 500ms until
 * the job reaches a terminal state (completed/failed/cancelled).
 *
 * Uses fetch + ReadableStream on the client (not EventSource) so Authorization
 * and x-job-token headers can be sent. Auth is enforced by the same middleware
 * as the polling endpoint.
 *
 * nginx / ALB: set `proxy_buffering off` and `proxy_read_timeout 300s` for this path.
 */
stemsRouter.get(
  "/status/:job_id/stream",
  authMiddleware,
  jobTokenMiddleware,
  (req, res) => {
    const { job_id } = req.params;
    if (!job_id || !UUID_REGEX.test(job_id)) {
      return res.status(400).json({ error: "Invalid job_id" });
    }

    const progressPath = path.join(STEM_OUTPUT_DIR, job_id, "progress.json");
    if (!existsSync(progressPath)) {
      return res.status(404).json({ error: "Job not found" });
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // disable nginx proxy buffering
    res.flushHeaders();

    const baseUrl = getBaseUrl(req);

    /**
     * Read progress.json, enrich stem URLs, and send as an SSE data event.
     * Returns true if the job has reached a terminal state.
     * @returns {boolean}
     */
    function sendProgress() {
      let data;
      try {
        data = JSON.parse(readFileSync(progressPath, "utf-8"));
      } catch {
        // File may be mid-write; skip this tick
        return false;
      }
      if (data.stems && Array.isArray(data.stems)) {
        data.stems = data.stems.map((s) => ({
          id: s.id,
          url: `${baseUrl}/api/stems/file/${job_id}/${s.id}.wav`,
          path: s.path,
        }));
      }
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {
        // Client disconnected mid-write; interval will be cleared below
        return true;
      }
      const terminal = ["completed", "failed", "cancelled"];
      return terminal.includes(data.status);
    }

    // Send an initial event immediately so the client sees the current state
    const done = sendProgress();
    if (done) {
      res.end();
      return;
    }

    const SSE_POLL_INTERVAL_MS = 500;
    const intervalId = setInterval(() => {
      const finished = sendProgress();
      if (finished) {
        clearInterval(intervalId);
        res.end();
      }
    }, SSE_POLL_INTERVAL_MS);

    // Clean up when the client disconnects
    req.on("close", () => {
      clearInterval(intervalId);
    });
  },
);


// ── POST /expand ─────────────────────────────────────────────────────────────
stemsRouter.post(
  "/expand",
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
    const VALID_QUALITY = new Set(["speed", "balanced", "quality", "ultra"]);
    if (rawQuality && !VALID_QUALITY.has(rawQuality)) {
      return res.status(400).json({
        error: "quality must be 'speed', 'quality', or 'ultra'",
      });
    }
    const quality = rawQuality === "balanced" ? "quality" : rawQuality;

    /** @type {string | null} */
    let usageUserId = null;
    let usageCost = 0;
    let usageReserved = false;
    if (isUsageTokensEnabled() && !DEV_BYPASS_UPLOAD_AUTH) {
      try {
        usageUserId = await verifyClerkBearer(req);
        const inputPath = findJobInputPath(path.join(STEM_OUTPUT_DIR, jobId));
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
        const status =
          e &&
          typeof e === "object" &&
          "status" in e &&
          typeof (/** @type {{ status?: number }} */ (e).status) === "number"
            ? /** @type {{ status?: number }} */ (e).status
            : 500;
        const raw = e instanceof Error ? e.message : String(e);
        const fallback =
          status === 401
            ? "Unable to verify your account. Please sign in again."
            : "Unable to reserve usage for expand.";
        const msg = publicErrorMessage(
          raw,
          fallback,
          "[POST /api/stems/expand usage]",
        );
        return res.status(status).json({ error: msg });
      }
    }

    const form = new FormData();
    form.append("job_id", jobId);
    if (quality) form.append("quality", quality);
    try {
      const data = await proxyFormRequest("/expand", form);
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
        };
        if (process.env.JOB_TOKEN_SECRET)
          response.job_token = issueJobToken(newJobId);
        return res.status(202).json(response);
      }
      return res.status(data.statusCode).json(data.data);
    } catch (e) {
      if (usageReserved && usageUserId && usageCost > 0) {
        try {
          await refundUsageTokens(usageUserId, usageCost);
        } catch (refundErr) {
          console.error(
            "[POST /api/stems/expand] usage refund failed:",
            refundErr,
          );
        }
      }
      if (isProxyHttpError(e)) {
        console.warn(
          "[POST /api/stems/expand] stem service error:",
          e.statusCode,
          e.error,
        );
        return res
          .status(e.statusCode)
          .json({ error: sanitizedProxyClientError(e.statusCode, e.error) });
      }
      console.error("[POST /api/stems/expand] proxy error:", e);
      return res.status(502).json({ error: "Stem service unavailable" });
    }
  },
);


// ── POST /server-export ──────────────────────────────────────────────────────
// Optional server-side master WAV (`stem_service/server_export.py` via PYTHON_BIN). Client export is still the default UX.
// SERVER_EXPORT_ENABLED off → 404 JSON; on → streamed download (+ usage debit when USAGE_TOKENS_ENABLED).
stemsRouter.post(
  "/server-export",
  serverExportRateLimitMiddleware,
  authMiddleware,
  async (req, res) => {
    const enabled = ["1", "true", "yes"].includes(
      (process.env.SERVER_EXPORT_ENABLED || "").toLowerCase(),
    );
    if (!enabled) {
      return res.status(404).json({
        error:
          "Server-side export is not enabled. Use client-side master export (default) — see frontend useExport / docs/ARCHITECTURE-FLOW.md.",
      });
    }

    /** @type {{ job_id?: unknown; stem_ids?: unknown; stem_states?: unknown; upload_name?: unknown; normalize?: unknown }} */
    const body = req.body || {};
    const jobId = typeof body.job_id === "string" ? body.job_id : "";
    if (!jobId || !UUID_REGEX.test(jobId)) {
      return res
        .status(400)
        .json({ error: "Invalid or missing job_id (UUID)." });
    }

    const uploadNameRaw =
      typeof body.upload_name === "string" && body.upload_name
        ? body.upload_name
        : "upload";
    const uploadBaseName =
      uploadNameRaw
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9_\- ]/g, "")
        .trim()
        .slice(0, 100) || "upload";

    const normalize = body.normalize === undefined ? true : !!body.normalize;

    const stemStates =
      (body.stem_states && typeof body.stem_states === "object"
        ? /** @type {any} */ (body.stem_states)
        : {}) || {};
    /** @type {string[]} */
    const stemIds = Array.isArray(body.stem_ids)
      ? body.stem_ids.filter((x) => typeof x === "string")
      : Object.keys(stemStates).filter((k) => typeof k === "string");

    // Solos override mutes (matches frontend filterStemsForAudibleMix).
    const anySolo = stemIds.some((id) => !!stemStates?.[id]?.soloed);
    const stemsToMix = stemIds.filter((id) => {
      const s = stemStates?.[id];
      if (!s || typeof s !== "object") return false;
      if (anySolo) return !!s.soloed;
      return !s.muted;
    });

    if (stemsToMix.length === 0) {
      return res.status(400).json({
        error: "No audible stems to export (all muted or missing stem state).",
      });
    }

    const stemStatesSubset = {};
    for (const id of stemsToMix) {
      if (stemStates?.[id]) stemStatesSubset[id] = stemStates[id];
    }

    // Charge usage tokens when enabled (same minute-basis as split/expand).
    let usageUserId = null;
    let usageCost = 0;
    let usageReserved = false;
    if (isUsageTokensEnabled()) {
      try {
        usageUserId = await verifyClerkBearer(req);
        const inputPath = findJobInputPath(path.join(STEM_OUTPUT_DIR, jobId));
        if (!inputPath) {
          return res.status(400).json({
            error:
              "Source input for job not found (cannot compute export cost).",
          });
        }
        const durationSec = await getAudioDurationSeconds(inputPath);
        usageCost = computeServerExportCost(durationSec);
        await reserveUsageTokens(usageUserId, usageCost);
        usageReserved = usageCost > 0;
      } catch (e) {
        const status =
          e &&
          typeof e === "object" &&
          "status" in e &&
          typeof (/** @type {{ status?: number }} */ (e).status) === "number"
            ? /** @type {{ status?: number }} */ (e).status
            : 500;
        const raw = e instanceof Error ? e.message : String(e);
        const fallback =
          status === 401
            ? "Unable to verify your account. Please sign in again."
            : "Unable to reserve usage for export.";
        const msg = publicErrorMessage(
          raw,
          fallback,
          "[POST /api/stems/server-export usage]",
        );
        return res.status(status).json({ error: msg });
      }
    }

    const exportTmpDir = path.join(os.tmpdir(), "burntbeats-server-export");
    await mkdir(exportTmpDir, { recursive: true });

    const exportId = randomUUID();
    const exportOutPath = path.join(exportTmpDir, `${exportId}.wav`);
    const pyScriptPath = path.join(
      __dirname,
      "..",
      "..",
      "stem_service",
      "server_export.py",
    );

    /** @type {{ stem_ids: string[], stem_states: Record<string, any>, normalize: boolean }} */
    const pythonPayload = {
      stem_ids: stemsToMix,
      stem_states: stemStatesSubset,
      normalize,
    };

    const pyBin = process.env.PYTHON_BIN || "python";

    /** @type {string} */
    let stderrText = "";
    try {
      const child = spawn(
        pyBin,
        [
          pyScriptPath,
          "--job-id",
          jobId,
          "--output",
          exportOutPath,
          "--sample-rate",
          "44100",
        ],
        {
          env: { ...process.env, STEM_OUTPUT_DIR: STEM_OUTPUT_DIR },
          stdio: ["pipe", "ignore", "pipe"],
        },
      );

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (d) => {
        stderrText += d;
      });

      child.stdin.write(JSON.stringify(pythonPayload));
      child.stdin.end();

      const exitCode = await new Promise((resolve) => {
        child.on("close", (code) => resolve(code ?? 1));
      });

      if (exitCode !== 0) {
        console.error(
          "[POST /api/stems/server-export] python exit",
          exitCode,
          stderrText ? stderrText.split("\n").slice(-40).join("\n") : "",
        );
        return res.status(500).json({ error: "Server export render failed" });
      }

      if (!existsSync(exportOutPath)) {
        return res.status(500).json({
          error: "Server export completed but output file was not produced.",
        });
      }

      const downloadName = `${uploadBaseName}_master.wav`;
      res.setHeader("Content-Type", "audio/wav");
      return res.download(exportOutPath, downloadName, (err) => {
        // Best-effort cleanup of temp export file.
        unlink(exportOutPath, () => {});
        if (err)
          console.error(
            "[POST /api/stems/server-export] download error:",
            err.message,
          );
      });
    } catch (e) {
      if (usageReserved && usageUserId && usageCost > 0) {
        try {
          await refundUsageTokens(usageUserId, usageCost);
        } catch (refundErr) {
          console.error(
            "[POST /api/stems/server-export] usage refund failed:",
            refundErr,
          );
        }
      }
      try {
        unlink(exportOutPath, () => {});
      } catch {
        /* ignore */
      }
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[POST /api/stems/server-export] render exception:", msg);
      return res.status(500).json({ error: "Server export failed" });
    }
  },
);


// ── DELETE /:job_id ──────────────────────────────────────────────────────────
stemsRouter.delete("/:job_id", authMiddleware, async (req, res) => {
  const { job_id } = req.params;
  if (!job_id || !UUID_REGEX.test(job_id)) {
    return res.status(400).json({ error: "Invalid job_id" });
  }
  try {
    const r = await fetch(`${getStemServiceUrl()}/split/${job_id}`, {
      method: "DELETE",
      headers: withStemServiceAuthHeader({}),
    });
    const contentType = r.headers.get("content-type") || "";
    const hasJson = r.ok && contentType.includes("application/json");
    const data = hasJson && r.status !== 204 ? await r.json() : {};
    return res
      .status(r.status)
      .json(Object.keys(data).length ? data : { deleted: true });
  } catch (e) {
    console.error("[DELETE /api/stems/:job_id] proxy error:", e);
    return res.status(502).json({ error: "Stem service unavailable" });
  }
});

// ── GET /file/:job_id/:stemId ────────────────────────────────────────────────
stemsRouter.get(
  "/file/:job_id/:stemId",
  authMiddleware,
  jobTokenMiddleware,
  stemFileRateLimitMiddleware,
  async (req, res) => {
    const { job_id, stemId } = req.params;
    const validated = validateStemFileParams(job_id, stemId);
    if (!validated.ok) {
      return res.status(400).json({ error: "Invalid job_id or stem id" });
    }
    const stemBase = stemId.replace(/\.wav$/i, "");
    const progressPath = path.join(STEM_OUTPUT_DIR, job_id, "progress.json");
    if (existsSync(progressPath)) {
      try {
        const progress = JSON.parse(readFileSync(progressPath, "utf-8"));
        const s3 = progress.s3;
        const key =
          s3 && s3.keys && typeof s3.keys === "object"
            ? s3.keys[stemBase]
            : null;
        if (key && s3.bucket) {
          const url = await presignStemGetUrl(s3.bucket, key, s3.region);
          return res.redirect(302, url);
        }
      } catch (e) {
        console.warn(
          "[GET /api/stems/file] S3 presign failed, trying disk:",
          e instanceof Error ? e.message : e,
        );
      }
    }
    const filePath = path.join(
      STEM_OUTPUT_DIR,
      job_id,
      "stems",
      validated.stemId,
    );
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: "Stem file not found" });
    }
    res.setHeader("Content-Type", "audio/wav");
    const stream = createReadStream(filePath);
    stream.on("error", (err) => {
      if (!res.headersSent)
        res.status(500).json({ error: "Failed to read stem file" });
      else res.destroy();
      console.error("[GET /api/stems/file] stream error:", err.message);
    });
    stream.pipe(res);
  },
);

// ── POST /cleanup ────────────────────────────────────────────────────────────
/**
 * Shared cleanup implementation for destructive cleanup endpoints.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
async function runStemsCleanup(req, res) {
  // Cleanup is a destructive operation — require API_KEY to be configured
  if (!process.env.API_KEY) {
    return res
      .status(503)
      .json({ error: "Cleanup endpoint requires API_KEY to be configured." });
  }
  const maxAgeHours = Math.max(
    0,
    Number(req.query.maxAgeHours) || STEM_CLEANUP_DEFAULT_MAX_AGE_HOURS,
  );
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  let deleted = 0;
  try {
    const entries = readdirSync(STEM_OUTPUT_DIR, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (!UUID_REGEX.test(ent.name)) continue;
      const dirPath = path.join(STEM_OUTPUT_DIR, ent.name);
      const stat = statSync(dirPath);
      if (stat.mtime.getTime() < cutoff) {
        rmSync(dirPath, { recursive: true });
        deleted++;
      }
    }

    if (existsSync(UPLOAD_TMP_DIR)) {
      const uploadEntries = readdirSync(UPLOAD_TMP_DIR, {
        withFileTypes: true,
      });
      for (const ent of uploadEntries) {
        if (!ent.isFile() || !ent.name.startsWith("upload-")) continue;
        const filePath = path.join(UPLOAD_TMP_DIR, ent.name);
        const stat = statSync(filePath);
        if (stat.mtime.getTime() < cutoff) {
          try {
            await unlinkPromise(filePath);
            deleted++;
          } catch (err) {
            console.error(
              "[cleanup] Failed to delete orphaned temp file:",
              err.message,
            );
          }
        }
      }
    }
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") {
      return res.json({ deleted: 0, message: "Output dir does not exist" });
    }
    console.error("[cleanup]", e);
    return res.status(500).json({ error: "Cleanup failed" });
  }
  return res.json({ deleted, maxAgeHours });
}

stemsRouter.post("/cleanup", authMiddleware, runStemsCleanup);

// Deprecated: cleanup is destructive, so GET is intentionally not allowed.
stemsRouter.get("/cleanup", authMiddleware, (req, res) => {
  return res.status(405).json({
    error:
      "Method Not Allowed. Use POST /api/stems/cleanup for destructive cleanup.",
  });
});

/** Export STEM_OUTPUT_DIR for use by server.js startup (mkdir). */
export { STEM_OUTPUT_DIR };
