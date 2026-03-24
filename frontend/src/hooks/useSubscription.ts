/**
 * useSubscription: checks whether the current Clerk user has an active Stripe subscription.
 * Fetches /api/billing/subscription (backend verifies Clerk JWT + Stripe status).
 */
import { useAuth } from "@clerk/react";
import { useCallback, useEffect, useState } from "react";
import { API_BASE, isLocalDevFullApp } from "../config";

async function readBillingErrorBody(res: Response, fallback: string): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    if (j?.error && typeof j.error === "string") return j.error;
  } catch {
    /* ignore */
  }
  return fallback;
}

function notifyBillingFailure(context: string, err: unknown) {
  console.error(context, err);
  const msg = err instanceof Error ? err.message : String(err);
  window.alert(msg);
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
      void fetchStatus();
    }
  }, [fetchStatus]);

  const startCheckout = useCallback(async (selectedPlan: Plan) => {
    if (localFullApp) return;
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: selectedPlan, returnUrl: checkoutReturnBase() }),
      });
      if (!res.ok) {
        const msg = await readBillingErrorBody(res, `Checkout failed (${res.status})`);
        throw new Error(msg);
      }
      const { url } = (await res.json()) as { url: string };
      if (!url) throw new Error("Checkout did not return a URL");
      window.location.href = url;
    } catch (err) {
      notifyBillingFailure("Checkout failed:", err);
    }
  }, [getToken, localFullApp]);

  const openPortal = useCallback(async () => {
    if (localFullApp) return;
    try {
      const loginUrl = getStripeCustomerPortalLoginUrl();
      if (loginUrl) {
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
        const msg = await readBillingErrorBody(res, `Billing portal failed (${res.status})`);
        throw new Error(msg);
      }
      const { url } = (await res.json()) as { url: string };
      if (!url) throw new Error("Portal did not return a URL");
      window.location.href = url;
    } catch (err) {
      notifyBillingFailure("Portal failed:", err);
    }
  }, [getToken, localFullApp]);

  return { status, plan, startCheckout, openPortal, refetch: fetchStatus };
}
