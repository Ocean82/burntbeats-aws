/**
 * useSubscription: plan access for the signed-in user.
 * Fetches /api/billing/subscription: positive usage-token balance counts as Basic (no Stripe sub required);
 * otherwise backend checks Stripe subscription status.
 */
import { useAuth } from "@clerk/react";
import { useCallback, useEffect, useState } from "react";
import { API_BASE, isLocalDevFullApp } from "../config";
import { userFacingHttpError } from "../userFacingError";
import { trackEvent } from "../analytics/events";

async function readBillingErrorMessage(res: Response, kind: "checkout" | "portal"): Promise<string> {
  const text = await res.text().catch(() => "");
  let bodyError: string | null = null;
  try {
    const j = text ? JSON.parse(text) : null;
    if (j && typeof j === "object" && j !== null && typeof /** @type {{ error?: unknown }} */ (j).error === "string") {
      bodyError = /** @type {{ error: string }} */ (j).error;
    }
  } catch {
    /* ignore */
  }
  const devFb =
    kind === "checkout" ? `Checkout failed (${res.status})` : `Billing portal failed (${res.status})`;
  return userFacingHttpError(res.status, bodyError, text.slice(0, 800) || devFb);
}

function notifyBillingFailure(context: string, err: unknown) {
  if (import.meta.env.DEV) console.error(context, err);
}

/** Base URL without query/hash (backend also strips; avoids huge hrefs). */
function checkoutReturnBase(): string {
  const { origin, pathname } = window.location;
  const path = pathname.replace(/\/$/, "") || "";
  return `${origin}${path}`;
}

/** Stripe Dashboard → Customer portal → Login link (`billing.stripe.com/p/login/...`). When set, Billing opens this URL instead of POST /api/billing/portal. */
function getStripeCustomerPortalLoginUrl(): string {
  const u = import.meta.env.VITE_STRIPE_CUSTOMER_PORTAL_URL;
  return typeof u === "string" && u.startsWith("http") ? u.trim() : "";
}

export type Plan = "basic" | "premium" | "studio" | "topup";
export type SubscriptionStatus = "loading" | "active" | "inactive" | "error";

export interface UseSubscriptionResult {
  status: SubscriptionStatus;
  /** Active plan name, e.g. "basic" | "premium" | "studio" — null if inactive */
  plan: Plan | null;
  /** Non-null when a checkout or portal action fails — display to the user. */
  billingError: string | null;
  /** Redirect to Stripe Checkout for the given plan. */
  startCheckout: (plan: Plan) => Promise<void>;
  /** Redirect to Stripe Customer Portal to manage billing. */
  openPortal: () => Promise<void>;
  refetch: () => void;
}

export function useSubscription(): UseSubscriptionResult {
  const localFullApp = isLocalDevFullApp();
  const { getToken, isSignedIn } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus>(
    localFullApp ? "active" : "loading",
  );
  const [plan, setPlan] = useState<Plan | null>(localFullApp ? "premium" : null);
  const [billingError, setBillingError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (localFullApp) {
      setStatus("active");
      setPlan("premium");
      return;
    }
    if (!isSignedIn) { setStatus("inactive"); setPlan(null); return; }
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/billing/subscription`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setStatus("inactive"); setPlan(null); return; }
      const data = (await res.json()) as { active: boolean; plan: Plan | null };
      setStatus(data.active ? "active" : "inactive");
      setPlan(data.active ? data.plan : null);
    } catch {
      setStatus("error");
      setPlan(null);
    }
  }, [getToken, isSignedIn, localFullApp]);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  // Refetch after Stripe redirects back with ?checkout=success
  useEffect(() => {
    if (window.location.search.includes("checkout=success")) {
      trackEvent("checkout_returned_success");
      void fetchStatus();
    }
  }, [fetchStatus]);

  const startCheckout = useCallback(async (selectedPlan: Plan) => {
    if (localFullApp) return;
    trackEvent("checkout_started", { plan: selectedPlan });
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: selectedPlan, returnUrl: checkoutReturnBase() }),
      });
      if (!res.ok) {
        const msg = await readBillingErrorMessage(res, "checkout");
        throw new Error(msg);
      }
      const { url } = (await res.json()) as { url: string };
      if (!url) throw new Error("Checkout did not return a URL");
      trackEvent("checkout_redirected", { plan: selectedPlan });
      window.location.href = url;
    } catch (err) {
      notifyBillingFailure("Checkout failed:", err);
      setBillingError(err instanceof Error ? err.message : "Checkout failed. Please try again.");
      trackEvent("checkout_failed", {
        plan: selectedPlan,
        error: (err instanceof Error ? err.message : "Checkout failed").slice(0, 120),
      });
    }
  }, [getToken, localFullApp]);

  const openPortal = useCallback(async () => {
    if (localFullApp) return;
    trackEvent("billing_portal_open_started");
    try {
      const loginUrl = getStripeCustomerPortalLoginUrl();
      if (loginUrl) {
        trackEvent("billing_portal_redirected", { via: "direct_login_url" });
        window.location.assign(loginUrl);
        return;
      }
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/billing/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ returnUrl: checkoutReturnBase() }),
      });
      if (!res.ok) {
        const msg = await readBillingErrorMessage(res, "portal");
        throw new Error(msg);
      }
      const { url } = (await res.json()) as { url: string };
      if (!url) throw new Error("Portal did not return a URL");
      trackEvent("billing_portal_redirected", { via: "api_portal" });
      window.location.href = url;
    } catch (err) {
      notifyBillingFailure("Portal failed:", err);
      setBillingError(err instanceof Error ? err.message : "Billing portal failed. Please try again.");
      trackEvent("billing_portal_failed", {
        error: (err instanceof Error ? err.message : "Billing portal failed").slice(0, 120),
      });
    }
  }, [getToken, localFullApp]);

  return { status, plan, billingError, startCheckout, openPortal, refetch: fetchStatus };
}
