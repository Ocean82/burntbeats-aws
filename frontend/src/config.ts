/**
 * When set (`VITE_LOCAL_DEV_FULL_APP=1`), the UI skips Clerk sign-in and treats
 * subscription as Premium — for local stem/mixer testing without login or Stripe.
 * Disabled in production builds (`import.meta.env.PROD`) so the flag cannot ship enabled.
 */
export function isLocalDevFullApp(): boolean {
  if (import.meta.env.PROD) return false;
  const v = String(import.meta.env.VITE_LOCAL_DEV_FULL_APP ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true";
}

// Centralized API base URL (no trailing slash).
export const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, "")
    : (typeof window !== "undefined" && window.location.hostname !== "localhost" ? window.location.origin : "http://localhost:3001"));

// Global configuration constants: first step is always 2-stem (vocals + instrumental).
export const DEFAULT_STEM_COUNT = 2 as const;

export const MASTER_CHAIN = { compression: 2.4, limiter: -0.8, loudness: -9 } as const;

export const PIPELINE_ANIMATION_DELAYS_MS = { toStep1: 400, toStep2: 1200 } as const;

export const PIPELINE_PROGRESS_THRESHOLDS = { step2: 50, step3: 100 } as const;
