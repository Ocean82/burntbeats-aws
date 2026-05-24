// @ts-check
/**
 * Prometheus metrics for the Express backend.
 *
 * Exposes:
 * - http_request_duration_seconds (histogram by method, route, status)
 * - http_requests_total (counter by method, route, status)
 * - rate_limit_hits_total (counter)
 * - db_pool_active_connections (gauge)
 * - db_pool_idle_connections (gauge)
 *
 * Mount: app.use(metricsMiddleware) before routes, app.get("/metrics", metricsHandler) after.
 */
import client from "prom-client";

// Use a dedicated registry (not the global default) to avoid conflicts.
const register = new client.Registry();

// Collect default Node.js metrics (event loop lag, heap, GC, etc.)
client.collectDefaultMetrics({ register });

// ── Custom metrics ───────────────────────────────────────────────────────────

const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

export const rateLimitHitsTotal = new client.Counter({
  name: "rate_limit_hits_total",
  help: "Total number of rate-limited requests (429 responses)",
  registers: [register],
});

const dbPoolActive = new client.Gauge({
  name: "db_pool_active_connections",
  help: "Number of active (checked-out) database connections",
  registers: [register],
});

const dbPoolIdle = new client.Gauge({
  name: "db_pool_idle_connections",
  help: "Number of idle database connections in the pool",
  registers: [register],
});

// ── Route normalization ──────────────────────────────────────────────────────

/**
 * Normalize Express route path to avoid high-cardinality labels.
 * Replaces UUIDs and numeric IDs with placeholders.
 * @param {string} path
 * @returns {string}
 */
function normalizeRoute(path) {
  return path
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      ":id",
    )
    .replace(/\/\d+/g, "/:num");
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Express middleware that records request duration and count.
 * Mount before route handlers.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export function metricsMiddleware(req, res, next) {
  // Skip metrics endpoint itself to avoid recursion
  if (req.path === "/metrics") return next();

  const end = httpRequestDuration.startTimer();
  res.on("finish", () => {
    const route = normalizeRoute(req.path);
    const labels = {
      method: req.method,
      route,
      status: String(res.statusCode),
    };
    end(labels);
    httpRequestsTotal.inc(labels);
  });
  next();
}

// ── Handler ──────────────────────────────────────────────────────────────────

/**
 * Express route handler for GET /metrics.
 * Returns Prometheus text format.
 * @param {import("express").Request} _req
 * @param {import("express").Response} res
 */
export async function metricsHandler(_req, res) {
  // Update DB pool gauges on each scrape
  try {
    const { getPool } = await import("./db.js");
    const pool = getPool();
    if (pool) {
      dbPoolActive.set(pool.totalCount - pool.idleCount);
      dbPoolIdle.set(pool.idleCount);
    }
  } catch {
    // DB module may not be available
  }

  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
}
