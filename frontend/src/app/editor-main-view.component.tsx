import { motion } from "framer-motion";
import type { ComponentProps } from "react";

import type { GuidanceTarget } from "../hooks/useGuidanceSystem";
import { cn } from "../utils/cn";
import { SplitErrorBoundary } from "../components/ErrorBoundary";
import { ProcessingSettingsPanel } from "../components/ProcessingSettingsPanel";
import { PaywallBanner } from "../components/PaywallBanner";
import type { UseSubscriptionResult } from "../hooks/useSubscription";
import { MixerWorkspace } from "./mixer-workspace.component";

export interface EditorChromeProps {
  guidanceTarget: GuidanceTarget;
  guidanceRingClass: string;
  /** Panel pointer handler for collapsing guidance pulse. */
  handleGuidancePanelInteract: React.PointerEventHandler<HTMLDivElement>;
  subscription: UseSubscriptionResult;
  checkoutNotice: string | null;
}

export type EditorMixerWorkspaceProps = ComponentProps<typeof MixerWorkspace>;

export type EditorProcessingProps = ComponentProps<
  typeof ProcessingSettingsPanel
>;

export interface EditorMainViewProps {
  reduceMotion: boolean;
  chrome: EditorChromeProps;
  processingProps: EditorProcessingProps;
  mixerProps: EditorMixerWorkspaceProps;
}

/** Marquee, processing/settings rail, and mixer workspace — editor home (non-pricing) body. */
export function EditorMainView({
  reduceMotion,
  chrome: {
    guidanceTarget,
    guidanceRingClass,
    handleGuidancePanelInteract,
    subscription,
    checkoutNotice,
  },
  processingProps,
  mixerProps,
}: EditorMainViewProps) {
  return (
    <>
      {/* Marquee — static text on small screens to reduce motion noise */}
      <div className="overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] backdrop-blur-sm md:hidden">
        <p className="px-4 py-3 text-center text-[11px] uppercase leading-relaxed tracking-[0.18em] text-white/45">
          Drop track · Split · Mix · Export · Premium &amp; Studio unlock batch
          &amp; faster queues.
        </p>
      </div>
      <motion.div
        className="hidden overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] backdrop-blur-sm md:block"
        {...(reduceMotion
          ? {
              initial: false,
              animate: { opacity: 1 },
              transition: { duration: 0 },
            }
          : {
              initial: { opacity: 0.6 },
              animate: { opacity: 1 },
              transition: { duration: 0.5 },
            })}
      >
        <div className="flex w-max animate-scroll-text gap-14 py-2 text-[11px] uppercase tracking-[0.22em] text-white/45">
          <span>Drop track · Split · Mix · Export</span>
          <span>
            Hit your first finished stem in minutes — then batch the rest.
          </span>
          <span>Drop track · Split · Mix · Export</span>
          <span>Premium & Studio plans unlock faster queues and more stems.</span>
        </div>
      </motion.div>

      <motion.section
        className="flex flex-col gap-4"
        initial="hidden"
        animate="visible"
        variants={{
          visible: {
            transition: { staggerChildren: reduceMotion ? 0 : 0.08 },
          },
          hidden: {},
        }}
      >
        <motion.div
          onPointerDown={handleGuidancePanelInteract}
          className={cn(
            "glass-panel mirror-sheen rounded-[2rem] px-5 py-4 sm:px-6",
            guidanceTarget === "source" && guidanceRingClass,
            processingProps.isSplitting && "splitting-scan-glow",
          )}
          variants={{
            hidden: { opacity: 0, y: 12 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={{ duration: reduceMotion ? 0 : 0.4 }}
        >
          <SplitErrorBoundary>
            <ProcessingSettingsPanel {...processingProps} />
            {subscription.status === "inactive" && (
              <div className="mt-3 border-t border-white/10 pt-3">
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
          </SplitErrorBoundary>
        </motion.div>

        <MixerWorkspace {...mixerProps} />
      </motion.section>
    </>
  );
}
