import { useEffect, useRef, useState } from "react";

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
  const prevSplittingRef = useRef(false);
  const prevIsSampleRef = useRef(false);

  useEffect(() => {
    const wasSplitting = prevSplittingRef.current;
    const wasSample = prevIsSampleRef.current;
    prevSplittingRef.current = isSplitting;
    prevIsSampleRef.current = isSample;

    if (wasSplitting && !isSplitting && splitResultStemsLength > 0) {
      if (wasSample) {
        setUpsellTrigger("sample_complete");
        setUpsellOpen(true);
      } else if (usageBalance !== null && usageBalance < 2) {
        setUpsellTrigger("low_balance");
        setUpsellOpen(true);
      }
    }
  }, [isSplitting, isSample, splitResultStemsLength, usageBalance]);

  return { upsellOpen, setUpsellOpen, upsellTrigger };
}
