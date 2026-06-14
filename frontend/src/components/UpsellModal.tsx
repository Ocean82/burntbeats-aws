/**
 * UpsellModal — Prompts users to purchase a subscription or add credits
 * when free allowance is exhausted or token balance is low.
 */
import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, CreditCard } from "lucide-react";
import { useModalA11y } from "../hooks/useModalA11y";
import { useProductMotion } from "../motion/useProductMotion";
import type { UpsellTrigger } from "../hooks/ui/useUpsellTriggers";

interface UpsellModalProps {
  open: boolean;
  onClose: () => void;
  onViewSubscriptions: () => void;
  onBuyCredits: () => void;
  trigger: UpsellTrigger;
  balance?: number | null;
}

export function UpsellModal({
  open,
  onClose,
  onViewSubscriptions,
  onBuyCredits,
  trigger,
  balance,
}: UpsellModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const motionCfg = useProductMotion();
  useModalA11y(open, modalRef, onClose);

  const title =
    trigger === "free_allowance_exhausted"
      ? "Free minutes used up"
      : trigger === "welcome_used"
        ? "Welcome minutes used"
        : "Running low on tokens";

  const body =
    trigger === "free_allowance_exhausted"
      ? "You've used this month's free minutes. Upgrade to Premium for full-length splits, 4-stem mode, and export."
      : trigger === "welcome_used"
        ? "Your welcome grant is spent. Grab a $0.99 Single Pack or start Premium for the full workstation."
        : `You have ${balance ?? 0} token${balance === 1 ? "" : "s"} remaining. Add more to keep splitting.`;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-modal-backdrop bg-secondary backdrop-blur-sm"
            {...motionCfg.modalBackdrop}
            onClick={onClose}
            aria-hidden="true"
          />
          <div className="fixed inset-0 z-modal flex items-center justify-center p-md pointer-events-none">
          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="upsell-title"
            tabIndex={-1}
            className="relative w-full max-w-md rounded-2xl border border-border bg-popover/95 p-lg shadow-elevation-xl outline-none pointer-events-auto"
            {...motionCfg.modalContent}
          >
            <button
              type="button"
              onClick={onClose}
              className="tap-target-expand absolute right-md top-md flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-[color,background-color] duration-[var(--motion-fast)] hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mb-lg text-center">
              <div className="mx-auto mb-sm flex h-12 w-12 items-center justify-center rounded-full bg-primary-500/20">
                <Zap className="h-6 w-6 text-primary-400" />
              </div>
              <h2
                id="upsell-title"
                className="text-lg font-semibold text-foreground"
              >
                {title}
              </h2>
              <p className="mt-xs text-sm text-secondary-foreground">{body}</p>
            </div>

            <div className="space-y-sm">
              <button
                type="button"
                onClick={onViewSubscriptions}
                className="tap-feedback flex min-h-[44px] w-full items-center justify-center gap-sm rounded-xl border border-primary-400/40 bg-gradient-to-r from-primary-500/20 to-primary-400/10 px-md py-sm text-sm font-semibold text-primary-100 transition-[color,background-color,border-color,transform] duration-[var(--motion-fast)] ease-[var(--ease-out-quart)] hover:border-primary-400/60 hover:from-primary-500/30 hover:to-primary-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
              >
                <Zap className="h-4 w-4" />
                Start Premium
              </button>

              <button
                type="button"
                onClick={onBuyCredits}
                className="tap-feedback flex min-h-[44px] w-full items-center justify-center gap-sm rounded-xl border border-border bg-muted px-md py-sm text-sm font-semibold text-secondary-foreground transition-[color,background-color,border-color,transform] duration-[var(--motion-fast)] ease-[var(--ease-out-quart)] hover:border-border hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
              >
                <CreditCard className="h-4 w-4" />
                Buy Top-Up · $5
              </button>
            </div>

            <p className="mt-md text-center">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-xs py-2xs text-xs text-muted-foreground underline-offset-2 transition-[color,text-decoration] duration-[var(--motion-fast)] hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Maybe later
              </button>
            </p>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
