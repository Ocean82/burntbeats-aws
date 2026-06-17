import { Loader2, AlertTriangle, Gamepad2 } from "lucide-react";
import { cn } from "../../utils/cn";
import type { SplitIntent } from "../../utils/splitIntent";
import { intentLabel } from "../../utils/splitIntent";

export interface ExecutionFooterProps {
  splitError: string | null;
  onDismissError: () => void;
  onSplit: (intent: SplitIntent, isSample?: boolean) => void;
  uploadedFile: File | null;
  splitIntent: SplitIntent;
  isSplitting: boolean;
  splitProgress: number;
  uploadProgress: number;
  isUploading: boolean;
  queuePosition: number | null;
  jobsAhead?: number | null;
  splitStageLabel?: string | null;
  splitResultStemsLength: number;
  estimatedSplitTokens: number | null;
  usageBalance: number | null;
  usageLoading: boolean;
  isSample?: boolean;
  onOpenWaitingGame?: () => void;
  subscriptionInactive?: boolean;
  onUpgradeToPremium?: () => void;
}

export function ExecutionFooter({
  splitError,
  onDismissError,
  onSplit,
  uploadedFile,
  splitIntent,
  isSplitting,
  splitProgress,
  uploadProgress,
  isUploading,
  queuePosition,
  jobsAhead = null,
  splitStageLabel = null,
  splitResultStemsLength,
  estimatedSplitTokens,
  usageBalance,
  usageLoading,
  isSample = false,
  onOpenWaitingGame,
  subscriptionInactive = false,
}: ExecutionFooterProps) {
  const showCost =
    !usageLoading &&
    estimatedSplitTokens !== null &&
    uploadedFile != null;
  const actionLabel = intentLabel(splitIntent);
  const hasResult = splitResultStemsLength > 0;
  const canSplit = uploadedFile != null && !isSplitting && !hasResult;

  return (
    <div className="rounded-xl border border-border bg-muted/50">
      {splitError && (
        <div className="flex items-start gap-2 border-b border-destructive-400/20 bg-destructive-500/10 px-md py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive-300" />
          <p className="flex-1 text-xs text-destructive-200">{splitError}</p>
          <button
            type="button"
            onClick={onDismissError}
            className="text-xs font-medium text-destructive-300 hover:text-destructive-100"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex items-center gap-sm px-md py-2.5">
        {showCost && (
          <span className="text-[11px] text-muted-foreground">
            ~{estimatedSplitTokens} token
            {estimatedSplitTokens === 1 ? "" : "s"}
            {usageBalance !== null && ` · ${Math.floor(usageBalance)} available`}
          </span>
        )}
        {usageLoading && (
          <span className="text-[11px] text-muted-foreground">Loading tokens…</span>
        )}

        {!showCost && !usageLoading && uploadedFile && (
          <span className="text-[11px] text-muted-foreground">
            {hasResult ? "Split complete" : "Ready to split"}
          </span>
        )}

        <div className="flex-1" />

        {subscriptionInactive && !canSplit && (
          <span className="text-[11px] text-muted-foreground">
            Upgrade to split
          </span>
        )}

        <button
          type="button"
          onClick={() => onSplit(splitIntent, isSample)}
          disabled={!canSplit}
          className={cn(
            "tap-feedback inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors",
            canSplit
              ? "fire-button"
              : "cursor-not-allowed border border-border bg-muted text-muted-foreground",
          )}
        >
          {isSplitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {splitStageLabel || `Splitting… ${Math.round(splitProgress)}%`}
            </>
          ) : hasResult ? (
            "Upload new file"
          ) : (
            actionLabel
          )}
        </button>
      </div>

      {isSplitting && (
        <div className="px-md pb-2.5">
          <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
              style={{
                width: isUploading
                  ? `${Math.max(2, uploadProgress)}%`
                  : queuePosition != null
                    ? "0%"
                    : `${Math.max(2, splitProgress)}%`,
              }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>
              {isUploading
                ? "Uploading…"
                : queuePosition != null
                  ? `Queued: #${queuePosition}`
                  : splitStageLabel || "Processing…"}
            </span>
            <span>
              {isUploading
                ? `${Math.round(uploadProgress)}%`
                : queuePosition != null
                  ? `${jobsAhead ?? 0} ahead`
                  : `${Math.round(splitProgress)}%`}
            </span>
          </div>
        </div>
      )}

      {isSplitting && onOpenWaitingGame && (
        <div className="flex items-center justify-center border-t border-border/40 px-md py-1.5">
          <button
            type="button"
            onClick={onOpenWaitingGame}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-300 hover:text-primary-200"
          >
            <Gamepad2 className="h-3 w-3" />
            Play The Waiting Game
          </button>
        </div>
      )}
    </div>
  );
}
