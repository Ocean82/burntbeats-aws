const SCRIPT_MARKER = "data-bb-gtag";

/**
 * Loads GA4 gtag.js after the Vite build. Scripts in index.html are removed from
 * production dist/index.html (only the module entry is kept), so GA must be initialized here.
 */
export function initGoogleTag(measurementId: string): void {
  const id = measurementId.trim();
  if (!id || typeof window === "undefined") return;
  if (document.querySelector(`script[${SCRIPT_MARKER}]`)) return;

  window.dataLayer = window.dataLayer ?? [];
  const gtag: Gtag = function gtag(...args: GtagCommand) {
    window.dataLayer!.push(args as unknown[]);
  };
  window.gtag = gtag;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  script.setAttribute(SCRIPT_MARKER, id);
  document.head.appendChild(script);

  gtag("js", new Date());
  gtag("config", id);
}

type GtagCommand = [string, ...unknown[]];

interface Gtag {
  (...args: GtagCommand): void;
}
