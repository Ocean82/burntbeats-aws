/**
 * Backend API: composition root.
 * Mounts route modules, global middleware, and manages server lifecycle.
 * Product flow: docs/ARCHITECTURE-FLOW.md
 */
// @ts-check
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { mkdir } from "fs/promises";
import os from "os";
import path from "path";
import { billingRouter } from "./billing.js";
import { clerkWebhookRouter } from "./clerkWebhook.js";
import { emailRouter } from "./email-routes.js";
import { isUsageTokensEnabled } from "./usageTokens.js";
import { getAllowedOriginSet } from "./allowedOrigins.js";
import { closePool } from "./db.js";
import { rateLimitMiddleware } from "./middleware/rateLimiter.js";
import { stemsRouter, STEM_OUTPUT_DIR } from "./routes/stems.js";
import { healthRouter } from "./routes/health.js";
import { legalRouter } from "./routes/legal.js";
import { historyRouter } from "./routes/history.js";

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

const DEV_BYPASS_UPLOAD_AUTH =
  process.env.NODE_ENV !== "production" &&
  ["1", "true", "yes"].includes(
    (process.env.DEV_BYPASS_UPLOAD_AUTH || "").toLowerCase(),
  );
if (DEV_BYPASS_UPLOAD_AUTH && process.env.NODE_ENV !== "test") {
  console.warn(
    "[startup] DEV_BYPASS_UPLOAD_AUTH enabled — upload/expand usage auth is bypassed in non-production mode.",
  );
}

// ── App creation ────────────────────────────────────────────────────────────
export const app = express();
app.set("trust proxy", 1);

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

// ── Route mounts ─────────────────────────────────────────────────────────────
app.use("/api/email", emailRouter);
app.use("/api/billing", billingRouter);
app.use("/api/clerk", clerkWebhookRouter);
app.use("/api/stems", stemsRouter);
app.use("/api/legal", legalRouter);
app.use("/api/health", healthRouter);
app.use("/api", historyRouter);

// ── Global error handler ────────────────────────────────────────────────────
// Must be 4-param to be recognised by Express as an error handler.
// Catches any error passed via next(err) or thrown synchronously in a route.
app.use((err, req, res, _next) => {
  console.error("[unhandled error]", err?.message || err);
  if (res.headersSent) return;
  res.status(err?.status || 500).json({ error: "Internal server error" });
});

// ── Server lifecycle ─────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3001;
const UPLOAD_TMP_DIR = path.join(os.tmpdir(), "burntbeats-upload");
let server;

async function main() {
  await mkdir(STEM_OUTPUT_DIR, { recursive: true });
  await mkdir(UPLOAD_TMP_DIR, { recursive: true });
  server = app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
    console.log(
      `STEM_SERVICE_URL=${process.env.STEM_SERVICE_URL || "http://localhost:5000"} STEM_OUTPUT_DIR=${STEM_OUTPUT_DIR}`,
    );
    console.log(
      `CORS allowed origins: ${[...getAllowedOriginSet()].join(", ")}`,
    );
    if (process.env.API_KEY) console.log("API key authentication: ENABLED");
    if (process.env.JOB_TOKEN_SECRET)
      console.log("Job token authentication: ENABLED");
  });
  server.on("error", (err) => {
    console.error("Server error:", err);
    process.exit(1);
  });
}

async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  try {
    await closePool();
  } catch (e) {
    console.error("[shutdown] db pool close error:", e);
  }
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
