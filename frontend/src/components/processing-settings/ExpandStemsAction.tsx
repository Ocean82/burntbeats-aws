import { Loader2, Layers } from "lucide-react";
import { cn } from "../../utils/cn";

export interface ExpandStemsActionProps {
  canExpand: boolean;
  isExpanding: boolean;
  splitResultStemsLength: number;
  onExpand: () => void;
  onUpgrade?: () => void;
}

/** Expand an existing 2-stem job to 4 stems (Premium/Studio). */
export function ExpandStemsAction({
  canExpand,
  isExpanding,
  splitResultStemsLength,
  onExpand,
  onUpgrade,
}: ExpandStemsActionProps) {
  if (splitResultStemsLength !== 2) return null;

  return (
    <div
      data-testid="expand-stems-action"
      className="mt-sm flex flex-wrap items-center gap-sm rounded-xl border border-accent-cyan/25 bg-accent-cyan-950/15 px-md py-sm"
    >
      <Layers className="h-4 w-4 shrink-0 text-accent-cyan-300" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-secondary-foreground">
          Add drums & melody stems
        </p>
        <p className="text-xs text-muted-foreground">
          Expand this 2-stem split to a full 4-stem mix without re-uploading.
        </p>
      </div>
      {canExpand ? (
        <button
          type="button"
          onClick={onExpand}
          disabled={isExpanding}
          className={cn(
            "fire-button tap-feedback min-h-[44px] shrink-0 inline-flex items-center gap-xs px-md py-xs text-sm font-semibold",
            isExpanding && "opacity-70",
          )}
        >
          {isExpanding ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Expanding…
            </>
          ) : (
            "Expand to 4 stems"
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={onUpgrade}
          className="ghost-button tap-feedback min-h-[44px] shrink-0 rounded-lg border border-primary-400/30 px-md py-xs text-xs font-semibold text-primary-200"
        >
          Upgrade for 4 stems
        </button>
      )}
    </div>
  );
}
