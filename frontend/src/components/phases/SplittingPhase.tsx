import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, AlertCircle, Upload } from "lucide-react";
import { cn } from "@/utils/cn";
import type { AppPhase } from "@/types/phases";

export interface SplittingPhaseProps {
  transitionTo: (next: AppPhase) => void;
  progress: number;
  error: string | null;
  onRetry: () => void;
  estimatedSeconds?: number | null;
  onChangeFile: () => void;
  /** Backend-reported processing stage (e.g. "Analyzing audio...", "Separating vocals...") */
  stageLabel?: string | null;
}

/** Format elapsed seconds as "Xm Ys" or "Xs". */
function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

/**
 * Full-screen splitting phase — progress indicator with elapsed time,
 * estimated time remaining, and error/retry UI.
 * This is the ONLY element visible during the "splitting" phase (Req 2.3).
 */
export function SplittingPhase({
  transitionTo,
  progress,
  error,
  onRetry,
  estimatedSeconds,
  onChangeFile,
  stageLabel,
}: SplittingPhaseProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Elapsed time timer — ticks every 1 second, stops on error
  useEffect(() => {
    if (error) {
      // Stop timer on error
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [error]);

  // Transition to workspace on completion
  useEffect(() => {
    if (progress >= 100 && !error) {
      transitionTo("workspace");
    }
  }, [progress, error, transitionTo]);

  // Compute estimated remaining time
  const renderEstimatedRemaining = (): string => {
    if (!estimatedSeconds) {
      return "Estimating...";
    }
    const remaining = estimatedSeconds - elapsedSeconds;
    if (remaining <= 0) {
      return "Almost done...";
    }
    return `~${formatElapsed(remaining)} remaining`;
  };

  return (
    <div
      data-testid="splitting-phase"
      className="flex h-full w-full items-center justify-center bg-[hsl(220,15%,8%)] p-6"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-2xl border border-border/30 bg-muted/30 px-10 py-12 text-center">
        {/* Error state */}
        {error ? (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10">
              <AlertCircle className="h-7 w-7 text-destructive" />
            </div>

            <div>
              <p className="text-lg font-bold text-foreground">
                Splitting failed
              </p>
              <p
                role="alert"
                className="mt-2 text-sm text-destructive"
              >
                {error}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-sm">
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border border-border/50 px-4 py-2",
                  "text-sm font-medium text-foreground",
                  "transition-colors duration-150",
                  "hover:border-primary-400/50 hover:bg-primary-500/5",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(220,15%,8%)]",
                )}
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
              <button
                type="button"
                onClick={onChangeFile}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border border-border/50 px-4 py-2",
                  "text-sm font-medium text-foreground",
                  "transition-colors duration-150",
                  "hover:border-primary-400/50 hover:bg-primary-500/5",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(220,15%,8%)]",
                )}
              >
                <Upload className="h-4 w-4" />
                Choose a different file
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Active splitting state */}
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-primary-400/40 bg-primary-500/10">
              <Loader2 className="h-7 w-7 animate-spin text-primary-400" />
            </div>

            <div>
              <p className="text-lg font-bold text-foreground">
                {stageLabel || "Splitting stems..."}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {renderEstimatedRemaining()}
              </p>
            </div>

            {/* Progress bar */}
            <div className="w-full">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
                <div
                  className="h-full rounded-full bg-primary-400 transition-all duration-300 ease-out"
                  style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>Elapsed: {formatElapsed(elapsedSeconds)}</span>
                <span>{Math.round(progress)}%</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
