import { Crown, Coins, ArrowRight } from "lucide-react";
import { cn } from "../utils/cn";

interface PlanBadgeProps {
  plan: string | null;
  subscriptionStatus: "loading" | "active" | "inactive" | "error";
  freeTokensRemaining: number | null;
  usageLoading: boolean;
  onUpgrade: () => void;
}

export function PlanBadge({
  plan,
  subscriptionStatus,
  freeTokensRemaining,
  usageLoading,
  onUpgrade,
}: PlanBadgeProps) {
  const isPaid = subscriptionStatus === "active";
  const isLoading = subscriptionStatus === "loading";
  const isLowTokens = !isPaid && !isLoading && freeTokensRemaining != null && freeTokensRemaining <= 2;

  if (isLoading) {
    return <span className="inline-flex h-7 w-20 animate-pulse rounded-full bg-muted" />;
  }

  if (isPaid && plan) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-primary-400/30 bg-primary-500/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary-200/90">
        <Crown className="h-3 w-3" aria-hidden />
        {plan}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onUpgrade}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition",
        isLowTokens
          ? "border-warning-gold/40 bg-warning-gold/12 text-warning-gold hover:border-warning-gold/60 hover:bg-warning-gold/20"
          : "border-border bg-muted text-muted-foreground hover:border-primary-400/40 hover:text-primary-200",
      )}
    >
      <Coins className="h-3 w-3" aria-hidden />
      Free{!usageLoading && freeTokensRemaining != null ? ` · ${freeTokensRemaining} left` : ""}
      <ArrowRight className="ml-0.5 h-2.5 w-2.5 opacity-60" aria-hidden />
    </button>
  );
}
