import type { SplitIntent, SplitTarget } from "@shared/types";
import { ADVANCED_TARGETS, SPLIT_VOCAL_HINTS, SPLIT_VOCAL_LABELS } from "../../utils/splitIntent";
import { cn } from "../../utils/cn";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

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
      <TooltipProvider delayDuration={300}>
        <div className="flex flex-col gap-xs">
          <Tooltip>
            <TooltipTrigger asChild>
              <label className="flex w-fit cursor-default items-center gap-2 text-xs text-secondary-foreground">
                <input
                  type="checkbox"
                  checked={removeVocals}
                  disabled={disabled}
                  onChange={(e) => onRemoveVocalsChange(e.target.checked)}
                  className="accent-primary-500"
                />
                {SPLIT_VOCAL_LABELS.karaoke} instead of {SPLIT_VOCAL_LABELS.acapella}
              </label>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={6}
              className="max-w-56 px-2 py-1.5 text-xs leading-snug"
            >
              {SPLIT_VOCAL_HINTS.karaoke}
            </TooltipContent>
          </Tooltip>
          <div className="flex flex-wrap gap-1.5">
          {ADVANCED_TARGETS.map((target) => {
            const checked = targets.includes(target);
            const hint =
              target === "vocals" && !removeVocals
                ? SPLIT_VOCAL_HINTS.acapella
                : target === "instrumental"
                  ? SPLIT_VOCAL_HINTS.karaoke
                  : undefined;
            const button = (
              <button
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

            if (!hint) {
              return (
                <span key={target} className="inline-flex">
                  {button}
                </span>
              );
            }

            return (
              <Tooltip key={target}>
                <TooltipTrigger asChild>
                  {disabled || removeVocals ? (
                    <span className="inline-flex">{button}</span>
                  ) : (
                    button
                  )}
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  sideOffset={6}
                  className="max-w-56 px-2 py-1.5 text-xs leading-snug"
                >
                  {hint}
                </TooltipContent>
              </Tooltip>
            );
          })}
          </div>
        </div>
      </TooltipProvider>
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
