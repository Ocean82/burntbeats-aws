import { useState } from "react";

type UpsellTrigger = "free_allowance_exhausted" | "welcome_used" | "low_balance";

interface UseUpsellTriggersArgs {
  isSplitting: boolean;
  splitResultStemsLength: number;
  usageBalance: number | null;
  freeMonthlyRemaining: number | null;
  paidBalance: number | null;
  subscriptionActive: boolean;
}

export function useUpsellTriggers({
  isSplitting,
  splitResultStemsLength,
  usageBalance,
  freeMonthlyRemaining,
  paidBalance,
  subscriptionActive,
}: UseUpsellTriggersArgs) {
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [upsellTrigger, setUpsellTrigger] =
    useState<UpsellTrigger>("low_balance");
  const [prevIsSplitting, setPrevIsSplitting] = useState(isSplitting);

  if (isSplitting !== prevIsSplitting) {
    const wasSplitting = prevIsSplitting;
    setPrevIsSplitting(isSplitting);

    if (wasSplitting && !isSplitting && splitResultStemsLength > 0) {
      if (
        !subscriptionActive &&
        (paidBalance ?? 0) <= 0 &&
        freeMonthlyRemaining !== null &&
        freeMonthlyRemaining <= 0
      ) {
        setUpsellTrigger("free_allowance_exhausted");
        setUpsellOpen(true);
      } else if (usageBalance !== null && usageBalance < 2) {
        setUpsellTrigger("low_balance");
        setUpsellOpen(true);
      }
    }
  }

  return { upsellOpen, setUpsellOpen, upsellTrigger };
}

export type { UpsellTrigger };
