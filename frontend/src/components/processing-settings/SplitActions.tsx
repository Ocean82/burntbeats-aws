import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gamepad2, Loader2, Lock, Sparkles } from "lucide-react";
import { cn } from "../../utils/cn";
import { getSplitProgressMessage } from "../../utils/splitProgressCopy";

export interface SplitActionsProps {
  uploadedFile: File | null;
  requestedStemMode: 2 | 4;
  isSample: boolean;
  onToggleSample: () => void;
  onSplit: (requestedStemMode: 2 | 4, isSample?: boolean) => void;
  isSplitting: boolean;
  splitProgress: number;
  uploadProgress: number;
  isUploading: boolean;
  queuePosition: number | null;
  splitElapsedSeconds?: number | null;
  uploadDurationSec?: number | null;
  splitResultStemsLength: number;
  onOpenWaitingGame?: () => void;
  hideSampleToggle?: boolean;
  isExpanding: boolean;
  onExpand: () => void;
  canExpandToFourStems: boolean;
  splitError: string | null;
  canUseBatchQueue: boolean;
  onAddToQueue: () => void;
}

/** Split button, Try-for-free toggle, progress bar, queue button, and expand button. */
export function SplitActions({
  uploadedFile,
  requestedStemMode,
  isSample,
  onToggleSample,
  onSplit,
  isSplitting,
  splitProgress,
  uploadProgress,
  isUploading,
  queuePosition,
  splitElapsedSeconds = null,
  uploadDurationSec = null,
  splitResultStemsLength,
  isExpanding,
  onExpand,
  canExpandToFourStems,
  splitError,
  canUseBatchQueue,
  onAddToQueue,
  onOpenWaitingGame,
  hideSampleToggle = false,
}: SplitActionsProps) {
  const stemCount: 2 | 4 = requestedStemMode;
  const progressCopy = useMemo(
    () =>
      getSplitProgressMessage({
        isUploading,
        uploadProgress,
        queuePosition,
        splitProgress,
        elapsedSeconds: splitElapsedSeconds,
        uploadDurationSec,
        stemCount,
      }),
    [
      isUploading,
      uploadProgress,
      queuePosition,
      splitProgress,
      splitElapsedSeconds,
      uploadDurationSec,
      stemCount,
    ],
  );
  // Announce progress at meaningful milestones to avoid spamming screen readers
  const progressAnnouncement = useMemo(() => {
    if (!isSplitting) return null;
    if (isUploading) return `Uploading file: ${Math.round(uploadProgress)}% complete`;
    if (queuePosition != null) return `Queued at position ${queuePosition}`;
    if (splitProgress >= 100) return "Split complete!";
    if (splitProgress >= 75) return "Splitting audio: 75% complete";
    if (splitProgress >= 50) return "Splitting audio: 50% complete";
    if (splitProgress >= 25) return "Splitting audio: 25% complete";
    return "Splitting audio, please wait…";
  }, [isSplitting, isUploading, uploadProgress, queuePosition, splitProgress]);

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
            onClick={() => onSplit(requestedStemMode, isSample)}
            disabled={
              !uploadedFile || isSplitting || splitResultStemsLength > 0
            }
            title={
              splitResultStemsLength > 0
                ? "Upload a new file to run separation again. Each upload is a new job."
                : undefined
            }
            className="fire-button min-h-[44px] shrink-0 inline-flex items-center justify-center gap-xs px-lg py-sm text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
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
            ) : requestedStemMode === 4 ? (
              "Split → 4 stems"
            ) : (
              "Split stems"
            )}
          </button>
          {!hideSampleToggle && (
            <button
              type="button"
              onClick={onToggleSample}
              disabled={isSplitting || splitResultStemsLength > 0}
              aria-pressed={isSample}
              title="Process only the first 60 seconds — free, no tokens used"
              className={cn(
                "min-h-[44px] inline-flex items-center gap-xs rounded-full border px-md py-xs text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed",
                isSample
                  ? "border-success-400/60 bg-success-500/20 text-success-200 shadow-[0_0_16px_rgba(52,211,153,0.25)]"
                  : "border-border bg-muted text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              <Sparkles className={cn("h-3.5 w-3.5", isSample ? "text-success-300" : "text-muted-foreground")} />
              {isSample ? "Free sample ✓" : "Try for free"}
            </button>
          )}
        </div>
        {isSample && (
          <p className="text-[11px] text-success-400/80">
            60-second sample · no tokens consumed
          </p>
        )}
        {/* ── Real-time progress bar ── */}
        <AnimatePresence>
          {isSplitting && (
            <motion.div
              key="split-progress"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: "hidden" }}
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
                    "mb-1 flex items-center justify-between gap-xs text-[11px]",
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
                    className="h-full rounded-full bg-[linear-gradient(90deg,#ff633d_0%,#ffbb61_44%,#ffe3a0_100%)]"
                    initial={{ width: "0%" }}
                    animate={{
                      width: isUploading
                        ? `${Math.max(2, uploadProgress)}%`
                        : queuePosition != null
                          ? "0%"
                          : `${Math.max(2, splitProgress)}%`,
                    }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {isSplitting && onOpenWaitingGame && (
          <button
            type="button"
            onClick={onOpenWaitingGame}
            className="inline-flex min-h-[36px] items-center gap-xs rounded-lg border border-border bg-muted px-sm py-1.5 text-[11px] font-medium text-secondary-foreground transition hover:border-primary-400/35 hover:bg-primary-500/10 hover:text-primary-100"
          >
            <Gamepad2 className="h-3.5 w-3.5 animate-pulse text-primary-300/90" aria-hidden />
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
            className="ghost-button w-full rounded-lg border border-border px-sm py-sm text-left text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="inline-flex items-center gap-2xs">
              Add to batch queue
              {!canUseBatchQueue && (
                <Lock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
              )}
            </span>
          </button>
          {!canUseBatchQueue && (
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Premium &amp; Studio plans can process whole queues automatically.
            </p>
          )}
        </div>
      </details>

      {/* Expanding indicator */}
      {isExpanding && (
        <span className="shrink-0 text-xs text-primary-200/80">
          Expanding to 4 stems…
        </span>
      )}

      {/* Manual expand */}
      {canExpandToFourStems &&
        splitResultStemsLength === 2 &&
        !isExpanding &&
        !isSplitting &&
        !splitError && (
          <button
            type="button"
            onClick={() => onExpand()}
            className="ghost-button shrink-0 rounded-xl border border-border px-sm py-xs text-xs text-muted-foreground hover:text-foreground"
          >
            Expand → 4 stems
          </button>
        )}
    </>
  );
}
