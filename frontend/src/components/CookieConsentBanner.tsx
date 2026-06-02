/**
 * GDPR-compliant cookie consent banner.
 *
 * Shown on first visit (or if consent was withdrawn). Blocks analytics cookies
 * until the user explicitly accepts. Necessary cookies (auth, CSRF) are always
 * allowed and don't require consent.
 *
 * Design: minimal, non-intrusive bottom banner matching the app's fire/ice theme.
 */
import { useEffect } from "react";
import { useCookieConsent } from "../store/cookieConsent";
import { initGoogleTag } from "../analytics/initGoogleTag";

export function CookieConsentBanner() {
  const { analytics, bannerVisible, acceptAnalytics, declineAnalytics } =
    useCookieConsent();

  // When consent is accepted (either now or on a return visit), initialize GA
  useEffect(() => {
    if (analytics !== "accepted") return;
    const gaMeasurementId = String(
      import.meta.env.VITE_GA_MEASUREMENT_ID ?? "",
    ).trim();
    if (gaMeasurementId) {
      initGoogleTag(gaMeasurementId);
    }
  }, [analytics]);

  if (!bannerVisible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-describedby="cookie-consent-description"
      className="fixed inset-x-0 bottom-0 z-toast p-md sm:p-lg pb-safe"
    >
      <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-popover/95 px-lg py-md shadow-elevation-xl backdrop-blur-xl sm:px-lg sm:py-lg">
        <div className="flex flex-col gap-md sm:flex-row sm:items-center sm:justify-between sm:gap-lg">
          <div className="flex-1">
            <p
              id="cookie-consent-description"
              className="text-readable text-sm leading-relaxed text-secondary-foreground"
            >
              We use cookies to analyze site usage and improve your experience.
              Essential cookies for authentication are always active.{" "}
              <a
                href="/privacy-policy"
                className="text-primary-300/90 underline underline-offset-2 hover:text-primary-200"
              >
                Privacy Policy
              </a>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-xs">
            <button
              type="button"
              onClick={declineAnalytics}
              className="tap-feedback min-h-[44px] rounded-full border border-border bg-muted px-md py-xs text-xs font-medium text-secondary-foreground transition-[color,background-color,transform] duration-[var(--motion-fast)] hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={acceptAnalytics}
              className="tap-feedback min-h-[44px] rounded-full border border-primary-400/40 bg-primary-500/20 px-md py-xs text-xs font-medium text-primary-100 transition-[color,background-color,transform] duration-[var(--motion-fast)] hover:bg-primary-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
            >
              Accept cookies
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
