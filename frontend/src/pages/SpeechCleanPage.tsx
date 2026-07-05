import { SpeechCleanPanel } from "../components/speech-clean/SpeechCleanPanel";
import { ToolPageShell } from "../components/ToolPageShell";
import { Skeleton } from "../components/ui/skeleton";
import type { UseSubscriptionResult } from "../hooks/useSubscription";

export interface SpeechCleanPageProps {
  reduceMotion: boolean;
  subscription: UseSubscriptionResult;
  usageBalance: number | null | undefined;
  usageLoading: boolean;
  checkoutNotice: string | null;
  onViewPlans?: () => void;
  onBackToHome?: () => void;
}

export function SpeechCleanPage({
  reduceMotion,
  subscription,
  usageBalance,
  usageLoading,
  checkoutNotice,
  onViewPlans,
  onBackToHome,
}: SpeechCleanPageProps) {
  return (
    <ToolPageShell
      borderColorClass="border-info/25"
      reduceMotion={reduceMotion}
      subscription={subscription}
      checkoutNotice={checkoutNotice}
      testId="speech-clean-page"
      onViewPlans={onViewPlans}
      onBackToHome={onBackToHome}
    >
      {usageLoading && (
        <div
          className="mb-md space-y-sm rounded-xl border border-info-400/15 bg-info-500/5 p-md"
          data-testid="speech-clean-skeleton"
          aria-busy="true"
        >
          <Skeleton variant="line" className="h-4 w-40" />
          <Skeleton variant="waveform" />
          <Skeleton variant="line" className="h-4 w-2/3" />
        </div>
      )}
      <SpeechCleanPanel
        usageBalance={usageBalance ?? null}
        usageLoading={usageLoading}
        subscriptionInactive={subscription.status === "inactive"}
      />
    </ToolPageShell>
  );
}
