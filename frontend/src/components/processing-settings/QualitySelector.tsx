import { useMemo } from "react";
import { Lock } from "lucide-react";
import type { SplitQuality } from "../../api";
import { cn } from "../../utils/cn";

export interface QualitySelectorProps {
  quality: SplitQuality;
  onQualityChange: (next: SplitQuality) => void;
  canChoosePaidQuality: boolean;
  isSplitting: boolean;
  splitResultStemsLength: number;
  variant?: "full" | "compact";
}

export function QualitySelector({
  quality,
  onQualityChange,
  canChoosePaidQuality,
  isSplitting,
  splitResultStemsLength,
  variant = "full",
}: QualitySelectorProps) {
  const qualityOptions = useMemo(() => {
    const opts: Array<{
      value: SplitQuality;
      label: string;
      enabled: boolean;
      hint: string;
    }> = [
      {
        value: "speed",
        label: "Fast split",
        enabled: true,
        hint: "Fastest turnaround on CPU",
      },
      {
        value: "quality",
        label: "Quality",
        enabled: canChoosePaidQuality,
        hint: canChoosePaidQuality
          ? "Cleaner split — still quick on CPU"
          : "Premium unlocks the quality tier",
      },
    ];
    return opts;
  }, [canChoosePaidQuality]);

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-neutral-900/60 p-0.5">
        {qualityOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={
              !opt.enabled || isSplitting || splitResultStemsLength > 0
            }
            title={opt.hint}
            onClick={() => onQualityChange(opt.value)}
            className={cn(
              "rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors",
              !opt.enabled
                ? "cursor-not-allowed text-muted-foreground/40"
                : opt.value === quality
                  ? "bg-primary-500/20 text-primary-200"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="inline-flex items-center gap-1">
              {opt.label}
              {!opt.enabled && (
                <Lock className="h-3 w-3" aria-hidden="true" />
              )}
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      data-testid="quality-controls"
      data-tour="quality-selector"
      className="flex w-full max-w-full shrink-0 flex-wrap items-center gap-xs sm:w-auto"
    >
      <span className="hidden text-meta font-semibold uppercase tracking-wider text-muted-foreground sm:block">
        Quality
      </span>
      <div className="flex w-full overflow-x-auto rounded-xl border border-border bg-muted p-0.5 sm:w-auto scrollbar-hide">
        {qualityOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={
              !opt.enabled || isSplitting || splitResultStemsLength > 0
            }
            title={
              splitResultStemsLength > 0
                ? "Quality applies on the next upload. Upload a new file to choose again."
                : opt.hint
            }
            onClick={() => onQualityChange(opt.value)}
            className={cn(
              "min-h-[36px] whitespace-nowrap rounded-lg px-sm py-1.5 text-xs font-medium transition",
              !opt.enabled
                ? "cursor-not-allowed text-muted-foreground"
                : opt.value === quality
                  ? "bg-primary-500/20 text-primary-200"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="inline-flex items-center gap-2xs">
              {opt.label}
              {!opt.enabled && (
                <Lock
                  className="h-3 w-3 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
            </span>
          </button>
        ))}
      </div>
      {!canChoosePaidQuality && (
        <span className="text-meta font-medium uppercase tracking-wide text-muted-foreground">
          Premium unlocks Quality — cleaner split without long waits
        </span>
      )}
    </div>
  );
}
