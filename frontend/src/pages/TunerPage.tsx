/**
 * TunerPage — standalone visual tuner (acquisition + pre-convert QA tool).
 */
import { ToolPageShell } from "../components/ToolPageShell";
import { VisualTunerPanel } from "../components/tuner/VisualTunerPanel";
import type { UseSubscriptionResult } from "../hooks/useSubscription";

export interface TunerPageProps {
  reduceMotion: boolean;
  subscription: UseSubscriptionResult;
  checkoutNotice: string | null;
  onViewPlans?: () => void;
  onGoToEditor?: () => void;
  onBackToHome?: () => void;
}

export function TunerPage({
  reduceMotion,
  subscription,
  checkoutNotice,
  onViewPlans,
  onGoToEditor,
  onBackToHome,
}: TunerPageProps) {
  return (
    <ToolPageShell
      borderColorClass="border-primary-400/15"
      reduceMotion={reduceMotion}
      subscription={subscription}
      checkoutNotice={checkoutNotice}
      testId="tuner-page"
      onViewPlans={onViewPlans}
      onBackToHome={onBackToHome}
    >
      <VisualTunerPanel onGoToEditor={onGoToEditor} />
    </ToolPageShell>
  );
}
