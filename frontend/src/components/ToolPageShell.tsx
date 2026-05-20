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
  /** Tailwind border color class, e.g. "border-cyan-400/10" */
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
        className={`glass-panel mirror-sheen rounded-[2rem] border ${borderColorClass} px-5 py-5 sm:px-6`}
        data-testid={testId}
      >
        {children}
        {subscription.status === "inactive" && (
          <div className={`mt-4 border-t ${borderColorClass} pt-4`}>
            <PaywallBanner
              subscription={subscription}
              variant="teaser"
              onViewPlans={onViewPlans}
            />
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
