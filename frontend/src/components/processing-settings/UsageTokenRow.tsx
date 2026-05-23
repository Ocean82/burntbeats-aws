import { cn } from "../../utils/cn";

export interface UsageTokenRowProps {
  usageBalance: number | null;
  usageLoading: boolean;
  estimatedSplitTokens: number | null;
  estimatedExpandTokens: number | null;
  splitResultStemsLength: number;
  isExpanding: boolean;
  isSplitting: boolean;
  isSample: boolean;
  /** Label for job cost line (default "This split"). */
  jobLabel?: string;
  /** When false, balance is shown only in header badge. */
  showBalance?: boolean;
}

/** Token balance + cost estimate row shown during split mode. */
export function UsageTokenRow({
  usageBalance,
  usageLoading,
  estimatedSplitTokens,
  estimatedExpandTokens,
  splitResultStemsLength,
  isExpanding,
  isSplitting,
  isSample,
  jobLabel = "This split",
  showBalance = true,
}: UsageTokenRowProps) {
  return (
    <div
      className={cn(
        "mt-sm rounded-xl border px-md py-sm text-sm leading-relaxed",
        usageBalance !== null &&
          estimatedSplitTokens !== null &&
          estimatedSplitTokens > usageBalance
          ? "border-primary-500/50 bg-primary-500/10 text-primary-50"
          : "border-border bg-muted text-secondary-foreground",
      )}
      role="status"
    >
      {usageLoading ? (
        <span className="text-muted-foreground">Loading token balance…</span>
      ) : (
        <>
          {showBalance && usageBalance !== null && (
            <span className="font-medium text-secondary-foreground">
              Balance: {Math.floor(usageBalance)} tokens
            </span>
          )}
          {estimatedSplitTokens !== null && (
            <span className={cn(showBalance && usageBalance !== null && "ml-2")}>
              {showBalance && usageBalance !== null ? "· " : ""}
              {jobLabel}:{" "}
              {isSample ? (
                <span className="text-success-400 font-bold">FREE</span>
              ) : (
                `~${estimatedSplitTokens} token${estimatedSplitTokens === 1 ? "" : "s"}`
              )}
            </span>
          )}
          {splitResultStemsLength === 2 &&
            estimatedExpandTokens !== null &&
            !isExpanding &&
            !isSplitting && (
              <span className="ml-2">
                · Expand to 4: ~{estimatedExpandTokens} more
              </span>
            )}
          <span className="mt-1 block text-xs text-muted-foreground">
            1 token ≈ 1 minute of audio (partial minutes round up).
          </span>
        </>
      )}
    </div>
  );
}
