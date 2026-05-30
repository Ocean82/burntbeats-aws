import { useState } from "react";

type UpsellTrigger = "sample_complete" | "low_balance";

interface UseUpsellTriggersArgs {
  isSplitting: boolean;
  isSample: boolean;
  splitResultStemsLength: number;
  usageBalance: number | null;
}

export function useUpsellTriggers({
  isSplitting,
  isSample,
  splitResultStemsLength,
  usageBalance,
}: UseUpsellTriggersArgs) {
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [upsellTrigger, setUpsellTrigger] =
    useState<UpsellTrigger>("sample_complete");
  const [prevIsSplitting, setPrevIsSplitting] = useState(isSplitting);
  const [prevIsSample, setPrevIsSample] = useState(isSample);

  if (isSplitting !== prevIsSplitting || isSample !== prevIsSample) {
    const wasSplitting = prevIsSplitting;
    const wasSample = prevIsSample;
    setPrevIsSplitting(isSplitting);
    setPrevIsSample(isSample);

    if (wasSplitting && !isSplitting && splitResultStemsLength > 0) {
      if (wasSample) {
        setUpsellTrigger("sample_complete");
        setUpsellOpen(true);
      } else if (usageBalance !== null && usageBalance < 2) {
        setUpsellTrigger("low_balance");
        setUpsellOpen(true);
      }
    }
  }

  return { upsellOpen, setUpsellOpen, upsellTrigger };
}
