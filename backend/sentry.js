/**
 * Sentry APM initialization for the Express backend.
 * Must be imported and called BEFORE any other imports/middleware for proper instrumentation.
 */
import * as Sentry from "@sentry/node";

/**
 * Initialize Sentry SDK. Reads SENTRY_DSN from process.env.
 * If DSN is empty/undefined, skips initialization and logs to console.
 */
export function initSentry() {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    console.log("[sentry] SENTRY_DSN not set — skipping Sentry initialization.");
    return;
  }

  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    sendDefaultPii: false,
    environment: process.env.NODE_ENV || "production",
    release: process.env.SENTRY_RELEASE || undefined,
    beforeSend(event) {
      // Strip sensitive headers from request data
      if (event.request && event.request.headers) {
        const headers = event.request.headers;
        delete headers["authorization"];
        delete headers["Authorization"];
        delete headers["cookie"];
        delete headers["Cookie"];
        delete headers["x-api-key"];
        delete headers["X-Api-Key"];
      }
      return event;
    },
  });

  console.log("[sentry] Sentry initialized for backend.");
}

/**
 * Returns the Sentry Express error handler middleware.
 * Mount after all route handlers but before the generic error handler.
 */
export function sentryErrorHandler() {
  return Sentry.expressErrorHandler();
}
