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
      <div className="flex shrink-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
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
            className="fire-button min-h-[44px] shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
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
                "min-h-[44px] inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed",
                isSample
                  ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200 shadow-[0_0_16px_rgba(52,211,153,0.25)]"
                  : "border-white/15 bg-white/5 text-white/65 hover:border-white/30 hover:text-white",
              )}
            >
              <Sparkles className={cn("h-3.5 w-3.5", isSample ? "text-emerald-300" : "text-white/40")} />
              {isSample ? "Free sample ✓" : "Try for free"}
            </button>
          )}
        </div>
        {isSample && (
          <p className="text-[11px] text-emerald-400/80">
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
                    "mb-1 flex items-center justify-between gap-2 text-[11px]",
                    queuePosition != null && !isUploading
                      ? "text-amber-200/80"
                      : "text-white/50",
                  )}
                >
                  <span>{progressCopy.primary}</span>
                  <span className="shrink-0 tabular-nums text-white/60">
                    {progressCopy.secondary ??
                      (!isUploading && queuePosition == null
                        ? `${Math.round(splitProgress)}%`
                        : "")}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
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
            className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/70 transition hover:border-amber-400/35 hover:bg-amber-500/10 hover:text-amber-100"
          >
            <Gamepad2 className="h-3.5 w-3.5 animate-pulse text-amber-300/90" aria-hidden />
            Play The Waiting Game while you wait
          </button>
        )}
      </div>

      {/* Queue button */}
      <div className="flex shrink-0 flex-col items-start gap-1">
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
          className="ghost-button shrink-0 rounded-xl border border-white/10 px-3 py-2.5 text-xs text-white/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="inline-flex items-center gap-1">
            + Queue
            {!canUseBatchQueue && (
              <Lock className="h-3 w-3 text-white/35" aria-hidden="true" />
            )}
          </span>
        </button>
        {!canUseBatchQueue && (
          <span className="max-w-[12rem] text-[10px] text-white/45">
            Premium &amp; Studio plans let you run whole queues
            automatically while you work.
          </span>
        )}
      </div>

      {/* Expanding indicator */}
      {isExpanding && (
        <span className="shrink-0 text-xs text-amber-200/80">
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
            className="ghost-button shrink-0 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/60 hover:text-white"
          >
            Expand → 4 stems
          </button>
        )}
    </>
  );
}
