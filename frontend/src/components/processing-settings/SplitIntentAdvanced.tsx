import type { SplitIntent, SplitTarget } from "@shared/types";
import { ADVANCED_TARGETS, SPLIT_VOCAL_LABELS } from "../../utils/splitIntent";
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
    <div className="flex flex-col gap-2">
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
                "rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                checked
                  ? "border-primary-500 bg-primary-500/20 text-primary-200"
                  : "border-border bg-neutral-900/60 text-muted-foreground hover:text-foreground",
                (disabled || removeVocals) && "cursor-not-allowed opacity-40",
              )}
            >
              {target}
            </button>
          );
        })}
      </div>
      <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-secondary-foreground">
        <input
          type="checkbox"
          checked={removeVocals}
          disabled={disabled}
          onChange={(e) => onRemoveVocalsChange(e.target.checked)}
          className="accent-primary-500"
        />
        {SPLIT_VOCAL_LABELS.karaoke}
      </label>
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
