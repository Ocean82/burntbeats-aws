/**
 * UpsellModal — Prompts users to purchase a subscription or add credits
 * when they complete a free sample split or their token balance drops below 2.
 */
import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, CreditCard } from "lucide-react";

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
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="upsell-title"
            tabIndex={-1}
            className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1412]/95 p-6 shadow-2xl outline-none"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Header */}
            <div className="mb-5 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20">
                <Zap className="h-6 w-6 text-amber-400" />
              </div>
              <h2
                id="upsell-title"
                className="text-lg font-semibold text-white"
              >
                {trigger === "sample_complete"
                  ? "Like what you hear?"
                  : "Running low on tokens"}
              </h2>
              <p className="mt-2 text-sm text-white/70">
                {trigger === "sample_complete"
                  ? "Unlock full-length splits and downloads with a plan or credit pack."
                  : `You have ${balance ?? 0} token${balance === 1 ? "" : "s"} remaining. Add more to keep splitting.`}
              </p>
            </div>

            {/* Action buttons */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={onViewSubscriptions}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-500/20 to-orange-500/20 px-4 py-3.5 text-sm font-semibold text-amber-100 transition hover:border-amber-400/60 hover:from-amber-500/30 hover:to-orange-500/30"
              >
                <Zap className="h-4 w-4" />
                View Subscription Plans
              </button>

              <button
                type="button"
                onClick={onBuyCredits}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 text-sm font-semibold text-white/85 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
              >
                <CreditCard className="h-4 w-4" />
                Buy Credits (Pay As You Go)
              </button>
            </div>

            {/* Dismiss link */}
            <p className="mt-4 text-center">
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-white/40 transition hover:text-white/60"
              >
                Maybe later
              </button>
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
