import { motion, useReducedMotion } from "framer-motion";
import { alertRevealMotion } from "../../motion/presets";

export interface SplitErrorAlertProps {
  splitError: string;
  onDismissError: () => void;
  onRetry: () => void;
}

/** Error banner with retry and dismiss actions. */
export function SplitErrorAlert({
  splitError,
  onDismissError,
  onRetry,
}: SplitErrorAlertProps) {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <motion.div
      {...alertRevealMotion(reduceMotion)}
      className="mt-sm rounded-xl border border-destructive-400/30 bg-destructive-950/30 px-md py-sm"
    >
      <div className="flex flex-col gap-xs">
        <div className="flex items-start justify-between gap-sm">
          <div>
            <p className="text-sm font-medium text-destructive-200">Couldn&apos;t split this track</p>
            <p className="text-readable mt-0.5 text-xs text-destructive-300/90">
              {splitError}
            </p>
          </div>
        </div>
        <div className="flex gap-xs">
          <button
            type="button"
            onClick={onRetry}
            className="tap-feedback min-h-[44px] rounded-lg bg-primary px-sm py-xs text-xs font-medium text-primary-foreground transition-[color,background-color,transform] duration-[var(--motion-fast)] ease-[var(--ease-out-quart)] hover:bg-primary-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={onDismissError}
            className="tap-feedback min-h-[44px] rounded-lg border border-border px-sm py-xs text-xs text-secondary-foreground transition-[color,background-color,transform] duration-[var(--motion-fast)] ease-[var(--ease-out-quart)] hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            Dismiss
          </button>
        </div>
      </div>
    </motion.div>
  );
}
