/**
 * ToolPageShell — shared wrapper for tool pages (Speech Clean, MIDI Convert, etc.)
 * Provides consistent animation, glass panel styling, paywall banner, and error/notice display.
 */
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { PaywallBanner } from "./PaywallBanner";
import type { UseSubscriptionResult } from "../hooks/useSubscription";

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
}

export function ToolPageShell({
  children,
  borderColorClass,
  reduceMotion,
  subscription,
  checkoutNotice,
  testId,
  onViewPlans,
}: ToolPageShellProps) {
  return (
    <motion.section
      className="stack-md"
      {...(reduceMotion
        ? { initial: false, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } }
        : {
            initial: { opacity: 0, y: 16 },
            animate: { opacity: 1, y: 0 },
            transition: { duration: 0.4 },
          })}
    >
      <div
        className={`glass-panel mirror-sheen rounded-[2rem] border ${borderColorClass} px-lg py-lg sm:px-lg`}
        data-testid={testId}
      >
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
          <div className="mt-sm rounded-xl border border-destructive-500/30 bg-destructive-950/20 px-md py-sm text-sm text-destructive-300">
            {subscription.billingError}
          </div>
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
