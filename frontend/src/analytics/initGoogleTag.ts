import { setGaMeasurementId } from "./pageViews";

const SCRIPT_MARKER = "data-bb-gtag";

/**
 * Loads GA4 gtag.js after the Vite build. Scripts in index.html are removed from
 * production dist/index.html (only the module entry is kept), so GA must be initialized here.
 */
export function initGoogleTag(measurementId: string): void {
  const id = measurementId.trim();
  if (!id || typeof window === "undefined") return;
  if (document.querySelector(`script[${SCRIPT_MARKER}]`)) return;

  setGaMeasurementId(id);

  window.dataLayer = window.dataLayer ?? [];
  const gtag: Gtag = function gtag(...args: GtagCommand) {
    window.dataLayer!.push(args as unknown[]);
  };
  window.gtag = gtag as unknown as typeof window.gtag;

  gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    wait_for_update: 500,
  });
  gtag("consent", "update", {
    analytics_storage: "granted",
  });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  script.setAttribute(SCRIPT_MARKER, id);
  document.head.appendChild(script);

  gtag("js", new Date());
  gtag("config", id, {
    send_page_view: true,
    page_path: window.location.pathname,
    page_title: document.title,
  });
}

type GtagCommand = [string, ...unknown[]];

interface Gtag {
  (...args: GtagCommand): void;
}
