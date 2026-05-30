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
    <div className="flex flex-col gap-xs">
      <span className="text-meta font-semibold uppercase tracking-wider text-muted-foreground">
        Full separation
      </span>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Split the whole track into mix-ready stems. 4-stem mode isolates vocals, drums,
        bass, and other for precise DJ mixing.
      </p>
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
                  ? "Premium unlocks 4-stem separation (vocals, drums, bass, other)"
                  : m === "2"
                    ? "Vocals + instrumental — fastest path to mix"
                    : "Four isolated stems for full control"
              }
              onClick={() => {
                if (locked && onUpgradeToPremium) {
                  onUpgradeToPremium();
                  return;
                }
                onModeChange(m);
              }}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium",
                mode === m
                  ? "border-primary-500 bg-primary-500/15 text-primary-200"
                  : "border-border bg-muted text-secondary-foreground",
                locked && "opacity-70",
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
      {!canSplitFourStems ? (
        <span className="text-xs text-muted-foreground">
          Upgrade to Premium for 4-stem lanes (drums + bass + other + vocals).
        </span>
      ) : null}
    </div>
  );
}

export function fullSeparationIntent(mode: "2" | "4"): SplitIntent {
  return { task: "full_separation", mode };
}
