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

async function readBillingErrorMessage(
  res: Response,
  kind: "checkout" | "portal",
): Promise<string> {
  const text = await res.text().catch(() => "");
  let bodyError: string | null = null;
  try {
    const j = text ? JSON.parse(text) : null;
    if (
      j &&
      typeof j === "object" &&
      j !== null &&
      typeof (/** @type {{ error?: unknown }} */ j.error) === "string"
    ) {
      bodyError = /** @type {{ error: string }} */ j.error;
    }
  } catch {
    /* ignore */
  }
  const devFb =
    kind === "checkout"
      ? `Checkout failed (${res.status})`
      : `Billing portal failed (${res.status})`;
  return userFacingHttpError(
    res.status,
    bodyError,
    text.slice(0, 800) || devFb,
  );
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

function classifySubscriptionFetchFailure(res: Response): string {
  if (res.status === 401 || res.status === 403) return "auth";
  if (res.status >= 500) return "server";
  return "other";
}

export type Plan = "basic" | "premium" | "studio" | "topup" | "single";
export type ServerPlan = Plan | "unknown";
export type SubscriptionStatus = "loading" | "active" | "inactive" | "error";
export type EntitlementSource = "subscription" | "usage_tokens" | "none";

export interface SubscriptionCapabilities {
  canSplitFourStems: boolean;
  canExpandToFourStems: boolean;
  canUsePremiumStemQualities: boolean;
  canUseBatchQueue: boolean;
  canDownloadFullPreview: boolean;
  canShareCleanPreview: boolean;
}

export const NO_SUBSCRIPTION_CAPABILITIES: SubscriptionCapabilities = {
  canSplitFourStems: false,
  canExpandToFourStems: false,
  canUsePremiumStemQualities: false,
  canUseBatchQueue: false,
  canDownloadFullPreview: false,
  canShareCleanPreview: false,
};

function premiumCapabilities(): SubscriptionCapabilities {
  return {
    canSplitFourStems: true,
    canExpandToFourStems: true,
    canUsePremiumStemQualities: true,
    canUseBatchQueue: true,
    canDownloadFullPreview: true,
    canShareCleanPreview: true,
  };
}

function normalizeCapabilities(
  value: Partial<SubscriptionCapabilities> | null | undefined,
): SubscriptionCapabilities {
  return {
    canSplitFourStems: value?.canSplitFourStems === true,
    canExpandToFourStems: value?.canExpandToFourStems === true,
    canUsePremiumStemQualities: value?.canUsePremiumStemQualities === true,
    canUseBatchQueue: value?.canUseBatchQueue === true,
    canDownloadFullPreview: value?.canDownloadFullPreview === true,
    canShareCleanPreview: value?.canShareCleanPreview === true,
  };
}

type CheckoutSource =
  | "split_gate"
  | "paywall_banner"
  | "pricing_page"
  | "upgrade_prompt"
  | "unknown";

export interface UseSubscriptionResult {
  status: SubscriptionStatus;
  /** Active plan name from the backend — null if inactive. */
  plan: ServerPlan | null;
  entitlementSource: EntitlementSource;
  capabilities: SubscriptionCapabilities;
  /** Non-null when a checkout or portal action fails — display to the user. */
  billingError: string | null;
  /** Redirect to Stripe Checkout for the given plan. */
  startCheckout: (
    plan: Plan,
    context?: { source?: CheckoutSource; intent?: string },
  ) => Promise<void>;
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
  const [plan, setPlan] = useState<ServerPlan | null>(
    localFullApp ? "premium" : null,
  );
  const [entitlementSource, setEntitlementSource] = useState<EntitlementSource>(
    localFullApp ? "subscription" : "none",
  );
  const [capabilities, setCapabilities] = useState<SubscriptionCapabilities>(
    localFullApp ? premiumCapabilities() : NO_SUBSCRIPTION_CAPABILITIES,
  );
  const [billingError, setBillingError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (localFullApp) {
      setStatus("active");
      setPlan("premium");
      setEntitlementSource("subscription");
      setCapabilities(premiumCapabilities());
      return;
    }
    if (!isSignedIn) {
      setStatus("inactive");
      setPlan(null);
      setEntitlementSource("none");
      setCapabilities(NO_SUBSCRIPTION_CAPABILITIES);
      setBillingError(null);
      return;
    }
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/billing/subscription`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const category = classifySubscriptionFetchFailure(res);
        trackEvent("subscription_fetch_failed", {
          category,
          http_status: res.status,
        });
        if (category === "auth") {
          setBillingError(
            "Your session expired. Please refresh and sign in again to continue checkout.",
          );
        } else if (category === "server") {
          setBillingError(
            "Billing is temporarily unavailable. Please try again in a moment.",
          );
        } else {
          setBillingError("Unable to verify billing status right now.");
        }
        setStatus("inactive");
        setPlan(null);
        setEntitlementSource("none");
        setCapabilities(NO_SUBSCRIPTION_CAPABILITIES);
        return;
      }
      const data = (await res.json()) as {
        active: boolean;
        plan: ServerPlan | null;
        entitlementSource?: EntitlementSource;
        capabilities?: Partial<SubscriptionCapabilities>;
      };
      setStatus(data.active ? "active" : "inactive");
      setPlan(data.active ? data.plan : null);
      setEntitlementSource(data.active ? (data.entitlementSource ?? "none") : "none");
      setCapabilities(
        data.active
          ? normalizeCapabilities(data.capabilities)
          : NO_SUBSCRIPTION_CAPABILITIES,
      );
      setBillingError(null);
    } catch (err) {
      trackEvent("subscription_fetch_failed", {
        category: "network_or_unknown",
        error:
          err instanceof Error ? err.message.slice(0, 120) : "unknown_error",
      });
      setStatus("error");
      setPlan(null);
      setEntitlementSource("none");
      setCapabilities(NO_SUBSCRIPTION_CAPABILITIES);
      setBillingError(
        "We could not reach billing services. Please check your connection and try again.",
      );
    }
  }, [getToken, isSignedIn, localFullApp]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- trigger async fetch on mount/auth change
    void fetchStatus();
  }, [fetchStatus]);

  // Refetch after Stripe redirects back with ?checkout=success
  useEffect(() => {
    if (window.location.search.includes("checkout=success")) {
      trackEvent("checkout_returned_success");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch after checkout redirect
      void fetchStatus();
    }
    if (window.location.search.includes("checkout=cancelled")) {
      trackEvent("checkout_returned_cancelled");
    }
  }, [fetchStatus]);

  const startCheckout = useCallback(
    async (
      selectedPlan: Plan,
      context?: { source?: CheckoutSource; intent?: string },
    ) => {
      if (localFullApp) return;
      const source = context?.source ?? "unknown";
      trackEvent("plan_selected", {
        plan: selectedPlan,
        source,
        intent: context?.intent ?? "unspecified",
      });
      trackEvent("checkout_started", { plan: selectedPlan, source });
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/api/billing/checkout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            plan: selectedPlan,
            returnUrl: checkoutReturnBase(),
            source,
            intent: context?.intent ?? "unspecified",
          }),
        });
        if (!res.ok) {
          const msg = await readBillingErrorMessage(res, "checkout");
          throw new Error(msg);
        }
        const { url } = (await res.json()) as { url: string };
        if (!url) throw new Error("Checkout did not return a URL");
        trackEvent("checkout_redirected", { plan: selectedPlan, source });
        window.location.href = url;
      } catch (err) {
        notifyBillingFailure("Checkout failed:", err);
        setBillingError(
          err instanceof Error
            ? err.message
            : "Checkout failed. Please try again.",
        );
        trackEvent("checkout_failed", {
          plan: selectedPlan,
          source,
          error: (err instanceof Error ? err.message : "Checkout failed").slice(
            0,
            120,
          ),
        });
      }
    },
    [getToken, localFullApp],
  );

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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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
      setBillingError(
        err instanceof Error
          ? err.message
          : "Billing portal failed. Please try again.",
      );
      trackEvent("billing_portal_failed", {
        error: (err instanceof Error
          ? err.message
          : "Billing portal failed"
        ).slice(0, 120),
      });
    }
  }, [getToken, localFullApp]);

  return {
    status,
    plan,
    entitlementSource,
    capabilities,
    billingError,
    startCheckout,
    openPortal,
    refetch: fetchStatus,
  };
}
