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
import { clerkWebhookRouter } from "./clerkWebhook.js";
import { emailRouter } from "./email-routes.js";
import { verifyClerkBearer, getClerkClient } from "./clerkAuth.js";
import {
  computeExpandCost,
  computeServerExportCost,
  computeSplitCost,
  findJobInputPath,
  getAudioDurationSeconds,
  isUsageTokensEnabled,
  refundUsageTokens,
  reserveUsageTokens,
} from "./usageTokens.js";
import { createHmac, timingSafeEqual, randomUUID } from "crypto";
import { presignStemGetUrl } from "./s3Presign.js";
import { scanUploadedFile } from "./malwareScan.js";
import { verifyUploadMatchesExtension } from "./uploadSniff.js";
import {
  publicErrorMessage,
  sanitizedProxyClientError,
} from "./clientSafeError.js";
import { getAllowedOriginSet } from "./allowedOrigins.js";

// ── Startup env validation ──────────────────────────────────────────────────
const REQUIRED_ENV_WARNINGS = [];
if (!process.env.STRIPE_SECRET_KEY)
  REQUIRED_ENV_WARNINGS.push("STRIPE_SECRET_KEY (billing will not work)");
if (!process.env.CLERK_SECRET_KEY)
  REQUIRED_ENV_WARNINGS.push("CLERK_SECRET_KEY (auth will not work)");
if (!process.env.JOB_TOKEN_SECRET)
  REQUIRED_ENV_WARNINGS.push(
    "JOB_TOKEN_SECRET (job tokens disabled — status/file endpoints are unprotected)",
  );
const ALLOW_UNMETERED_PROD = ["1", "true", "yes"].includes(
  (process.env.ALLOW_UNMETERED_PROD || "").toLowerCase(),
);
if (
  process.env.NODE_ENV === "production" &&
  !ALLOW_UNMETERED_PROD &&
  !isUsageTokensEnabled()
) {
  REQUIRED_ENV_WARNINGS.push(
    "USAGE_TOKENS_ENABLED=1 (metered paywall enforcement)",
  );
}
if (REQUIRED_ENV_WARNINGS.length > 0 && process.env.NODE_ENV !== "test") {
  if (process.env.NODE_ENV === "production") {
    console.error(
      `[startup] FATAL: Missing required env vars in production: ${REQUIRED_ENV_WARNINGS.join(", ")}`,
    );
    process.exit(1);
  }
  console.warn(
    `[startup] Missing env vars: ${REQUIRED_ENV_WARNINGS.join(", ")}`,
  );
}

const API_KEY = process.env.API_KEY || "";
const JOB_TOKEN_SECRET = process.env.JOB_TOKEN_SECRET || "";
const STEM_SERVICE_API_TOKEN = process.env.STEM_SERVICE_API_TOKEN || "";
const JOB_TOKEN_TTL_MS = Number(process.env.JOB_TOKEN_TTL_MS) || 60 * 60 * 1000; // 1 hour default
const RATE_LIMIT_WINDOW_MS =
  Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS =
  Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 10;
const STEM_FILE_RATE_LIMIT_WINDOW_MS =
  Number(process.env.STEM_FILE_RATE_LIMIT_WINDOW_MS) || 60 * 1000;
const STEM_FILE_RATE_LIMIT_MAX_REQUESTS =
  Number(process.env.STEM_FILE_RATE_LIMIT_MAX_REQUESTS) || 30;
const SERVER_EXPORT_RATE_LIMIT_WINDOW_MS =
  Number(process.env.SERVER_EXPORT_RATE_LIMIT_WINDOW_MS) || 60 * 1000;
const SERVER_EXPORT_RATE_LIMIT_MAX_REQUESTS =
  Number(process.env.SERVER_EXPORT_RATE_LIMIT_MAX_REQUESTS) || 4;
/** Default age for cleanup endpoint when `maxAgeHours` query is omitted */
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
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return jobId;
}

/**
 * Middleware: when JOB_TOKEN_SECRET is set, require a valid x-job-token header
 * that matches the job_id (never accept tokens in the query string — URLs leak via Referer/logs).
 * Job id is resolved from: req.params.job_id → req.body.job_id
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
function jobTokenMiddleware(req, res, next) {
  const secret = process.env.JOB_TOKEN_SECRET || "";
  if (!secret) return next();
  const jobId = req.params.job_id || (req.body && req.body.job_id);
  const token = req.headers["x-job-token"];
  const verified = verifyJobToken(/** @type {string} */ (token), secret);
  if (!verified || verified !== jobId) {
    return res.status(401).json({ error: "Missing or invalid job token." });
  }
  next();
}

const rateLimitStore = new Map();
const stemFileRateLimitStore = new Map();
const serverExportRateLimitStore = new Map();

// Prune expired entries so the store does not grow unbounded.
const RATE_LIMIT_PRUNE_INTERVAL_MS = 2 * RATE_LIMIT_WINDOW_MS;
const rateLimitPruneInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) rateLimitStore.delete(ip);
  }
  for (const [key, record] of stemFileRateLimitStore.entries()) {
    if (now > record.resetTime) stemFileRateLimitStore.delete(key);
  }
  for (const [key, record] of serverExportRateLimitStore.entries()) {
    if (now > record.resetTime) serverExportRateLimitStore.delete(key);
  }
}, RATE_LIMIT_PRUNE_INTERVAL_MS);
// In test mode, avoid keeping the event loop alive just for pruning.
if (
  process.env.NODE_ENV === "test" &&
  typeof rateLimitPruneInterval.unref === "function"
) {
  rateLimitPruneInterval.unref();
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const app = express();

// If behind a reverse proxy/load balancer, this ensures correct protocol detection.
app.set("trust proxy", 1);

/**
 * Get the correct base URL protocol for the current request.
 * Handles cases where the app is behind a reverse proxy/load balancer.
 * When TLS terminates before Node (e.g. ALB → nginx on HTTP), `X-Forwarded-Proto`
 * can be wrong if nginx sets it from `$scheme` only — set PUBLIC_BASE_URL in production.
 */
function getBaseUrl(req) {
  const fixed = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  if (fixed) return fixed;
  const proto = req.get("x-forwarded-proto") || req.protocol;
  const host = req.get("host") || "burntbeats.com";
  return `${proto}://${host}`;
}

const STEM_SERVICE_URL =
  process.env.STEM_SERVICE_URL || "http://localhost:5000";
// Must match stem_service OUTPUT_BASE (Python STEM_OUTPUT_DIR). Same path so GET /api/stems/file can serve files Python wrote.
const STEM_OUTPUT_DIR = path.resolve(
  process.env.STEM_OUTPUT_DIR || path.join(__dirname, "..", "tmp", "stems"),
);

app.use(helmet());

// ── Request logging ──────────────────────────────────────────────────────────
// Minimal structured request log: method, path, status, duration, ip.
// Skips high-frequency status polling to keep logs readable.
app.use((req, res, next) => {
  if (req.method === "GET" && req.path.startsWith("/api/stems/status/"))
    return next();
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const ip = req.ip || req.socket?.remoteAddress || "-";
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${ms}ms ip=${ip}`,
    );
  });
  next();
});

// Stripe webhook needs raw body — mount before express.json()
app.use("/api/billing/webhook", express.raw({ type: "application/json" }));
// Clerk webhook needs raw body for Svix signature verification.
app.use("/api/clerk/webhook", express.raw({ type: "application/json" }));

// Temp dir for streaming uploads (one file per request; cleaned after proxy).
const UPLOAD_TMP_DIR = path.join(os.tmpdir(), "burntbeats-upload");

// Path traversal hardening: allowlist only (Python uses UUID4 for job_id; stem ids are fixed set)
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_STEM_IDS = new Set([
  "vocals",
  "drums",
  "bass",
  "other",
  "instrumental",
]);

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

app.use(
  cors({
    origin(origin, callback) {
      const allowed = getAllowedOriginSet();
      if (!origin) {
        // Non-browser clients (curl, supertest) omit Origin; same-origin navigations may too.
        return callback(null, true);
      }
      try {
        const o = new URL(origin).origin;
        if (allowed.has(o)) return callback(null, true);
      } catch {
        return callback(null, false);
      }
      console.warn("[cors] blocked origin:", origin);
      return callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(rateLimitMiddleware);

// Billing routes (Clerk auth + Stripe)
app.use("/api/email", emailRouter);
app.use("/api/billing", billingRouter);
app.use("/api/clerk", clerkWebhookRouter);

// ── Legal acceptance (one-time gate) ─────────────────────────────────────────
const LEGAL_TOS_VERSION = process.env.LEGAL_TOS_VERSION || "2025-01";
const LEGAL_PRIVACY_VERSION = process.env.LEGAL_PRIVACY_VERSION || "2025-01";

app.post("/api/legal/accept", async (req, res) => {
  try {
    const userId = await verifyClerkBearer(req);
    const clerk = getClerkClient();
    if (!clerk) return res.status(503).json({ error: "Auth not configured" });

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const tosVersion =
      typeof body.tosVersion === "string" && body.tosVersion
        ? body.tosVersion
        : "";
    const privacyVersion =
      typeof body.privacyVersion === "string" && body.privacyVersion
        ? body.privacyVersion
        : "";
    if (tosVersion !== LEGAL_TOS_VERSION || privacyVersion !== LEGAL_PRIVACY_VERSION) {
      return res.status(400).json({
        error: "Invalid legal document version.",
      });
    }

    const u = await clerk.users.getUser(userId);
    const existing = (u && u.publicMetadata && typeof u.publicMetadata === "object")
      ? u.publicMetadata
      : {};
    const next = {
      ...existing,
      legalAccepted: {
        tosVersion: LEGAL_TOS_VERSION,
        privacyVersion: LEGAL_PRIVACY_VERSION,
        acceptedAt: new Date().toISOString(),
      },
    };
    await clerk.users.updateUser(userId, { publicMetadata: next });
    return res.json({ ok: true });
  } catch (e) {
    const status =
      e && typeof e === "object" && "status" in e && typeof e.status === "number"
        ? e.status
        : 401;
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return res.status(status).json({ error: msg });
  }
});

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
  if (req.method === "GET" && req.path.startsWith("/api/stems/status/"))
    return true;
  if (req.method === "GET" && req.path === "/api/stems/cleanup")
    return true;
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
    res.set("Retry-After", String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)));
    return res
      .status(429)
      .json({ error: "Too many requests. Please slow down." });
  }
  record.count++;
  next();
}

/**
 * Stricter throttle for stem file GETs. Keyed by IP + job_id to allow normal playback/download
 * while preventing repeated export-click spam from saturating disk/network.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
function stemFileRateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const jobId = req.params.job_id || "unknown";
  const key = `${ip}|${jobId}`;
  const now = Date.now();
  const record = stemFileRateLimitStore.get(key);
  if (!record || now > record.resetTime) {
    stemFileRateLimitStore.set(key, {
      count: 1,
      resetTime: now + STEM_FILE_RATE_LIMIT_WINDOW_MS,
    });
    return next();
  }
  if (record.count >= STEM_FILE_RATE_LIMIT_MAX_REQUESTS) {
    res.set(
      "Retry-After",
      String(Math.ceil(STEM_FILE_RATE_LIMIT_WINDOW_MS / 1000)),
    );
    return res.status(429).json({
      error: "Too many stem file downloads. Please wait and try again.",
    });
  }
  record.count++;
  next();
}

/**
 * Expensive server-export endpoint throttle. Keyed by IP + user id when available.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
function serverExportRateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const jobId =
    req.body &&
    typeof req.body === "object" &&
    typeof req.body.job_id === "string" &&
    req.body.job_id.length > 0
      ? req.body.job_id
      : "unknown-job";
  const key = `${ip}|${jobId}`;
  const now = Date.now();
  const record = serverExportRateLimitStore.get(key);
  if (!record || now > record.resetTime) {
    serverExportRateLimitStore.set(key, {
      count: 1,
      resetTime: now + SERVER_EXPORT_RATE_LIMIT_WINDOW_MS,
    });
    return next();
  }
  if (record.count >= SERVER_EXPORT_RATE_LIMIT_MAX_REQUESTS) {
    res.set(
      "Retry-After",
      String(Math.ceil(SERVER_EXPORT_RATE_LIMIT_WINDOW_MS / 1000)),
    );
    return res.status(429).json({
      error: "Too many export requests. Please wait and try again.",
    });
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
    return res
      .status(401)
      .json({ error: "Unauthorized. Invalid or missing API key." });
  }
  next();
}

/**
 * Enforce Clerk auth before upload/scanning work when metered tokens are enabled.
 * This prevents unauthenticated clients from consuming upload/malware-scan resources.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
async function requireUsageAuthPreUpload(req, res, next) {
  if (!isUsageTokensEnabled()) return next();
  try {
    const userId = await verifyClerkBearer(req);
    /** @type {any} */ (req)._usageUserId = userId;
    return next();
  } catch (e) {
    const status =
      e &&
      typeof e === "object" &&
      "status" in e &&
      typeof (/** @type {{ status?: number }} */ (e).status) === "number"
        ? /** @type {{ status?: number }} */ (e).status
        : 401;
    const raw = e instanceof Error ? e.message : "Missing auth token";
    const fallback =
      status === 401 ? "Unauthorized" : "Unable to verify your account.";
    const msg = publicErrorMessage(
      raw,
      fallback,
      "[requireUsageAuthPreUpload]",
    );
    return res.status(status).json({ error: msg });
  }
}

/**
 * Attach stem-service auth header when token protection is enabled.
 * @param {Record<string, string>} headers
 * @returns {Record<string, string>}
 */
function withStemServiceAuthHeader(headers) {
  if (!STEM_SERVICE_API_TOKEN) return headers;
  return { ...headers, "X-Stem-Service-Token": STEM_SERVICE_API_TOKEN };
}

/**
 * @param {unknown} e
 * @returns {e is { statusCode: number, error: string }}
 */
function isProxyHttpError(e) {
  return !!(
    e &&
    typeof e === "object" &&
    "statusCode" in e &&
    "error" in e &&
    typeof (/** @type {{ statusCode?: unknown }} */ (e).statusCode) ===
      "number" &&
    typeof (/** @type {{ error?: unknown }} */ (e).error) === "string"
  );
}

/**
 * @param {string} body
 * @param {string | undefined} fallback
 * @returns {string}
 */
function extractProxyErrorMessage(body, fallback) {
  let errMsg = body || fallback || "Upstream request failed";
  try {
    const j = JSON.parse(body || "{}");
    if (j.detail != null)
      errMsg =
        typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
  } catch {
    /* use body/fallback as-is */
  }
  return errMsg;
}

/**
 * Send multipart/form-data request to stem service and parse JSON response.
 * @param {string} endpointPath
 * @param {FormData} form
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ statusCode: number, data: any }>}
 */
function proxyFormRequest(endpointPath, form, options = {}) {
  const stemUrl = new URL(endpointPath, STEM_SERVICE_URL);
  const isHttps = stemUrl.protocol === "https:";
  const client = isHttps ? https : http;
  const reqAbort = new AbortController();

  return new Promise((resolve, reject) => {
    /** @type {NodeJS.Timeout | null} */
    let timeout = null;
    if (options.timeoutMs && options.timeoutMs > 0) {
      timeout = setTimeout(() => {
        reqAbort.abort();
        reject(new Error("TimeoutError"));
      }, options.timeoutMs);
    }

    const clearTimeoutIfSet = () => {
      if (timeout) clearTimeout(timeout);
    };

    const opts = {
      hostname: stemUrl.hostname,
      port: stemUrl.port || (isHttps ? 443 : 80),
      path: stemUrl.pathname + stemUrl.search,
      method: "POST",
      headers: withStemServiceAuthHeader(form.getHeaders()),
      signal: reqAbort.signal,
    };

    const proxyReq = client.request(opts, (proxyRes) => {
      clearTimeoutIfSet();
      const chunks = [];
      proxyRes.on("data", (d) => chunks.push(d));
      proxyRes.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf-8");
        try {
          const parsed = body ? JSON.parse(body) : {};
          if ((proxyRes.statusCode || 500) >= 400) {
            reject({
              statusCode: proxyRes.statusCode || 500,
              error: extractProxyErrorMessage(body, proxyRes.statusMessage),
            });
          } else {
            resolve({ statusCode: proxyRes.statusCode || 200, data: parsed });
          }
        } catch (e) {
          reject(e);
        }
      });
      proxyRes.on("error", (err) => {
        clearTimeoutIfSet();
        reject(err);
      });
    });

    proxyReq.on("error", (err) => {
      clearTimeoutIfSet();
      reject(err);
    });

    form.pipe(proxyReq);
  });
}

// Stream uploads to disk (multer → UPLOAD_TMP_DIR under os.tmpdir(), see below), not whole-file RAM buffering.
// Files are deleted after the split request finishes (success or error). S3 is used only for completed stem outputs when configured.
const ALLOWED_AUDIO_MIMES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/flac",
  "audio/x-flac",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/x-aac",
  "video/mp4", // some encoders tag m4a as video/mp4
]);
const ALLOWED_AUDIO_EXTS = new Set([
  ".mp3",
  ".wav",
  ".flac",
  ".ogg",
  ".m4a",
  ".aac",
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) =>
      mkdir(UPLOAD_TMP_DIR, { recursive: true })
        .then(() => cb(null, UPLOAD_TMP_DIR))
        .catch(cb),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".wav";
      cb(
        null,
        `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`,
      );
    },
  }),
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_BYTES) || 500 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (
      !ALLOWED_AUDIO_EXTS.has(ext) ||
      !ALLOWED_AUDIO_MIMES.has(file.mimetype)
    ) {
      return cb(
        Object.assign(
          new Error(
            "Only audio files are accepted (mp3, wav, flac, ogg, m4a, aac).",
          ),
          { code: "INVALID_FILE_TYPE" },
        ),
      );
    }
    cb(null, true);
  },
});

const MAX_UPLOAD_MB = Math.round(
  (Number(process.env.MAX_UPLOAD_BYTES) || 500 * 1024 * 1024) / (1024 * 1024),
);
// Time to wait for stem service to accept (202). Separation runs in background; frontend polls for completion.
const SPLIT_ACCEPT_TIMEOUT_MS =
  Number(process.env.SPLIT_ACCEPT_TIMEOUT_MS) || 5 * 60 * 1000;

app.post(
  "/api/stems/split",
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
      return res
        .status(400)
        .json({
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
    if (isUsageTokensEnabled()) {
      try {
        usageUserId =
          /** @type {any} */ (req)._usageUserId ||
          (await verifyClerkBearer(req));
        const durationSec = await getAudioDurationSeconds(filePath);
        usageCost = computeSplitCost(durationSec, quality, stems);
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

    try {
      const data = await proxyFormRequest("/split", form, {
        timeoutMs: SPLIT_ACCEPT_TIMEOUT_MS,
      });

      if (data.statusCode === 202) {
        const jobId = data.data.job_id;
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

app.get(
  "/api/stems/status/:job_id",
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
    res.json(data);
  },
);

app.post(
  "/api/stems/expand",
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
    if (isUsageTokensEnabled()) {
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

// Optional server-side master export (FFmpeg / mastering). Default app behavior is client-side export.
// When disabled: 404. When enabled: renders server-side master WAV via stem_service.
app.post(
  "/api/stems/server-export",
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
    return res.status(400).json({ error: "Invalid or missing job_id (UUID)." });
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
          error: "Source input for job not found (cannot compute export cost).",
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

app.delete("/api/stems/:job_id", authMiddleware, async (req, res) => {
  const { job_id } = req.params;
  if (!job_id || !UUID_REGEX.test(job_id)) {
    return res.status(400).json({ error: "Invalid job_id" });
  }
  try {
    const r = await fetch(`${STEM_SERVICE_URL}/split/${job_id}`, {
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

app.get(
  "/api/stems/file/:job_id/:stemId",
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

app.post("/api/stems/cleanup", authMiddleware, runStemsCleanup);

// Deprecated: cleanup is destructive, so GET is intentionally not allowed.
app.get("/api/stems/cleanup", authMiddleware, (req, res) => {
  return res.status(405).json({
    error:
      "Method Not Allowed. Use POST /api/stems/cleanup for destructive cleanup.",
  });
});

app.get("/api/health", (req, res) => {
  const payload = { status: "ok", rate_limited: !!process.env.API_KEY };
  res.json(payload);
});

// ── Global error handler ────────────────────────────────────────────────────
// Must be 4-param to be recognised by Express as an error handler.
// Catches any error passed via next(err) or thrown synchronously in a route.
app.use((err, req, res, _next) => {
  console.error("[unhandled error]", err?.message || err);
  if (res.headersSent) return;
  res.status(err?.status || 500).json({ error: "Internal server error" });
});

const PORT = Number(process.env.PORT) || 3001;
let server;

async function main() {
  await mkdir(STEM_OUTPUT_DIR, { recursive: true });
  await mkdir(UPLOAD_TMP_DIR, { recursive: true });
  server = app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
    console.log(
      `STEM_SERVICE_URL=${STEM_SERVICE_URL} STEM_OUTPUT_DIR=${STEM_OUTPUT_DIR}`,
    );
    console.log(
      `CORS allowed origins: ${[...getAllowedOriginSet()].join(", ")}`,
    );
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

  // Catch unhandled promise rejections (e.g. Redis reconnect, background timers).
  process.on("unhandledRejection", (reason) => {
    console.error("[unhandledRejection]", reason);
  });

  // Catch synchronous exceptions that escape all handlers.
  process.on("uncaughtException", (err) => {
    console.error("[uncaughtException]", err);
    process.exit(1);
  });

  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
