import { Crown, Coins } from "lucide-react";
import { cn } from "../utils/cn";

interface PlanBadgeProps {
  plan: string | null;
  subscriptionStatus: "loading" | "active" | "inactive" | "error";
  freeTokensRemaining: number | null;
  usageLoading: boolean;
}

export function PlanBadge({
  plan,
  subscriptionStatus,
  freeTokensRemaining,
  usageLoading,
}: PlanBadgeProps) {
  const isPaid = subscriptionStatus === "active";
  const isLoading = subscriptionStatus === "loading";

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
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider",
        freeTokensRemaining != null && freeTokensRemaining <= 2
          ? "border-warning-gold/40 bg-warning-gold/12 text-warning-gold"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      <Coins className="h-3 w-3" aria-hidden />
      Free{!usageLoading && freeTokensRemaining != null ? ` · ${freeTokensRemaining} left` : ""}
    </span>
  );
}
