/**
 * MidiConvertPage — dedicated page for Audio-to-MIDI conversion.
 */
import { MidiConvertPanel } from "../components/midi-convert/MidiConvertPanel";
import { ToolPageShell } from "../components/ToolPageShell";
import type { UseSubscriptionResult } from "../hooks/useSubscription";

export interface MidiConvertPageProps {
  reduceMotion: boolean;
  subscription: UseSubscriptionResult;
  usageBalance: number | null | undefined;
  usageLoading: boolean;
  checkoutNotice: string | null;
  onViewPlans?: () => void;
}

export function MidiConvertPage({
  reduceMotion,
  subscription,
  usageBalance,
  usageLoading,
  checkoutNotice,
  onViewPlans,
}: MidiConvertPageProps) {
  return (
    <ToolPageShell
      borderColorClass="border-accent-midi/25"
      reduceMotion={reduceMotion}
      subscription={subscription}
      checkoutNotice={checkoutNotice}
      testId="midi-convert-page"
      onViewPlans={onViewPlans}
    >
      <MidiConvertPanel
        usageBalance={usageBalance ?? null}
        usageLoading={usageLoading}
        subscriptionInactive={subscription.status === "inactive"}
      />
    </ToolPageShell>
  );
}
