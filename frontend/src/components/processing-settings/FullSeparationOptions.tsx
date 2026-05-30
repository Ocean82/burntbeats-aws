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
    <div className="flex flex-col gap-xs">
      <span className="text-meta font-semibold uppercase tracking-wider text-muted-foreground">
        Full separation
      </span>
      <div className="flex gap-2">
        {(["2", "4"] as const).map((m) => {
          const isFour = m === "4";
          const locked = isFour && !canSplitFourStems;
          return (
            <button
              key={m}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (locked && onUpgradeToPremium) {
                  onUpgradeToPremium();
                  return;
                }
                onModeChange(m);
              }}
              className={cn(
                "flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium",
                mode === m
                  ? "border-primary-500 bg-primary-500/15 text-primary-200"
                  : "border-border bg-muted text-secondary-foreground",
                locked && "opacity-70",
              )}
            >
              {m} stems{locked ? " (Premium)" : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function fullSeparationIntent(mode: "2" | "4"): SplitIntent {
  return { task: "full_separation", mode };
}
