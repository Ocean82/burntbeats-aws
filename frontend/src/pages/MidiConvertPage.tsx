/**
 * MidiConvertPage — dedicated page for Audio-to-MIDI conversion.
 */
import { motion } from "framer-motion";
import { MidiConvertPanel } from "../components/midi-convert/MidiConvertPanel";
import { PanelHeader } from "../components/ui";
import { viewSwitchMotion } from "../motion/presets";
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
}: MidiConvertPageProps) {
  return (
    <motion.section className="stack-md" {...viewSwitchMotion(reduceMotion)}>
      <div
        className="glass-panel ui-panel overflow-hidden rounded-2xl"
        data-testid="midi-convert-page"
      >
        <PanelHeader
          title="Audio to MIDI"
          subtitle="Transcribe stems or uploads, refine in the editor, export to your DAW"
        />
        <div className="midi-workspace px-md pb-md sm:px-lg">
          <MidiConvertPanel
            usageBalance={usageBalance ?? null}
            usageLoading={usageLoading}
            subscriptionInactive={subscription.status === "inactive"}
          />
        </div>
        {subscription.billingError ? (
          <div
            className="mx-md mb-md rounded-xl border border-destructive-500/30 bg-destructive-950/20 px-md py-sm text-sm text-destructive-300 sm:mx-lg"
            role="alert"
          >
            {subscription.billingError}
          </div>
        ) : null}
        {checkoutNotice ? (
          <div className="mx-md mb-md rounded-xl border border-primary-500/30 bg-primary-500/10 px-md py-sm text-sm text-primary-100 sm:mx-lg">
            {checkoutNotice}
          </div>
        ) : null}
      </div>
    </motion.section>
  );
}
