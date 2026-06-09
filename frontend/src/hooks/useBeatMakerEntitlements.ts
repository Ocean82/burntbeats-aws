/**
 * useBeatMakerEntitlements — Derives beat maker feature access from subscription state.
 */
import { useMemo } from "react";
import type { UseSubscriptionResult } from "./useSubscription";
import {
  resolveBeatMakerTier,
  getBeatMakerLimits,
  type BeatMakerTier,
  type BeatMakerLimits,
} from "../audio/beatMakerEntitlements";

export interface UseBeatMakerEntitlementsReturn {
  tier: BeatMakerTier;
  limits: BeatMakerLimits;
  /** Whether the user is signed in with an active plan. */
  isSubscribed: boolean;
  /** Trigger upgrade flow. */
  startCheckout: UseSubscriptionResult["startCheckout"];
}

export function useBeatMakerEntitlements(
  subscription: UseSubscriptionResult,
): UseBeatMakerEntitlementsReturn {
  const tier = useMemo(
    () => resolveBeatMakerTier(subscription.status, subscription.plan),
    [subscription.status, subscription.plan],
  );

  const limits = useMemo(() => getBeatMakerLimits(tier), [tier]);

  const isSubscribed = subscription.status === "active";

  return {
    tier,
    limits,
    isSubscribed,
    startCheckout: subscription.startCheckout,
  };
}
