import { Lock } from "lucide-react";
import { cn } from "../../utils/cn";
import type { SplitIntent } from "../../utils/splitIntent";

export interface FullSeparationOptionsProps {
  mode: "2" | "4";
  onModeChange: (mode: "2" | "4") => void;
  canSplitFourStems: boolean;
  disabled?: boolean;
  onUpgradeToPremium?: () => void;
}

export function FullSeparationOptions({
  mode,
  onModeChange,
  canSplitFourStems,
  disabled = false,
  onUpgradeToPremium,
}: FullSeparationOptionsProps) {
  return (
    <div className="flex gap-2">
      {(["2", "4"] as const).map((m) => {
        const isFour = m === "4";
        const locked = isFour && !canSplitFourStems;
        return (
          <button
            key={m}
            type="button"
            disabled={disabled}
            title={
              locked
                ? "Premium unlocks 4-stem separation"
                : m === "2"
                  ? "2 stems (vocals + instrumental)"
                  : "4 stems (vocals, drums, bass, other)"
            }
            onClick={() => {
              if (locked && onUpgradeToPremium) {
                onUpgradeToPremium();
                return;
              }
              onModeChange(m);
            }}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              mode === m
                ? "border-primary-500 bg-primary-500/20 text-primary-200"
                : "border-border bg-neutral-900/60 text-muted-foreground hover:text-foreground",
              locked && "opacity-60",
            )}
          >
            {m} stems
            {locked ? (
              <>
                <Lock className="h-3 w-3 shrink-0" aria-hidden />
                <span className="sr-only">Premium required</span>
              </>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function fullSeparationIntent(mode: "2" | "4"): SplitIntent {
  return { task: "full_separation", mode };
}
