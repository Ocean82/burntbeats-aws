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
        "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-xs font-semibold tabular-nums text-amber-100/95",
        onClick && "transition hover:border-amber-300/45 hover:bg-amber-500/18",
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
        <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-300/80" aria-hidden />
      ) : (
        <Coins className="h-3.5 w-3.5 text-amber-300/90" aria-hidden />
      )}
      {loading ? (
        <span className="text-white/50">…</span>
      ) : balance != null ? (
        <span>{Math.floor(balance)} tokens</span>
      ) : (
        <span className="text-white/45">—</span>
      )}
    </Tag>
  );
}
