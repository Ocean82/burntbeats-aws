/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API base URL. */
  readonly VITE_API_BASE_URL?: string;
  /** Clerk publishable key for auth. */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  /** Dev only: skip Clerk gate + subscription paywall; full app for local QA (only when Vite mode is development). */
  readonly VITE_LOCAL_DEV_FULL_APP?: string;
  /** Optional: max split upload bytes; default 500MB; align with backend MAX_UPLOAD_BYTES. */
  readonly VITE_MAX_UPLOAD_BYTES?: string;
  /**
   * When **`1`** / **`true`**, the client may call **`POST /api/stems/server-export`** for an offline-rendered master **WAV** (must match **`SERVER_EXPORT_ENABLED=1`** on the backend or you get HTTP **404**, then client falls back).
   * Renders on the stem host via **`stem_service/server_export.py`** — **token-metered** when **`USAGE_TOKENS_ENABLED`**. Omit in prod unless you deliberately enable server export (`docs/BILLING-AND-TOKENS.md`, **`docs/ARCHITECTURE-FLOW.md`**). Baked in at **frontend image build**.
   */
  readonly VITE_SERVER_EXPORT_ENABLED?: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  readonly VITE_STRIPE_PRICING_TABLE_ID?: string;
  readonly VITE_STRIPE_PACKAGE_PRICING_TABLE_ID?: string;
  /** Optional: Stripe Customer Portal login URL (Dashboard → Customer portal → Login link). If set, in-app Billing uses this instead of POST /api/billing/portal. */
  readonly VITE_STRIPE_CUSTOMER_PORTAL_URL?: string;
  /** Optional: GA4 measurement ID (G-xxxxxxxxxx). Baked in at build time; set in Docker/root .env for production. */
  readonly VITE_GA_MEASUREMENT_ID?: string;
  /** Sentry DSN for frontend error tracking and performance monitoring. */
  readonly VITE_SENTRY_DSN?: string;
  /** Sentry environment tag (e.g. "production", "staging"). Defaults to "production" if not set. */
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  /** Sentry release tag (e.g. git SHA or version). Used to correlate errors with deployments. */
  readonly VITE_SENTRY_RELEASE?: string;
}

interface Window {
  __BB_DUMP_TIMELINE_PERF?: () => void;
  __BB_RESET_TIMELINE_PERF?: () => void;
  /** GA4 command queue when gtag is initialized (see analytics/initGoogleTag.ts). */
  dataLayer?: unknown[][];
  gtag?: (...args: unknown[]) => void;
}
