/**
 * ToolPageShell — shared wrapper for tool pages (Speech Clean, MIDI Convert, etc.)
 * Provides consistent animation, glass panel styling, paywall banner, and error/notice display.
 */
import { motion } from "framer-motion";
import { viewSwitchMotion } from "../motion/presets";
import type { ReactNode } from "react";
import { PaywallBanner } from "./PaywallBanner";
import type { UseSubscriptionResult } from "../hooks/useSubscription";
import { ErrorState } from "./ui/error-state";

export interface ToolPageShellProps {
  children: ReactNode;
  /** Tailwind border color class, e.g. "border-info-400/10" */
  borderColorClass: string;
  reduceMotion: boolean;
  subscription: UseSubscriptionResult;
  checkoutNotice: string | null;
  testId?: string;
  /** Optional callback when user clicks "View all plans" in the teaser paywall */
  onViewPlans?: () => void;
  /** Optional back-navigation callback rendered as a subtle link above the panel */
  onBackToHub?: () => void;
}

export function ToolPageShell({
  children,
  borderColorClass,
  reduceMotion,
  subscription,
  checkoutNotice,
  testId,
  onViewPlans,
  onBackToHub,
}: ToolPageShellProps) {
  return (
    <motion.section
      className="stack-md"
      {...viewSwitchMotion(reduceMotion)}
    >
      <div
        className={`rounded-2xl border bg-muted/20 ${borderColorClass} px-lg py-lg sm:px-lg`}
        data-testid={testId}
      >
        {onBackToHub && (
          <button
            type="button"
            onClick={onBackToHub}
            className="mb-md inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-primary-200 tap-feedback"
          >
            <span aria-hidden="true">←</span>
            Back to Hub
          </button>
        )}
        {children}
        {subscription.status === "inactive" && (
          <div className={`mt-md border-t ${borderColorClass} pt-md`}>
            <PaywallBanner
              subscription={subscription}
              variant="teaser"
              onViewPlans={onViewPlans}
            />
          </div>
        )}
        {subscription.billingError && (
          <ErrorState
            variant="server"
            title="Billing issue"
            description={subscription.billingError}
            className="mt-sm px-md py-sm text-left"
          />
        )}
        {checkoutNotice && (
          <div className="mt-sm rounded-xl border border-primary-500/30 bg-primary-500/10 px-md py-sm text-sm text-primary-100">
            {checkoutNotice}
          </div>
        )}
      </div>
    </motion.section>
  );
}
