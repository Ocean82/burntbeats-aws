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
        "mt-3 rounded-xl border px-4 py-2.5 text-sm leading-relaxed",
        usageBalance !== null &&
          estimatedSplitTokens !== null &&
          estimatedSplitTokens > usageBalance
          ? "border-amber-500/50 bg-amber-500/10 text-amber-50"
          : "border-white/10 bg-black/25 text-white/80",
      )}
      role="status"
    >
      {usageLoading ? (
        <span className="text-white/55">Loading token balance…</span>
      ) : (
        <>
          {showBalance && usageBalance !== null && (
            <span className="font-medium text-white/90">
              Balance: {Math.floor(usageBalance)} tokens
            </span>
          )}
          {estimatedSplitTokens !== null && (
            <span className={cn(showBalance && usageBalance !== null && "ml-2")}>
              {showBalance && usageBalance !== null ? "· " : ""}
              {jobLabel}:{" "}
              {isSample ? (
                <span className="text-emerald-400 font-bold">FREE</span>
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
          <span className="mt-1 block text-xs text-white/50">
            1 token ≈ 1 minute of audio (rounds up). Metered when enabled on
            the server.
          </span>
        </>
      )}
    </div>
  );
}
