import { useEffect } from "react";
import type { UseSubscriptionResult } from "./useSubscription";

const POST_SIGNUP_PLAN_KEY = "burntbeats_post_signup_plan";

export function clearPostSignupPlanIntent(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(POST_SIGNUP_PLAN_KEY);
}

export function usePostSignupPlanCheckout(subscription: UseSubscriptionResult) {
  useEffect(() => {
    if (subscription.status !== "inactive") return;
    const plan = window.sessionStorage.getItem(POST_SIGNUP_PLAN_KEY);
    if (!plan) return;
    if (
      plan !== "basic" &&
      plan !== "premium" &&
      plan !== "studio" &&
      plan !== "topup" &&
      plan !== "single"
    ) {
      window.sessionStorage.removeItem(POST_SIGNUP_PLAN_KEY);
      return;
    }
    clearPostSignupPlanIntent();
    void subscription.startCheckout(plan, {
      source: "pricing_page",
      intent: "post_signup_plan_intent",
    });
  }, [subscription, subscription.status]);
}
