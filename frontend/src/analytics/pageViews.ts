let measurementId: string | null = null;

export function setGaMeasurementId(id: string): void {
  measurementId = id.trim() || null;
}

export function clearGaMeasurementId(): void {
  measurementId = null;
}

export function getGaMeasurementId(): string | null {
  return measurementId;
}

/** GA4 SPA page view — no-op when gtag or measurement ID is unavailable. */
export function trackPageView(pagePath: string, pageTitle?: string): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  const id = measurementId;
  if (!id) return;

  const path = pagePath.startsWith("/") ? pagePath : `/${pagePath}`;
  window.gtag("event", "page_view", {
    page_path: path,
    page_title: pageTitle,
    send_to: id,
  });
}
