import { Lock } from "lucide-react";
import { cn } from "../../utils/cn";

export interface StemCountSelectorProps {
  requestedStemMode: 2 | 4;
  onStemModeChange: (mode: 2 | 4) => void;
  canExpandToFourStems: boolean;
  isSplitting: boolean;
  splitResultStemsLength: number;
  onUpgradeToPremium?: () => void;
}

/** 2/4 stem slider (before first split) or result badge (after split). */
export function StemCountSelector({
  requestedStemMode,
  onStemModeChange,
  canExpandToFourStems,
  isSplitting,
  splitResultStemsLength,
  onUpgradeToPremium,
}: StemCountSelectorProps) {
  if (splitResultStemsLength > 0) {
    return (
      <div className="flex shrink-0 flex-col justify-center rounded-xl border border-border bg-muted px-sm py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Result
        </span>
        <span className="text-xs font-medium text-secondary-foreground">
          {splitResultStemsLength === 2 ? "2 stems" : "4 stems"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex w-full shrink-0 basis-full items-center gap-xs sm:basis-auto lg:w-auto">
      <span className="hidden text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:block">
        Stems
      </span>
      <div className="flex flex-col items-center gap-0.5">
        <input
          type="range"
          min={2}
          max={4}
          step={2}
          value={requestedStemMode}
          disabled={isSplitting}
          onChange={(e) => {
            const val = parseInt(e.target.value) as 2 | 4;
            if (val === 4 && !canExpandToFourStems && onUpgradeToPremium) {
              onUpgradeToPremium();
              return;
            }
            onStemModeChange(val);
          }}
          className="w-20 accent-primary-500 disabled:opacity-40"
          aria-label="Number of stems"
          aria-valuetext={`${requestedStemMode} stems${requestedStemMode === 4 && !canExpandToFourStems ? " (requires Premium)" : ""}`}
        />
        <div className="flex w-20 justify-between text-[10px] text-muted-foreground font-mono">
          <span>2</span>
          <span
            className={cn(
              requestedStemMode === 4 ? "text-primary-300" : "",
              !canExpandToFourStems && "inline-flex items-center gap-2xs",
            )}
          >
            4
            {!canExpandToFourStems && (
              <Lock
                className="h-3 w-3 text-muted-foreground"
                aria-hidden="true"
              />
            )}
          </span>
        </div>
        {!canExpandToFourStems && (
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            4-stem requires Premium/Studio
          </span>
        )}
      </div>
    </div>
  );
}
