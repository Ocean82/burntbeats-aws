import * as Sentry from "@sentry/react";

/**
 * Redact sensitive tokens from a string:
 * - Clerk session tokens: `__session=<value>`
 * - Stripe publishable keys: `pk_live_...` / `pk_test_...`
 */
function redactSensitive(input: string): string {
  return input
    .replace(/__session=[^&\s;]*/g, "__session=[REDACTED]")
    .replace(/pk_(live|test)_[A-Za-z0-9]+/g, "pk_$1_[REDACTED]");
}

/**
 * Initialize Sentry for the frontend.
 * Reads configuration from Vite environment variables.
 * If VITE_SENTRY_DSN is not set, initialization is skipped entirely.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || "production",
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    integrations: [Sentry.browserTracingIntegration()],
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === "xhr" || breadcrumb.category === "fetch") {
        if (breadcrumb.data) {
          if (typeof breadcrumb.data.url === "string") {
            breadcrumb.data.url = redactSensitive(breadcrumb.data.url);
          }
          if (typeof breadcrumb.data.body === "string") {
            breadcrumb.data.body = redactSensitive(breadcrumb.data.body);
          }
        }
      }
      return breadcrumb;
    },
  });
}
