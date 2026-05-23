/**
 * UpsellModal — Prompts users to purchase a subscription or add credits
 * when they complete a free sample split or their token balance drops below 2.
 */
import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, CreditCard } from "lucide-react";
import { useProductMotion } from "../motion/useProductMotion";

interface UpsellModalProps {
  open: boolean;
  onClose: () => void;
  onViewSubscriptions: () => void;
  onBuyCredits: () => void;
  /** Context for why the modal appeared */
  trigger: "sample_complete" | "low_balance";
  /** Current token balance (if available) */
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

  // Trap focus and handle Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    // Focus the modal on open
    modalRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[200] bg-secondary backdrop-blur-sm"
            {...motionCfg.modalBackdrop}
            onClick={onClose}
            aria-hidden="true"
          />
          <div className="fixed inset-0 z-[201] flex items-center justify-center p-md pointer-events-none">
          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="upsell-title"
            tabIndex={-1}
            className="relative w-full max-w-md rounded-2xl border border-border bg-popover/95 p-lg shadow-elevation-xl outline-none pointer-events-auto"
            {...motionCfg.modalContent}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 rounded-lg p-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Header */}
            <div className="mb-5 text-center">
              <div className="mx-auto mb-sm flex h-12 w-12 items-center justify-center rounded-full bg-primary-500/20">
                <Zap className="h-6 w-6 text-primary-400" />
              </div>
              <h2
                id="upsell-title"
                className="text-lg font-semibold text-foreground"
              >
                {trigger === "sample_complete"
                  ? "Like what you hear?"
                  : "Running low on tokens"}
              </h2>
              <p className="mt-xs text-sm text-secondary-foreground">
                {trigger === "sample_complete"
                  ? "Unlock full-length splits and downloads with a plan or credit pack."
                  : `You have ${balance ?? 0} token${balance === 1 ? "" : "s"} remaining. Add more to keep splitting.`}
              </p>
            </div>

            {/* Action buttons */}
            <div className="space-y-sm">
              <button
                type="button"
                onClick={onViewSubscriptions}
                className="flex w-full items-center justify-center gap-sm rounded-xl border border-primary-400/40 bg-gradient-to-r from-primary-500/20 to-orange-500/20 px-md py-sm text-sm font-semibold text-primary-100 transition hover:border-primary-400/60 hover:from-primary-500/30 hover:to-orange-500/30"
              >
                <Zap className="h-4 w-4" />
                View Subscription Plans
              </button>

              <button
                type="button"
                onClick={onBuyCredits}
                className="flex w-full items-center justify-center gap-sm rounded-xl border border-border bg-muted px-md py-sm text-sm font-semibold text-secondary-foreground transition hover:border-border hover:bg-muted hover:text-foreground"
              >
                <CreditCard className="h-4 w-4" />
                Buy Credits (Pay As You Go)
              </button>
            </div>

            {/* Dismiss link */}
            <p className="mt-md text-center">
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-muted-foreground transition hover:text-muted-foreground"
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
