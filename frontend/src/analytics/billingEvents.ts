import { trackEvent } from "./events";
import type { BillingInterval } from "../data/plans";

export type { BillingInterval };

/** Funnel events for monetization restructure (GA4). */
export function trackPaywallImpression(source: string, trigger?: string) {
  trackEvent("paywall_impression", { source, trigger: trigger ?? "unspecified" });
}

export function trackCheckoutStarted(plan: string, source: string, interval?: BillingInterval) {
  trackEvent("checkout_started", {
    plan,
    source,
    interval: interval ?? "month",
  });
}

export function trackCancelFlowStarted(plan: string | null) {
  trackEvent("cancel_flow_started", { plan: plan ?? "unknown" });
}

export function trackCancelReasonSelected(reason: string) {
  trackEvent("cancel_reason_selected", { reason });
}

export function trackSaveOfferShown(offerType: string, reason: string) {
  trackEvent("save_offer_shown", { offer_type: offerType, reason });
}

export function trackSaveOfferAccepted(offerType: string) {
  trackEvent("save_offer_accepted", { offer_type: offerType });
}

export function trackSaveOfferDeclined(offerType: string) {
  trackEvent("save_offer_declined", { offer_type: offerType });
}
