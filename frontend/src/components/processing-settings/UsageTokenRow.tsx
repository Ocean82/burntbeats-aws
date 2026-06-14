import { cn } from "../../utils/cn";

export interface UsageTokenRowProps {
  usageBalance: number | null;
  usageLoading: boolean;
  estimatedSplitTokens: number | null;
  freeMonthlyRemaining?: number | null;
  paidBalance?: number | null;
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
  freeMonthlyRemaining = null,
  paidBalance = null,
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
              {freeMonthlyRemaining != null && (paidBalance ?? 0) <= 0 && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({Math.floor(freeMonthlyRemaining)} free min left this month)
                </span>
              )}
            </span>
          )}
          {estimatedSplitTokens !== null && (
            <span className={cn(showBalance && usageBalance !== null && "ml-2")}>
              {showBalance && usageBalance !== null ? "· " : ""}
              {jobLabel}:{" "}
              {`~${estimatedSplitTokens} token${estimatedSplitTokens === 1 ? "" : "s"}`}
            </span>
          )}
          <span className="mt-1 block text-xs text-muted-foreground">
            1 token ≈ 1 minute of audio (partial minutes round up). Free minutes reset monthly.
          </span>
        </>
      )}
    </div>
  );
}
