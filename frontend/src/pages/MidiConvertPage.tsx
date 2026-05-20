/**
 * MidiConvertPage — dedicated page for Audio-to-MIDI conversion.
 * Follows the same pattern as SpeechCleanPage.
 */
import { motion } from "framer-motion";
import { MidiConvertPanel } from "../components/midi-convert/MidiConvertPanel";
import { PaywallBanner } from "../components/PaywallBanner";
import type { UseSubscriptionResult } from "../hooks/useSubscription";

export interface MidiConvertPageProps {
  reduceMotion: boolean;
  subscription: UseSubscriptionResult;
  usageBalance: number | null | undefined;
  usageLoading: boolean;
  checkoutNotice: string | null;
}

export function MidiConvertPage({
  reduceMotion,
  subscription,
  usageBalance,
  usageLoading,
  checkoutNotice,
}: MidiConvertPageProps) {
  return (
    <motion.section
      className="flex flex-col gap-4"
      {...(reduceMotion
        ? { initial: false, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } }
        : {
            initial: { opacity: 0, y: 16 },
            animate: { opacity: 1, y: 0 },
            transition: { duration: 0.4 },
          })}
    >
      <div
        className="glass-panel mirror-sheen rounded-[2rem] border border-violet-400/10 px-5 py-5 sm:px-6"
        data-testid="midi-convert-page"
      >
        <MidiConvertPanel
          usageBalance={usageBalance ?? null}
          usageLoading={usageLoading}
          subscriptionInactive={subscription.status === "inactive"}
        />
        {subscription.status === "inactive" && (
          <div className="mt-4 border-t border-violet-400/10 pt-4">
            <PaywallBanner subscription={subscription} />
          </div>
        )}
        {subscription.billingError && (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-300">
            {subscription.billingError}
          </div>
        )}
        {checkoutNotice && (
          <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {checkoutNotice}
          </div>
        )}
      </div>
    </motion.section>
  );
}
