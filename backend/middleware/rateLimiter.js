// @ts-check
import { createRedisRateLimiter } from "../lib/redisRateLimiter.js";
import { createMemoryRateLimitStore } from "../lib/memoryRateLimitStore.js";
import { getRedis } from "../lib/redisClient.js";

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

const globalMemoryStore = createMemoryRateLimitStore({ name: "global" });
const stemFileMemoryStore = createMemoryRateLimitStore({ name: "stem-file" });
const serverExportMemoryStore = createMemoryRateLimitStore({
  name: "server-export",
});

const RATE_LIMIT_PRUNE_INTERVAL_MS = 2 * RATE_LIMIT_WINDOW_MS;
const rateLimitPruneInterval = setInterval(() => {
  globalMemoryStore.pruneAll();
  stemFileMemoryStore.pruneAll();
  serverExportMemoryStore.pruneAll();
}, RATE_LIMIT_PRUNE_INTERVAL_MS);
if (
  process.env.NODE_ENV === "test" &&
  typeof rateLimitPruneInterval.unref === "function"
) {
  rateLimitPruneInterval.unref();
}

/**
 * @param {import("express").Request} req
 * @returns {boolean}
 */
export function shouldSkipGlobalRateLimit(req) {
  if (req.method === "GET" && req.path.startsWith("/api/stems/status/"))
    return true;
  if (req.method === "GET" && req.path.startsWith("/api/midi/status/"))
    return true;
  if (req.method === "GET" && req.path === "/api/stems/cleanup") return true;
  if (req.method === "GET" && req.path === "/api/midi/cleanup") return true;
  return false;
}

const redisGlobalLimiter = createRedisRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  maxRequests: RATE_LIMIT_MAX_REQUESTS,
  keyPrefix: "rl:global",
});

const redisStemFileLimiter = createRedisRateLimiter({
  windowMs: STEM_FILE_RATE_LIMIT_WINDOW_MS,
  maxRequests: STEM_FILE_RATE_LIMIT_MAX_REQUESTS,
  keyPrefix: "rl:stem-file",
});

const redisServerExportLimiter = createRedisRateLimiter({
  windowMs: SERVER_EXPORT_RATE_LIMIT_WINDOW_MS,
  maxRequests: SERVER_EXPORT_RATE_LIMIT_MAX_REQUESTS,
  keyPrefix: "rl:server-export",
});

/**
 * @param {import("express").Response} res
 * @param {number} retryAfterSec
 */
function sendRateLimited(res, retryAfterSec) {
  res.set("Retry-After", String(retryAfterSec));
  return res.status(429).json({ error: "Too many requests. Please slow down." });
}

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export async function rateLimitMiddleware(req, res, next) {
  try {
    if (shouldSkipGlobalRateLimit(req)) return next();
    const ip = req.ip || req.socket.remoteAddress || "unknown";

    const redis = await getRedis();
    if (redis?.isOpen) {
      const redisResult = await redisGlobalLimiter(ip);
      if (!redisResult.allowed) {
        return sendRateLimited(
          res,
          Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
        );
      }
      return next();
    }

    const mem = globalMemoryStore.check(
      ip,
      RATE_LIMIT_WINDOW_MS,
      RATE_LIMIT_MAX_REQUESTS,
    );
    if (!mem.allowed) {
      return sendRateLimited(res, mem.retryAfterSec);
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export async function stemFileRateLimitMiddleware(req, res, next) {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const jobId = req.params.job_id || "unknown";
    const key = `${ip}|${jobId}`;

    const redis = await getRedis();
    if (redis?.isOpen) {
      const redisResult = await redisStemFileLimiter(key);
      if (!redisResult.allowed) {
        return res.status(429).json({
          error: "Too many stem file downloads. Please wait and try again.",
        });
      }
      return next();
    }

    const mem = stemFileMemoryStore.check(
      key,
      STEM_FILE_RATE_LIMIT_WINDOW_MS,
      STEM_FILE_RATE_LIMIT_MAX_REQUESTS,
    );
    if (!mem.allowed) {
      res.set("Retry-After", String(mem.retryAfterSec));
      return res.status(429).json({
        error: "Too many stem file downloads. Please wait and try again.",
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export async function serverExportRateLimitMiddleware(req, res, next) {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const jobId =
      req.body &&
      typeof req.body === "object" &&
      typeof req.body.job_id === "string" &&
      req.body.job_id.length > 0
        ? req.body.job_id
        : "unknown-job";
    const key = `${ip}|${jobId}`;

    const redis = await getRedis();
    if (redis?.isOpen) {
      const redisResult = await redisServerExportLimiter(key);
      if (!redisResult.allowed) {
        res.set(
          "Retry-After",
          String(Math.ceil(SERVER_EXPORT_RATE_LIMIT_WINDOW_MS / 1000)),
        );
        return res.status(429).json({
          error: "Too many export requests. Please wait and try again.",
        });
      }
      return next();
    }

    const mem = serverExportMemoryStore.check(
      key,
      SERVER_EXPORT_RATE_LIMIT_WINDOW_MS,
      SERVER_EXPORT_RATE_LIMIT_MAX_REQUESTS,
    );
    if (!mem.allowed) {
      res.set("Retry-After", String(mem.retryAfterSec));
      return res.status(429).json({
        error: "Too many export requests. Please wait and try again.",
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}
