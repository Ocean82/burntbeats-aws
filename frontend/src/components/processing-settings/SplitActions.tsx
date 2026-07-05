import { useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { collapseMotion, productTransition } from "../../motion/presets";
import { Gamepad2, Loader2, Lock, Sparkles } from "lucide-react";
import { cn } from "../../utils/cn";
import type { SplitIntent } from "@shared/types";
import { getSplitProgressMessage } from "../../utils/splitProgressCopy";
import { intentLabel, legacyStemsFromIntent } from "../../utils/splitIntent";

export interface SplitActionsProps {
  uploadedFile: File | null;
  splitIntent: SplitIntent;
  isSample?: boolean;
  onToggleSample?: () => void;
  onSplit: (intent: SplitIntent, isSample?: boolean) => void;
  isSplitting: boolean;
  splitProgress: number;
  uploadProgress: number;
  isUploading: boolean;
  queuePosition: number | null;
  jobsAhead?: number | null;
  splitElapsedSeconds?: number | null;
  splitStageLabel?: string | null;
  uploadDurationSec?: number | null;
  splitResultStemsLength: number;
  onOpenWaitingGame?: () => void;
  hideSampleToggle?: boolean;
  canUseBatchQueue: boolean;
  onAddToQueue: () => void;
}

/** Split button, Try-for-free toggle, progress bar, and queue button. */
export function SplitActions({
  uploadedFile,
  splitIntent,
  isSample = false,
  onToggleSample,
  onSplit,
  isSplitting,
  splitProgress,
  uploadProgress,
  isUploading,
  queuePosition,
  jobsAhead = null,
  splitElapsedSeconds = null,
  splitStageLabel = null,
  uploadDurationSec = null,
  splitResultStemsLength,
  canUseBatchQueue,
  onAddToQueue,
  onOpenWaitingGame,
  hideSampleToggle = false,
}: SplitActionsProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const collapse = collapseMotion(reduceMotion);
  const stemCount: 2 | 4 = legacyStemsFromIntent(splitIntent) === "4" ? 4 : 2;
  const actionLabel = intentLabel(splitIntent);
  const progressCopy = useMemo(
    () =>
      getSplitProgressMessage({
        isUploading,
        uploadProgress,
        queuePosition,
        jobsAhead,
        splitProgress,
        elapsedSeconds: splitElapsedSeconds,
        uploadDurationSec,
        stemCount,
        progressStageLabel: splitStageLabel,
        splitIntent,
      }),
    [
      isUploading,
      uploadProgress,
      queuePosition,
      jobsAhead,
      splitProgress,
      splitElapsedSeconds,
      uploadDurationSec,
      stemCount,
      splitStageLabel,
      splitIntent,
    ],
  );
  // Announce progress at meaningful milestones to avoid spamming screen readers
  const progressAnnouncement = useMemo(() => {
    if (!isSplitting) return null;
    if (isUploading) return `Uploading file: ${Math.round(uploadProgress)}% complete`;
    if (queuePosition != null) {
      const ahead = jobsAhead ?? Math.max(0, queuePosition - 1);
      if (ahead === 0) return "Next in queue";
      if (ahead === 1) return "1 job ahead";
      return `${ahead} jobs ahead`;
    }
    if (splitStageLabel) return splitStageLabel;
    if (splitProgress >= 100) return "Split complete!";
    if (splitProgress >= 75) return "Splitting audio: 75% complete";
    if (splitProgress >= 50) return "Splitting audio: 50% complete";
    if (splitProgress >= 25) return "Splitting audio: 25% complete";
    return "Splitting audio, please wait…";
  }, [
    isSplitting,
    isUploading,
    uploadProgress,
    queuePosition,
    jobsAhead,
    splitProgress,
    splitStageLabel,
  ]);

  return (
    <>
      {/* Screen-reader milestone announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {progressAnnouncement}
      </div>
      {/* Split / action button + Try for free pill */}
      <div className="flex shrink-0 flex-col gap-xs">
        <div className="flex flex-wrap items-center gap-xs">
          <button
            type="button"
            onClick={() => onSplit(splitIntent, isSample)}
            disabled={
              !uploadedFile || isSplitting || splitResultStemsLength > 0
            }
            title={
              splitResultStemsLength > 0
                ? "Upload a new file to run separation again. Each upload is a new job."
                : undefined
            }
            className="fire-button tap-feedback min-h-[44px] shrink-0 inline-flex items-center justify-center gap-xs px-lg py-sm text-sm font-semibold transition-transform focus-visible:outline-none disabled:cursor-not-allowed active:scale-[0.97]"
          >
            {isSplitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Splitting
                {typeof splitProgress === "number" && splitProgress > 0
                  ? `… ${Math.round(splitProgress)}%`
                  : "…"}
              </>
            ) : splitResultStemsLength > 0 ? (
              "New file to split again"
            ) : (
              actionLabel
            )}
          </button>
          {!hideSampleToggle && onToggleSample && (
            <button
              type="button"
              onClick={onToggleSample}
              disabled={isSplitting || splitResultStemsLength > 0}
              title="Process only the first 60 seconds — free, no tokens used"
              className={cn(
                "tap-feedback min-h-[44px] inline-flex items-center gap-xs rounded-full border px-md py-xs text-xs font-semibold transition-[color,background-color,box-shadow,border-color] duration-[var(--motion-fast)] ease-[var(--ease-out-quart)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]",
                isSample
                  ? "border-success-400/60 bg-success-500/20 text-success-200 shadow-[0_0_16px_rgba(52,211,153,0.25)]"
                  : "border-border bg-muted text-muted-foreground hover:border-border hover:bg-secondary hover:text-foreground",
              )}
            >
              <Sparkles className={cn("h-3.5 w-3.5", isSample ? "text-success-300" : "text-muted-foreground")} />
              {isSample ? "Free sample ✓" : "Try for free"}
            </button>
          )}
        </div>
        {isSample && (
          <p className="text-xs text-success-400/80 sm:text-[11px]">
            60-second sample · no tokens consumed
          </p>
        )}
        {/* ── Real-time progress bar ── */}
        <AnimatePresence>
          {isSplitting && (
            <motion.div
              key="split-progress"
              {...collapse}
              role="status"
              aria-live="polite"
              aria-label={
                isUploading
                  ? `Uploading: ${Math.round(uploadProgress)}%`
                  : queuePosition != null
                    ? `Queued — position ${queuePosition}`
                    : `Splitting: ${Math.round(splitProgress)}%`
              }
            >
              <div className="mt-1 w-full min-w-[220px]">
                <div
                  className={cn(
                    "mb-1 flex items-center justify-between gap-xs text-helper",
                    queuePosition != null && !isUploading
                      ? "text-primary-200/80"
                      : "text-muted-foreground",
                  )}
                >
                  <span>{progressCopy.primary}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {progressCopy.secondary ??
                      (!isUploading && queuePosition == null
                        ? `${Math.round(splitProgress)}%`
                        : "")}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={{ width: "0%" }}
                    animate={{
                      width: isUploading
                        ? `${Math.max(2, uploadProgress)}%`
                        : queuePosition != null
                          ? "0%"
                          : `${Math.max(2, splitProgress)}%`,
                    }}
                    transition={productTransition(reduceMotion, "normal")}
                  />
                </div>
              </div>
              {!isUploading && queuePosition == null && splitProgress > 5 && (
                <p className="mt-1 text-helper text-muted-foreground/70">
                  We&apos;ll email you when your stems are ready &mdash; you can safely close this tab.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        {isSplitting && onOpenWaitingGame && (
          <button
            type="button"
            onClick={onOpenWaitingGame}
            className="tap-feedback inline-flex min-h-[44px] items-center gap-xs rounded-lg border border-border bg-muted px-sm py-xs text-xs font-medium text-secondary-foreground transition-[color,background-color,border-color,transform] duration-[var(--motion-fast)] ease-[var(--ease-out-quart)] hover:border-primary-400/35 hover:bg-primary-500/10 hover:text-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            <Gamepad2 className="h-3.5 w-3.5 text-primary-300/90" aria-hidden />
            Play The Waiting Game while you wait
          </button>
        )}
      </div>

      <details className="shrink-0 rounded-xl border border-border bg-muted/40 px-sm py-1.5 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none font-medium text-secondary-foreground hover:text-foreground">
          More options
        </summary>
        <div className="mt-sm flex flex-col gap-2xs">
          <button
            type="button"
            onClick={onAddToQueue}
            disabled={
              !uploadedFile ||
              isSplitting ||
              !canUseBatchQueue ||
              splitResultStemsLength > 0
            }
            title={
              splitResultStemsLength > 0
                ? "Clear results by uploading a new file before adding to the queue."
                : canUseBatchQueue
                  ? "Add to batch queue"
                  : "Requires Premium or Studio"
            }
            className="ghost-button tap-feedback w-full min-h-[44px] rounded-lg border border-border px-sm py-sm text-left text-muted-foreground hover:text-foreground focus-visible:outline-none disabled:cursor-not-allowed"
          >
            <span className="inline-flex items-center gap-2xs">
              Add to batch queue
              {!canUseBatchQueue && (
                <Lock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
              )}
            </span>
          </button>
          {!canUseBatchQueue && (
            <p className="text-helper leading-relaxed text-muted-foreground">
              Premium &amp; Studio plans can process whole queues automatically.
            </p>
          )}
        </div>
      </details>

    </>
  );
}
