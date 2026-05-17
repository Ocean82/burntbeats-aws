/**
 * Cookie consent store — manages user's analytics cookie preferences.
 *
 * Categories:
 * - "necessary": Always allowed (auth session cookies, CSRF). Cannot be declined.
 * - "analytics": Google Analytics, tracking pixels. Requires explicit consent.
 *
 * Consent state is persisted in localStorage (not a cookie itself) to avoid
 * the circular problem of needing consent to set a consent cookie.
 *
 * GDPR/ePrivacy compliance:
 * - No analytics cookies are set until the user explicitly consents.
 * - Consent can be withdrawn at any time.
 * - The banner re-appears if consent has not been given or was withdrawn.
 */
import { create } from "zustand";

export type ConsentStatus = "undecided" | "accepted" | "declined";

interface CookieConsentState {
  /** Whether the user has accepted analytics cookies. */
  analytics: ConsentStatus;
  /** Whether the consent banner should be visible. */
  bannerVisible: boolean;
  /** Accept analytics cookies. */
  acceptAnalytics: () => void;
  /** Decline analytics cookies. */
  declineAnalytics: () => void;
  /** Withdraw previously-given consent (e.g., from a settings page). */
  withdrawConsent: () => void;
}

const STORAGE_KEY = "burntbeats_cookie_consent";

function loadConsent(): ConsentStatus {
  if (typeof window === "undefined") return "undecided";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "accepted" || stored === "declined") return stored;
  return "undecided";
}

function persistConsent(status: ConsentStatus): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, status);
}

/**
 * Remove all GA cookies when consent is withdrawn.
 * GA4 sets cookies prefixed with `_ga`.
 */
function removeAnalyticsCookies(): void {
  if (typeof document === "undefined") return;
  const gaCookies = document.cookie
    .split(";")
    .map((c) => c.trim().split("=")[0])
    .filter((name) => name.startsWith("_ga"));

  for (const name of gaCookies) {
    // Delete on current domain and common subdomains
    const domains = [
      window.location.hostname,
      `.${window.location.hostname}`,
    ];
    for (const domain of domains) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${domain}; SameSite=Lax; Secure`;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${domain}`;
    }
    // Also try without domain
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax; Secure`;
  }
}

export const useCookieConsent = create<CookieConsentState>((set) => {
  const initial = loadConsent();

  return {
    analytics: initial,
    bannerVisible: initial === "undecided",

    acceptAnalytics: () => {
      persistConsent("accepted");
      set({ analytics: "accepted", bannerVisible: false });
    },

    declineAnalytics: () => {
      persistConsent("declined");
      removeAnalyticsCookies();
      set({ analytics: "declined", bannerVisible: false });
    },

    withdrawConsent: () => {
      persistConsent("declined");
      removeAnalyticsCookies();
      // Remove the gtag script to stop further tracking
      const script = document.querySelector("script[data-bb-gtag]");
      if (script) script.remove();
      // Clear dataLayer
      if (window.dataLayer) window.dataLayer.length = 0;
      set({ analytics: "declined", bannerVisible: false });
    },
  };
});

/**
 * Check if analytics consent has been given.
 * Use this before initializing any analytics/tracking scripts.
 */
export function hasAnalyticsConsent(): boolean {
  return useCookieConsent.getState().analytics === "accepted";
}
