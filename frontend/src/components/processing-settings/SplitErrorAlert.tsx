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
      className="mt-3 rounded-xl border border-red-400/30 bg-red-950/30 px-4 py-3"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-red-200">Split failed</p>
            <p className="mt-0.5 break-words text-xs text-red-300/90">
              {splitError}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-black transition hover:bg-amber-400"
          >
            Try Again
          </button>
          <button
            type="button"
            onClick={onDismissError}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10"
          >
            Dismiss
          </button>
        </div>
      </div>
    </motion.div>
  );
}
