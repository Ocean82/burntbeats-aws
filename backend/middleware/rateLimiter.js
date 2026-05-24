// @ts-check
import { createRedisRateLimiter } from "../lib/redisRateLimiter.js";

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

/**
 * High-frequency routes (e.g. job status polling ~40/min) are excluded from the global cap.
 * Expensive endpoints remain protected; abuse is still bounded by auth / job tokens where applicable.
 * @param {import("express").Request} req
 * @returns {boolean}
 */
function shouldSkipGlobalRateLimit(req) {
  if (req.method === "GET" && req.path.startsWith("/api/stems/status/"))
    return true;
  if (req.method === "GET" && req.path === "/api/stems/cleanup") return true;
  if (req.method === "GET" && req.path === "/api/midi/cleanup") return true;
  return false;
}

// Redis-backed rate limiter instance (lazy — only active when REDIS_URL is set).
const redisGlobalLimiter = createRedisRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  maxRequests: RATE_LIMIT_MAX_REQUESTS,
  keyPrefix: "rl:global",
});

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export async function rateLimitMiddleware(req, res, next) {
  if (shouldSkipGlobalRateLimit(req)) return next();
  const ip = req.ip || req.socket.remoteAddress || "unknown";

  // Try Redis-backed limiter first (returns allowed:true if Redis unavailable)
  const redisResult = await redisGlobalLimiter(ip);
  if (!redisResult.allowed) {
    res.set("Retry-After", String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)));
    return res
      .status(429)
      .json({ error: "Too many requests. Please slow down." });
  }

  // In-memory fallback (always runs as secondary protection for single-instance)
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
export function stemFileRateLimitMiddleware(req, res, next) {
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
export function serverExportRateLimitMiddleware(req, res, next) {
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
