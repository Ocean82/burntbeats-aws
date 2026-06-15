import { trackEvent } from "./events";

const CHECKOUT_TRACKED_PREFIX = "bb_checkout_tracked_";

type CheckoutOutcome = "success" | "cancelled";

function checkoutStorageKey(outcome: CheckoutOutcome): string {
  return `${CHECKOUT_TRACKED_PREFIX}${outcome}`;
}

/** Fires checkout return events once per browser session (Root + subscription hook share this). */
export function trackCheckoutReturnedOnce(
  outcome: CheckoutOutcome,
  source: string,
): void {
  if (typeof window === "undefined") return;

  const key = checkoutStorageKey(outcome);
  if (window.sessionStorage.getItem(key)) return;
  window.sessionStorage.setItem(key, "1");

  trackEvent(
    outcome === "success" ? "checkout_returned_success" : "checkout_returned_cancelled",
    { source },
  );
}
