/**
 * Composite hook: subscription status, usage balance, and derived feature gates.
 * Consolidates subscription + usage + plan-based feature flags into one call.
 */
import { useEffect, useMemo } from "react";
import { useSubscription } from "./useSubscription";
import { useUsageBalance } from "./useUsageBalance";
import { usePostSignupPlanCheckout } from "./usePostSignupPlanCheckout";

export interface AppSubscriptionResult {
  subscription: ReturnType<typeof useSubscription>;
  usageBalance: number | null;
  usageLoading: boolean;
  refetchUsage: () => void;
  /** True when plan is "basic" (limited quality, no 4-stem, no batch). */
  isBasicPlan: boolean;
  /** "speed_only" for basic plans, "full" otherwise. */
  stemQualityOptions: "speed_only" | "full";
  /** Whether the user can expand 2→4 stems. */
  canExpandToFourStems: boolean;
  /** Whether the user can use batch queue. */
  canUseBatchQueue: boolean;
}

export function useAppSubscription(opts: {
  localDevFullApp: boolean;
  splitResultStemsLength: number;
}): AppSubscriptionResult {
  const subscription = useSubscription();
  const {
    balance: usageBalance,
    loading: usageLoading,
    refetch: refetchUsage,
  } = useUsageBalance(subscription.status === "active" && !opts.localDevFullApp);

  // Refetch usage when stems change or subscription activates
  useEffect(() => {
    void refetchUsage();
  }, [
    opts.splitResultStemsLength,
    subscription.status,
    opts.localDevFullApp,
    refetchUsage,
  ]);

  usePostSignupPlanCheckout(subscription);

  const isBasicPlan =
    subscription.status === "active" && subscription.plan === "basic";
  const stemQualityOptions = isBasicPlan ? ("speed_only" as const) : ("full" as const);
  const canExpandToFourStems = subscription.status === "active" && !isBasicPlan;
  const canUseBatchQueue = subscription.status === "active" && !isBasicPlan;

  return useMemo(
    () => ({
      subscription,
      usageBalance,
      usageLoading,
      refetchUsage,
      isBasicPlan,
      stemQualityOptions,
      canExpandToFourStems,
      canUseBatchQueue,
    }),
    [
      subscription,
      usageBalance,
      usageLoading,
      refetchUsage,
      isBasicPlan,
      stemQualityOptions,
      canExpandToFourStems,
      canUseBatchQueue,
    ],
  );
}
