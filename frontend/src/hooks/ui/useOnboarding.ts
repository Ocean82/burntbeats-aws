import { useMemo } from "react";
import { ENABLE_ONBOARDING_QUEST } from "../config/uiFlags";

interface OnboardingArgs {
  uploadedFile: File | null;
  splitResultStemsLength: number;
  mixStemsLength: number;
  hasCompletedFirstExport: boolean;
}

export function useOnboarding({
  uploadedFile,
  splitResultStemsLength,
  mixStemsLength,
  hasCompletedFirstExport,
}: OnboardingArgs) {
  const onboardingSteps = useMemo(() => {
    const base = [
      {
        id: 1,
        label: "Upload a track",
        done: !!uploadedFile,
      },
      {
        id: 2,
        label: "Split into stems",
        done: splitResultStemsLength > 0,
      },
      {
        id: 3,
        label: "Mix & tweak",
        done: mixStemsLength > 0,
      },
    ];
    if (!ENABLE_ONBOARDING_QUEST) return base;
    return [
      ...base,
      {
        id: 4,
        label: "Export a master mix",
        done: hasCompletedFirstExport,
      },
    ];
  }, [
    uploadedFile,
    splitResultStemsLength,
    mixStemsLength,
    hasCompletedFirstExport,
  ]);

  return { onboardingSteps };
}
