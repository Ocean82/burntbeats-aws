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
  /** Optional: enable server-side master export endpoint (/api/stems/server-export). Default disabled. */
  readonly VITE_SERVER_EXPORT_ENABLED?: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  readonly VITE_STRIPE_PRICING_TABLE_ID?: string;
  /** Optional: Stripe Customer Portal login URL (Dashboard → Customer portal → Login link). If set, in-app Billing uses this instead of POST /api/billing/portal. */
  readonly VITE_STRIPE_CUSTOMER_PORTAL_URL?: string;
  /** Optional: GA4 measurement ID (G-xxxxxxxxxx). Baked in at build time; set in Docker/root .env for production. */
  readonly VITE_GA_MEASUREMENT_ID?: string;
}

interface Window {
  __BB_DUMP_TIMELINE_PERF?: () => void;
  __BB_RESET_TIMELINE_PERF?: () => void;
  /** GA4 command queue when gtag is initialized (see analytics/initGoogleTag.ts). */
  dataLayer?: unknown[][];
  gtag?: (...args: unknown[]) => void;
}
