import { GA4_EVENT_NAMES } from "./trackingPlan";

type EventParamValue = string | number | boolean;
type EventParams = Record<string, EventParamValue | null | undefined>;

/**
 * Safe GA4 event sender.
 * No-op when gtag is not available (e.g. local/dev or blocked scripts).
 */
export function trackEvent(eventName: string, params: EventParams = {}): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  if (!eventName.trim()) return;

  if (import.meta.env.DEV && !GA4_EVENT_NAMES.has(eventName)) {
    console.warn(`[analytics] Unmapped GA4 event: ${eventName}`);
  }

  const cleanParams: Record<string, EventParamValue> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      cleanParams[key] = value;
    }
  }

  window.gtag("event", eventName, cleanParams);
}

