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
}

/** Quality tier radio buttons (Fast / Balanced / Quality). */
export function QualitySelector({
  quality,
  onQualityChange,
  canChoosePaidQuality,
  isSplitting,
  splitResultStemsLength,
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
        label: "Fast",
        enabled: true,
        hint: "Quickest turnaround",
      },
      {
        value: "balanced",
        label: "Balanced",
        enabled: canChoosePaidQuality,
        hint: canChoosePaidQuality
          ? "Good quality + speed balance"
          : "Requires Premium or Studio",
      },
      {
        value: "quality",
        label: "Quality",
        enabled: canChoosePaidQuality,
        hint: canChoosePaidQuality
          ? "Higher quality, slower than balanced"
          : "Requires Premium or Studio",
      },
    ];
    return opts;
  }, [canChoosePaidQuality]);

  return (
    <div
      data-testid="quality-controls"
      className="flex w-full max-w-full shrink-0 flex-wrap items-center gap-1.5 sm:w-auto"
    >
      <span className="hidden text-[10px] font-semibold uppercase tracking-wider text-white/50 sm:block">
        Quality
      </span>
      <div className="flex w-full overflow-x-auto rounded-xl border border-white/10 bg-black/20 p-0.5 sm:w-auto scrollbar-hide">
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
              "min-h-[36px] whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition",
              !opt.enabled
                ? "cursor-not-allowed text-white/25"
                : opt.value === quality
                  ? "bg-amber-500/20 text-amber-200"
                  : "text-white/60 hover:text-white",
            )}
          >
            <span className="inline-flex items-center gap-1">
              {opt.label}
              {!opt.enabled && (
                <Lock
                  className="h-3 w-3 text-white/35"
                  aria-hidden="true"
                />
              )}
            </span>
          </button>
        ))}
      </div>
      {!canChoosePaidQuality && (
        <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-white/45">
          Premium/Studio to unlock
        </span>
      )}
    </div>
  );
}
