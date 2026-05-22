import { Coins, Loader2 } from "lucide-react";
import { cn } from "../utils/cn";

export interface TokenBalanceBadgeProps {
  balance: number | null | undefined;
  loading?: boolean;
  className?: string;
  onClick?: () => void;
}

/** Compact token balance for header — visible on all workspace tabs. */
export function TokenBalanceBadge({
  balance,
  loading = false,
  className,
  onClick,
}: TokenBalanceBadgeProps) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-[36px] items-center gap-xs rounded-full border border-primary-400/25 bg-primary-500/10 px-sm py-1 text-xs font-semibold tabular-nums text-primary-100/95",
        onClick && "transition hover:border-primary-300/45 hover:bg-primary-500/18",
        className,
      )}
      aria-label={
        loading
          ? "Loading token balance"
          : balance != null
            ? `${Math.floor(balance)} tokens remaining`
            : "Token balance unavailable"
      }
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary-300/80" aria-hidden />
      ) : (
        <Coins className="h-3.5 w-3.5 text-primary-300/90" aria-hidden />
      )}
      {loading ? (
        <span className="text-muted-foreground">…</span>
      ) : balance != null ? (
        <span>{Math.floor(balance)} tokens</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </Tag>
  );
}
