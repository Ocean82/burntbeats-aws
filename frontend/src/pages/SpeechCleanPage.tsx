import { SpeechCleanPanel } from "../components/speech-clean/SpeechCleanPanel";
import { ToolPageShell } from "../components/ToolPageShell";
import type { UseSubscriptionResult } from "../hooks/useSubscription";

export interface SpeechCleanPageProps {
  reduceMotion: boolean;
  subscription: UseSubscriptionResult;
  usageBalance: number | null | undefined;
  usageLoading: boolean;
  checkoutNotice: string | null;
  onViewPlans?: () => void;
}

export function SpeechCleanPage({
  reduceMotion,
  subscription,
  usageBalance,
  usageLoading,
  checkoutNotice,
  onViewPlans,
}: SpeechCleanPageProps) {
  return (
    <ToolPageShell
      borderColorClass="border-info/25"
      reduceMotion={reduceMotion}
      subscription={subscription}
      checkoutNotice={checkoutNotice}
      testId="speech-clean-page"
      onViewPlans={onViewPlans}
    >
      <SpeechCleanPanel
        usageBalance={usageBalance ?? null}
        usageLoading={usageLoading}
        subscriptionInactive={subscription.status === "inactive"}
      />
    </ToolPageShell>
  );
}
