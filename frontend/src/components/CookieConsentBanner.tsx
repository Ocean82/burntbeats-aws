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
      className="fixed inset-x-0 bottom-0 z-[200] p-4 sm:p-6"
    >
      <div className="mx-auto max-w-2xl rounded-2xl border border-white/15 bg-[#0a0608]/95 px-5 py-4 shadow-2xl backdrop-blur-xl sm:px-6 sm:py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex-1">
            <p
              id="cookie-consent-description"
              className="text-sm leading-relaxed text-white/80"
            >
              We use cookies to analyze site usage and improve your experience.
              Essential cookies for authentication are always active.{" "}
              <a
                href="/privacy-policy"
                className="text-amber-300/90 underline underline-offset-2 hover:text-amber-200"
              >
                Privacy Policy
              </a>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={declineAnalytics}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={acceptAnalytics}
              className="rounded-full border border-amber-400/40 bg-amber-500/20 px-4 py-2 text-xs font-medium text-amber-100 transition hover:bg-amber-500/30"
            >
              Accept cookies
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
