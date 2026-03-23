/**
 * Backend API: stem split/expand proxy, stem file URLs, job status, cleanup.
 * Python stem_service does inference; this process stores/serves under STEM_OUTPUT_DIR.
 * Product flow: docs/ARCHITECTURE-FLOW.md
 */
// @ts-check
import cors from "cors";
import express from "express";
import helmet from "helmet";
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
import multer from "multer";
import os from "os";
import path from "path";
import http from "http";
import https from "https";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { billingRouter } from "./billing.js";
import { verifyClerkBearer } from "./clerkAuth.js";
import {
  assertSufficientBalance,
  computeExpandCost,
  computeServerExportCost,
  computeSplitCost,
  debitUsageTokens,
  findJobInputPath,
  getAudioDurationSeconds,
  isUsageTokensEnabled,
} from "./usageTokens.js";
import { createHmac, timingSafeEqual, randomUUID } from "crypto";
import { presignStemGetUrl } from "./s3Presign.js";

// ── Startup env validation ──────────────────────────────────────────────────
const REQUIRED_ENV_WARNINGS = [];
if (!process.env.STRIPE_SECRET_KEY) REQUIRED_ENV_WARNINGS.push("STRIPE_SECRET_KEY (billing will not work)");
if (!process.env.CLERK_SECRET_KEY) REQUIRED_ENV_WARNINGS.push("CLERK_SECRET_KEY (auth will not work)");
if (!process.env.JOB_TOKEN_SECRET) REQUIRED_ENV_WARNINGS.push("JOB_TOKEN_SECRET (job tokens disabled — status/file endpoints are unprotected)");
if (REQUIRED_ENV_WARNINGS.length > 0 && process.env.NODE_ENV !== "test") {
  console.warn(`[startup] Missing env vars: ${REQUIRED_ENV_WARNINGS.join(", ")}`);
}

const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGINS || "http://localhost:5173,http://localhost:5174,http://localhost:3000").split(",").map((s) => s.trim());
const API_KEY = process.env.API_KEY || "";
const JOB_TOKEN_SECRET = process.env.JOB_TOKEN_SECRET || "";
const JOB_TOKEN_TTL_MS = Number(process.env.JOB_TOKEN_TTL_MS) || 60 * 60 * 1000; // 1 hour default
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 10;
/** Default age for GET /api/stems/cleanup when `maxAgeHours` query is omitted */
const STEM_CLEANUP_DEFAULT_MAX_AGE_HOURS = (() => {
  const raw = Number(process.env.STEM_CLEANUP_DEFAULT_MAX_AGE_HOURS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return 24;
})();

// ── Job token helpers (HMAC-SHA256, no external deps) ─────────────────────────
// Token format: "<jobId>.<expiresAt>.<hmac>" — all base64url encoded fields.

/**
 * Issue a signed job token for a given job_id.
 * @param {string} jobId
 * @returns {string}
 */
function issueJobToken(jobId) {
  const secret = process.env.JOB_TOKEN_SECRET || "";
  const ttl = Number(process.env.JOB_TOKEN_TTL_MS) || JOB_TOKEN_TTL_MS;
  const expiresAt = Date.now() + ttl;
  const payload = `${jobId}.${expiresAt}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/**
 * Verify a job token. Returns the jobId if valid, null otherwise.
 * @param {string} token
 * @param {string} secret
 * @returns {string | null} jobId
 */
function verifyJobToken(token, secret) {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [jobId, expiresAtStr, sig] = parts;
  if (!UUID_REGEX.test(jobId)) return null;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  const payload = `${jobId}.${expiresAtStr}`;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return jobId;
}

/**
 * Middleware: when JOB_TOKEN_SECRET is set, require a valid x-job-token header
 * (or ?token= query param) that matches the job_id.
 * Job id is resolved from: req.params.job_id → req.body.job_id → req.query.job_id
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
function jobTokenMiddleware(req, res, next) {
  const secret = process.env.JOB_TOKEN_SECRET || "";
  if (!secret) return next();
  const jobId = req.params.job_id || (req.body && req.body.job_id) || req.query.job_id;
  const token = req.headers["x-job-token"] || req.query.token;
  const verified = verifyJobToken(/** @type {string} */ (token), secret);
  if (!verified || verified !== jobId) {
    return res.status(401).json({ error: "Missing or invalid job token." });
  }
  next();
}

const rateLimitStore = new Map();

// Prune expired entries so the store does not grow unbounded.
const RATE_LIMIT_PRUNE_INTERVAL_MS = 2 * RATE_LIMIT_WINDOW_MS;
const rateLimitPruneInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) rateLimitStore.delete(ip);
  }
}, RATE_LIMIT_PRUNE_INTERVAL_MS);
// In test mode, avoid keeping the event loop alive just for pruning.
if (process.env.NODE_ENV === "test" && typeof rateLimitPruneInterval.unref === "function") {
  rateLimitPruneInterval.unref();
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const app = express();

// If behind a reverse proxy/load balancer, this ensures correct protocol detection.
app.set("trust proxy", 1);

const STEM_SERVICE_URL = process.env.STEM_SERVICE_URL || "http://localhost:5000";
// Must match stem_service OUTPUT_BASE (Python STEM_OUTPUT_DIR). Same path so GET /api/stems/file can serve files Python wrote.
const STEM_OUTPUT_DIR = path.resolve(process.env.STEM_OUTPUT_DIR || path.join(__dirname, "..", "tmp", "stems"));

app.use(helmet());

// Stripe webhook needs raw body — mount before express.json()
app.use("/api/billing/webhook", express.raw({ type: "application/json" }));

// Temp dir for streaming uploads (one file per request; cleaned after proxy).
const UPLOAD_TMP_DIR = path.join(os.tmpdir(), "burntbeats-upload");

// Path traversal hardening: allowlist only (Python uses UUID4 for job_id; stem ids are fixed set)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_STEM_IDS = new Set(["vocals", "drums", "bass", "other", "instrumental"]);

/**
 * @param {string} jobId
 * @param {string} stemIdParam
 * @returns {{ ok: boolean, stemId: string | null }}
 */
function validateStemFileParams(jobId, stemIdParam) {
  if (!jobId || !UUID_REGEX.test(jobId)) return { ok: false, stemId: null };
  const raw = stemIdParam.replace(/\.wav$/i, "");
  if (!raw || !ALLOWED_STEM_IDS.has(raw)) return { ok: false, stemId: null };
  return { ok: true, stemId: `${raw}.wav` };
}

app.use(cors({
  origin: FRONTEND_ORIGINS,
  credentials: true,
}));
app.use(express.json());
app.use(rateLimitMiddleware);

// Billing routes (Clerk auth + Stripe)
app.use("/api/billing", billingRouter);

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
/**
 * High-frequency routes (e.g. job status polling ~40/min) are excluded from the global cap.
 * Expensive endpoints remain protected; abuse is still bounded by auth / job tokens where applicable.
 * @param {import("express").Request} req
 */
function shouldSkipGlobalRateLimit(req) {
  if (req.method === "GET" && req.path.startsWith("/api/stems/status/")) return true;
  return false;
}

function rateLimitMiddleware(req, res, next) {
  if (shouldSkipGlobalRateLimit(req)) return next();
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const record = rateLimitStore.get(ip);
  if (!record || now > record.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }
  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({ error: "Too many requests. Please slow down." });
  }
  record.count++;
  next();
}

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
function authMiddleware(req, res, next) {
  const key = process.env.API_KEY || "";
  if (!key) return next();
  const providedKey = req.headers["x-api-key"];
  if (!providedKey || providedKey !== key) {
    return res.status(401).json({ error: "Unauthorized. Invalid or missing API key." });
  }
  next();
}

// Stream uploads to disk so we never hold a full large file in memory; proxy then streams from file to Python.
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => mkdir(UPLOAD_TMP_DIR, { recursive: true }).then(() => cb(null, UPLOAD_TMP_DIR)).catch(cb),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".wav";
      cb(null, `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    },
  }),
  limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES) || 500 * 1024 * 1024 },
});

// Time to wait for stem service to accept (202). Separation runs in background; frontend polls for completion.
const MAX_UPLOAD_MB = Math.round((Number(process.env.MAX_UPLOAD_BYTES) || 500 * 1024 * 1024) / (1024 * 1024));
// Time to wait for stem service to accept (202). Separation runs in background; frontend polls for completion.
const SPLIT_ACCEPT_TIMEOUT_MS = Number(process.env.SPLIT_ACCEPT_TIMEOUT_MS) || 5 * 60 * 1000;

app.post("/api/stems/split", authMiddleware, (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: `File too large. Maximum size is ${MAX_UPLOAD_MB}MB.` });
      }
      console.error("[POST /api/stems/split] multer error:", err.code || err.message);
      return res.status(400).json({ error: err.message || "Upload failed." });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    const ct = req.get("content-type") || "";
    console.warn("[POST /api/stems/split] 400: no file (field must be 'file'); Content-Type:", ct.slice(0, 50));
    return res.status(400).json({ error: "Missing file. Upload an audio file and use form field 'file'." });
  }
  const filePath = req.file.path;
  const stems = (req.body && req.body.stems) || "4";
  const quality = req.body && req.body.quality;

  /** @type {string | null} */
  let usageUserId = null;
  let usageCost = 0;
  if (isUsageTokensEnabled()) {
    try {
      usageUserId = await verifyClerkBearer(req);
      const durationSec = await getAudioDurationSeconds(filePath);
      usageCost = computeSplitCost(durationSec, quality, stems);
      await assertSufficientBalance(usageUserId, usageCost);
    } catch (e) {
      await unlinkPromise(filePath).catch(() => {});
      const status =
        e && typeof e === "object" && "status" in e && typeof /** @type {{ status?: number }} */ (e).status === "number"
          ? /** @type {{ status?: number }} */ (e).status
          : 500;
      const msg = e instanceof Error ? e.message : String(e);
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

  const stemUrl = new URL("/split", STEM_SERVICE_URL);
  const isHttps = stemUrl.protocol === "https:";
  const client = isHttps ? https : http;

  const reqAbort = new AbortController();
  try {
    const data = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reqAbort.abort();
        reject(new Error("TimeoutError"));
      }, SPLIT_ACCEPT_TIMEOUT_MS);
      const clearAndReject = (err) => {
        clearTimeout(timeout);
        reject(err);
      };

      const opts = {
        hostname: stemUrl.hostname,
        port: stemUrl.port || (isHttps ? 443 : 80),
        path: stemUrl.pathname + stemUrl.search,
        method: "POST",
        headers: form.getHeaders(),
        signal: reqAbort.signal,
      };

      const proxyReq = client.request(opts, (proxyRes) => {
        clearTimeout(timeout);
        const chunks = [];
        proxyRes.on("data", (d) => chunks.push(d));
        proxyRes.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf-8");
          try {
            const parsed = body ? JSON.parse(body) : {};
            if (proxyRes.statusCode >= 400) {
              let errMsg = body || proxyRes.statusMessage;
              try {
                const j = JSON.parse(body || "{}");
                if (j.detail != null) errMsg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
              } catch {
                /* use body as-is */
              }
              reject({ statusCode: proxyRes.statusCode, error: errMsg });
            } else {
              resolve({ statusCode: proxyRes.statusCode, data: parsed });
            }
          } catch (e) {
            reject(e);
          }
        });
        proxyRes.on("error", (err) => clearAndReject(err));
      });
      proxyReq.on("error", (err) => clearAndReject(err));
      form.pipe(proxyReq);
    });

    if (data.statusCode === 202) {
      const jobId = data.data.job_id;
      if (usageUserId && usageCost > 0) {
        try {
          await debitUsageTokens(usageUserId, usageCost);
        } catch (debitErr) {
          console.error("[POST /api/stems/split] usage debit failed:", debitErr);
        }
      }
      const response = { job_id: jobId, status: data.data.status ?? "accepted" };
      if (process.env.JOB_TOKEN_SECRET) response.job_token = issueJobToken(jobId);
      return res.status(202).json(response);
    }
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const d = data.data;
    d.stems = (d.stems || []).map((s) => ({
      id: s.id,
      url: `${baseUrl}/api/stems/file/${d.job_id}/${s.id}.wav`,
      path: s.path,
    }));
    res.json(d);
  } catch (e) {
    if (e && typeof e === "object" && "statusCode" in e && "error" in e) {
      console.warn("[POST /api/stems/split] stem service error:", e.statusCode, e.error);
      return res.status(e.statusCode).json({ error: e.error });
    }
    const err = e && typeof e === "object" ? e : { name: "", message: String(e) };
    console.error("[POST /api/stems/split] proxy error:", err.name, err.message, err.cause ?? "");
    const message =
      err.name === "TimeoutError" || err.message === "TimeoutError"
        ? "Stem service did not accept in time (check stem service is running)"
        : "Stem service unavailable (ensure stem service runs on port 5000; try STEM_SERVICE_URL=http://127.0.0.1:5000)";
    res.status(502).json({ error: message });
  } finally {
    unlink(filePath, (unlinkErr) => {
      if (unlinkErr) console.error("[POST /api/stems/split] cleanup temp file:", unlinkErr.message);
    });
  }
});

app.get("/api/stems/status/:job_id", authMiddleware, jobTokenMiddleware, (req, res) => {
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
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  // When job tokens are active, embed the token in stem URLs so <audio src> works without custom headers
  const tokenSuffix = process.env.JOB_TOKEN_SECRET ? `?token=${encodeURIComponent(req.headers["x-job-token"] || "")}` : "";
  if (data.stems && Array.isArray(data.stems)) {
    data.stems = data.stems.map((s) => ({
      id: s.id,
      url: `${baseUrl}/api/stems/file/${job_id}/${s.id}.wav${tokenSuffix}`,
      path: s.path,
    }));
  }
  res.json(data);
});

app.post("/api/stems/expand", authMiddleware, jobTokenMiddleware, async (req, res) => {
  const jobId = (req.body && req.body.job_id) || req.query.job_id;
  if (!jobId || !UUID_REGEX.test(jobId)) {
    return res.status(400).json({ error: "Invalid or missing job_id. Provide the 2-stem job id to expand." });
  }
  const quality = (req.body && req.body.quality) || req.query.quality;

  /** @type {string | null} */
  let usageUserId = null;
  let usageCost = 0;
  if (isUsageTokensEnabled()) {
    try {
      usageUserId = await verifyClerkBearer(req);
      const inputPath = findJobInputPath(path.join(STEM_OUTPUT_DIR, jobId));
      if (!inputPath) {
        return res.status(400).json({ error: "Source job input not found for expand." });
      }
      const durationSec = await getAudioDurationSeconds(inputPath);
      usageCost = computeExpandCost(durationSec, quality);
      await assertSufficientBalance(usageUserId, usageCost);
    } catch (e) {
      const status =
        e && typeof e === "object" && "status" in e && typeof /** @type {{ status?: number }} */ (e).status === "number"
          ? /** @type {{ status?: number }} */ (e).status
          : 500;
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(status).json({ error: msg });
    }
  }

  const stemUrl = new URL("/expand", STEM_SERVICE_URL);
  const isHttps = stemUrl.protocol === "https:";
  const client = isHttps ? https : http;
  const form = new FormData();
  form.append("job_id", jobId);
  if (quality) form.append("quality", quality);
  try {
    const data = await new Promise((resolve, reject) => {
      const opts = {
        hostname: stemUrl.hostname,
        port: stemUrl.port || (isHttps ? 443 : 80),
        path: stemUrl.pathname + stemUrl.search,
        method: "POST",
        headers: form.getHeaders(),
      };
      const proxyReq = client.request(opts, (proxyRes) => {
        const chunks = [];
        proxyRes.on("data", (d) => chunks.push(d));
        proxyRes.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf-8");
          try {
            const parsed = body ? JSON.parse(body) : {};
            if (proxyRes.statusCode >= 400) {
              const errMsg = parsed.detail || body || proxyRes.statusMessage;
              reject({ statusCode: proxyRes.statusCode, error: errMsg });
            } else {
              resolve({ statusCode: proxyRes.statusCode, data: parsed });
            }
          } catch (e) {
            reject(e);
          }
        });
        proxyReq.on("error", (err) => reject(err));
      });
      form.pipe(proxyReq);
    });
    if (data.statusCode === 202) {
      const newJobId = data.data.job_id;
      if (usageUserId && usageCost > 0) {
        try {
          await debitUsageTokens(usageUserId, usageCost);
        } catch (debitErr) {
          console.error("[POST /api/stems/expand] usage debit failed:", debitErr);
        }
      }
      const response = { job_id: newJobId, status: data.data.status ?? "accepted" };
      if (process.env.JOB_TOKEN_SECRET) response.job_token = issueJobToken(newJobId);
      return res.status(202).json(response);
    }
    return res.status(data.statusCode).json(data.data);
  } catch (e) {
    if (e && typeof e === "object" && "statusCode" in e && "error" in e) {
      return res.status(e.statusCode).json({ error: e.error });
    }
    console.error("[POST /api/stems/expand] proxy error:", e);
    return res.status(502).json({ error: "Stem service unavailable" });
  }
});

// Optional server-side master export (FFmpeg / mastering). Default app behavior is client-side export.
// When disabled: 404. When enabled: renders server-side master WAV via stem_service.
app.post("/api/stems/server-export", authMiddleware, async (req, res) => {
  const enabled = ["1", "true", "yes"].includes((process.env.SERVER_EXPORT_ENABLED || "").toLowerCase());
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
    return res.status(400).json({ error: "Invalid or missing job_id (UUID)." });
  }

  const uploadNameRaw = typeof body.upload_name === "string" && body.upload_name ? body.upload_name : "upload";
  const uploadBaseName = uploadNameRaw.replace(/\.[^/.]+$/, "");

  const normalize = body.normalize === undefined ? true : !!body.normalize;

  const stemStates = (body.stem_states && typeof body.stem_states === "object" ? /** @type {any} */ (body.stem_states) : {}) || {};
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
    return res.status(400).json({ error: "No audible stems to export (all muted or missing stem state)." });
  }

  const stemStatesSubset = {};
  for (const id of stemsToMix) {
    if (stemStates?.[id]) stemStatesSubset[id] = stemStates[id];
  }

  // Charge usage tokens when enabled (same minute-basis as split/expand).
  let usageUserId = null;
  let usageCost = 0;
  if (isUsageTokensEnabled()) {
    try {
      usageUserId = await verifyClerkBearer(req);
      const inputPath = findJobInputPath(path.join(STEM_OUTPUT_DIR, jobId));
      if (!inputPath) {
        return res.status(400).json({ error: "Source input for job not found (cannot compute export cost)." });
      }
      const durationSec = await getAudioDurationSeconds(inputPath);
      usageCost = computeServerExportCost(durationSec);
      await assertSufficientBalance(usageUserId, usageCost);
    } catch (e) {
      const status =
        e && typeof e === "object" && "status" in e && typeof /** @type {{ status?: number }} */ (e).status === "number"
          ? /** @type {{ status?: number }} */ (e).status
          : 500;
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(status).json({ error: msg });
    }
  }

  const exportTmpDir = path.join(os.tmpdir(), "burntbeats-server-export");
  await mkdir(exportTmpDir, { recursive: true });

  const exportId = randomUUID();
  const exportOutPath = path.join(exportTmpDir, `${exportId}.wav`);
  const pyScriptPath = path.join(__dirname, "..", "stem_service", "server_export.py");

  /** @type {{ stem_ids: string[], stem_states: Record<string, any>, normalize: boolean }} */
  const pythonPayload = { stem_ids: stemsToMix, stem_states: stemStatesSubset, normalize };

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
    child.stderr.on("data", (d) => { stderrText += d; });

    child.stdin.write(JSON.stringify(pythonPayload));
    child.stdin.end();

    const exitCode = await new Promise((resolve) => {
      child.on("close", (code) => resolve(code ?? 1));
    });

    if (exitCode !== 0) {
      return res.status(500).json({
        error: "Server export render failed",
        detail: stderrText ? stderrText.split("\n").slice(-30).join("\n") : undefined,
      });
    }

    if (!existsSync(exportOutPath)) {
      return res.status(500).json({ error: "Server export completed but output file was not produced." });
    }

    if (usageUserId && usageCost > 0) {
      try {
        await debitUsageTokens(usageUserId, usageCost);
      } catch (debitErr) {
        console.error("[POST /api/stems/server-export] usage debit failed:", debitErr);
      }
    }

    const downloadName = `${uploadBaseName}_master.wav`;
    res.setHeader("Content-Type", "audio/wav");
    return res.download(exportOutPath, downloadName, (err) => {
      // Best-effort cleanup of temp export file.
      unlink(exportOutPath, () => {});
      if (err) console.error("[POST /api/stems/server-export] download error:", err.message);
    });
  } catch (e) {
    try { unlink(exportOutPath, () => {}); } catch { /* ignore */ }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/stems/server-export] render exception:", msg);
    return res.status(500).json({ error: "Server export failed", detail: msg });
  }
});

app.delete("/api/stems/:job_id", authMiddleware, async (req, res) => {
  const { job_id } = req.params;
  if (!job_id || !UUID_REGEX.test(job_id)) {
    return res.status(400).json({ error: "Invalid job_id" });
  }
  try {
    const r = await fetch(`${STEM_SERVICE_URL}/split/${job_id}`, {
      method: "DELETE",
    });
    const contentType = r.headers.get("content-type") || "";
    const hasJson = r.ok && contentType.includes("application/json");
    const data = hasJson && r.status !== 204 ? await r.json() : {};
    return res.status(r.status).json(Object.keys(data).length ? data : { deleted: true });
  } catch (e) {
    console.error("[DELETE /api/stems/:job_id] proxy error:", e);
    return res.status(502).json({ error: "Stem service unavailable" });
  }
});

app.get("/api/stems/file/:job_id/:stemId", authMiddleware, jobTokenMiddleware, async (req, res) => {
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
      const key = s3 && s3.keys && typeof s3.keys === "object" ? s3.keys[stemBase] : null;
      if (key && s3.bucket) {
        const url = await presignStemGetUrl(s3.bucket, key, s3.region);
        return res.redirect(302, url);
      }
    } catch (e) {
      console.warn("[GET /api/stems/file] S3 presign failed, trying disk:", e instanceof Error ? e.message : e);
    }
  }
  const filePath = path.join(STEM_OUTPUT_DIR, job_id, "stems", validated.stemId);
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "Stem file not found" });
  }
  res.setHeader("Content-Type", "audio/wav");
  const stream = createReadStream(filePath);
  stream.on("error", (err) => {
    if (!res.headersSent) res.status(500).json({ error: "Failed to read stem file" });
    else res.destroy();
    console.error("[GET /api/stems/file] stream error:", err.message);
  });
  stream.pipe(res);
});

app.get("/api/stems/cleanup", authMiddleware, async (req, res) => {
  // Cleanup is a destructive operation — require API_KEY to be configured
  if (!process.env.API_KEY) {
    return res.status(503).json({ error: "Cleanup endpoint requires API_KEY to be configured." });
  }
  const maxAgeHours = Math.max(0, Number(req.query.maxAgeHours) || STEM_CLEANUP_DEFAULT_MAX_AGE_HOURS);
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
      const uploadEntries = readdirSync(UPLOAD_TMP_DIR, { withFileTypes: true });
      for (const ent of uploadEntries) {
        if (!ent.isFile() || !ent.name.startsWith("upload-")) continue;
        const filePath = path.join(UPLOAD_TMP_DIR, ent.name);
        const stat = statSync(filePath);
        if (stat.mtime.getTime() < cutoff) {
          try {
            await unlinkPromise(filePath);
            deleted++;
          } catch (err) {
            console.error("[cleanup] Failed to delete orphaned temp file:", err.message);
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
});

app.get("/api/health", (req, res) => {
  const payload = { status: "ok", rate_limited: !!process.env.API_KEY };
  if (process.env.NODE_ENV !== "production") {
    payload.stem_output_dir = STEM_OUTPUT_DIR;
  }
  res.json(payload);
});

const PORT = Number(process.env.PORT) || 3001;
let server;

async function main() {
  await mkdir(STEM_OUTPUT_DIR, { recursive: true });
  await mkdir(UPLOAD_TMP_DIR, { recursive: true });
  server = app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
    console.log(`STEM_SERVICE_URL=${STEM_SERVICE_URL} STEM_OUTPUT_DIR=${STEM_OUTPUT_DIR}`);
    console.log(`CORS allowed origins: ${FRONTEND_ORIGINS.join(", ")}`);
    if (API_KEY) console.log("API key authentication: ENABLED");
    if (JOB_TOKEN_SECRET) console.log("Job token authentication: ENABLED");
  });
  server.on("error", (err) => {
    console.error("Server error:", err);
    process.exit(1);
  });
}

function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  if (server) {
    server.close(() => {
      console.log("HTTP server closed.");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

// Tests set NODE_ENV=test and/or BACKEND_SKIP_START=1 so importing server.js does not bind a port.
const shouldAutoStartServer =
  process.env.NODE_ENV !== "test" && process.env.BACKEND_SKIP_START !== "1";

if (shouldAutoStartServer) {
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
