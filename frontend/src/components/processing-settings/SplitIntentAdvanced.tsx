import type { SplitIntent, SplitTarget } from "@shared/types";
import { ADVANCED_TARGETS } from "../../utils/splitIntent";
import { cn } from "../../utils/cn";

export interface SplitIntentAdvancedProps {
  targets: SplitTarget[];
  removeVocals: boolean;
  onTargetsChange: (targets: SplitTarget[]) => void;
  onRemoveVocalsChange: (remove: boolean) => void;
  disabled?: boolean;
}

export function SplitIntentAdvanced({
  targets,
  removeVocals,
  onTargetsChange,
  onRemoveVocalsChange,
  disabled = false,
}: SplitIntentAdvancedProps) {
  function toggle(target: SplitTarget) {
    if (disabled) return;
    if (targets.includes(target)) {
      onTargetsChange(targets.filter((t) => t !== target));
    } else {
      onTargetsChange([...targets, target]);
    }
  }

  return (
    <div className="flex flex-col gap-xs">
      <span className="text-meta font-semibold uppercase tracking-wider text-muted-foreground">
        Advanced
      </span>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Isolate specific stems from a 2-stem split, or combine targets (e.g. drums +
        bass). Cleaner extracts with Quality mode or a 4-stem separation.
      </p>
      <label className="flex items-center gap-2 text-xs text-secondary-foreground">
        <input
          type="checkbox"
          checked={removeVocals}
          disabled={disabled}
          onChange={(e) => onRemoveVocalsChange(e.target.checked)}
          className="accent-primary-500"
        />
        Remove vocals (karaoke) instead of extract
      </label>
      <div className="flex flex-wrap gap-1.5">
        {ADVANCED_TARGETS.map((target) => {
          const checked = targets.includes(target);
          return (
            <button
              key={target}
              type="button"
              disabled={disabled || removeVocals}
              onClick={() => toggle(target)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs capitalize",
                checked
                  ? "border-primary-500 bg-primary-500/15 text-primary-200"
                  : "border-border bg-muted text-muted-foreground",
                (disabled || removeVocals) && "opacity-40 cursor-not-allowed",
              )}
            >
              {target}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function advancedSelectionToIntent(
  targets: SplitTarget[],
  removeVocals: boolean,
): SplitIntent | null {
  if (removeVocals) {
    return { task: "remove", targets: ["vocals"] };
  }
  if (!targets.length) return null;
  return { task: "extract", targets: [...targets] };
}
