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
  /** "speed_only" for basic plans, "full" otherwise. */
  stemQualityOptions: "speed_only" | "full";
  /** Whether the user can choose a direct 4-stem split. */
  canSplitFourStems: boolean;
  /** Whether the user can choose paid stem quality modes. */
  canUsePremiumStemQualities: boolean;
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

  const canSplitFourStems = subscription.capabilities.canSplitFourStems;
  const canUsePremiumStemQualities =
    subscription.capabilities.canUsePremiumStemQualities;
  const canExpandToFourStems = subscription.capabilities.canExpandToFourStems;
  const canUseBatchQueue = subscription.capabilities.canUseBatchQueue;
  const stemQualityOptions = canUsePremiumStemQualities
    ? ("full" as const)
    : ("speed_only" as const);

  return useMemo(
    () => ({
      subscription,
      usageBalance,
      usageLoading,
      refetchUsage,
      stemQualityOptions,
      canSplitFourStems,
      canUsePremiumStemQualities,
      canExpandToFourStems,
      canUseBatchQueue,
    }),
    [
      subscription,
      usageBalance,
      usageLoading,
      refetchUsage,
      stemQualityOptions,
      canSplitFourStems,
      canUsePremiumStemQualities,
      canExpandToFourStems,
      canUseBatchQueue,
    ],
  );
}
