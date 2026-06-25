import { Coins, AlertTriangle } from "lucide-react";
import { cn } from "../utils/cn";

interface TokenMeterProps {
  freeTokensRemaining: number | null;
  isPaidUser: boolean;
  usageLoading: boolean;
  onUpgrade: () => void;
  estimatedTokens?: number | null;
}

export function TokenMeter({
  freeTokensRemaining,
  isPaidUser,
  usageLoading,
  onUpgrade,
  estimatedTokens,
}: TokenMeterProps) {
  if (isPaidUser || usageLoading || freeTokensRemaining == null) return null;

  const showWarning = estimatedTokens != null && estimatedTokens >= freeTokensRemaining;
  const pct = Math.min(100, Math.max(0, (freeTokensRemaining / 5) * 100));
  const barColor = pct > 50 ? "bg-success-green" : pct > 25 ? "bg-warning-gold" : "bg-error-red";

  return (
    <div className="mb-md rounded-xl border border-border bg-muted/60 p-md">
      <div className="flex items-center justify-between gap-sm">
        <span className="flex items-center gap-2 text-xs text-secondary-foreground">
          <Coins className="h-3.5 w-3.5 text-primary-400" aria-hidden />
          Free plan: <strong>{freeTokensRemaining} token{freeTokensRemaining !== 1 ? "s" : ""}</strong> remaining this month
        </span>
        <button type="button" onClick={onUpgrade}
          className="text-xs font-medium text-primary-300 hover:text-primary-200 underline underline-offset-2">
          Upgrade
        </button>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
      </div>
      {showWarning && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-warning-gold">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          <span>This split may use your last tokens. Consider upgrading to avoid interruptions.</span>
        </div>
      )}
    </div>
  );
}
