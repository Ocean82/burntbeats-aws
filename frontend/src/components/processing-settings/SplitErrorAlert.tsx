import { motion } from "framer-motion";

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
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-sm rounded-xl border border-destructive-400/30 bg-destructive-950/30 px-md py-sm"
    >
      <div className="flex flex-col gap-xs">
        <div className="flex items-start justify-between gap-sm">
          <div>
            <p className="text-sm font-medium text-destructive-200">Couldn&apos;t split this track</p>
            <p className="mt-0.5 break-words text-xs text-destructive-300/90">
              {splitError}
            </p>
          </div>
        </div>
        <div className="flex gap-xs">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-primary-500 px-sm py-1.5 text-xs font-medium text-black transition hover:bg-primary-400"
          >
            Try Again
          </button>
          <button
            type="button"
            onClick={onDismissError}
            className="rounded-lg border border-border px-sm py-1.5 text-xs text-secondary-foreground transition hover:bg-muted"
          >
            Dismiss
          </button>
        </div>
      </div>
    </motion.div>
  );
}
