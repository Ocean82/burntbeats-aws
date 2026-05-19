import { memo } from "react";
import { Crosshair } from "lucide-react";
import { cn } from "../../utils/cn";

export interface TimelineScrollControlProps {
  scrollPct: number;
  maxScrollPct: number;
  zoom: number;
  playheadPct: number;
  onScrollChange: (pct: number) => void;
  onCenterPlayhead: () => void;
  className?: string;
}

/** Center timeline scroll so playhead sits in the middle of the visible window. */
export function scrollPctToCenterPlayhead(
  playheadPct: number,
  zoom: number,
  maxScrollPct: number,
): number {
  const visibleWidthPct = 100 / zoom;
  const target = playheadPct - visibleWidthPct / 2;
  return Math.max(0, Math.min(maxScrollPct, target));
}

export const TimelineScrollControl = memo(function TimelineScrollControl({
  scrollPct,
  maxScrollPct,
  onScrollChange,
  onCenterPlayhead,
  className,
}: TimelineScrollControlProps) {
  const readout = maxScrollPct > 0 ? Math.round((scrollPct / maxScrollPct) * 100) : 0;

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      role="group"
      aria-label="Timeline scroll"
    >
      <span className="text-[10px] font-medium uppercase tracking-wider text-white/45">
        Scroll timeline
      </span>
      <input
        type="range"
        min={0}
        max={maxScrollPct}
        step={0.5}
        value={scrollPct}
        onChange={(e) => onScrollChange(Number(e.target.value))}
        className="stem-accent-slider w-28 min-w-[7rem]"
        aria-label="Scroll timeline"
      />
      <span className="font-mono text-[10px] tabular-nums text-white/50">{readout}%</span>
      <button
        type="button"
        onClick={onCenterPlayhead}
        className="flex min-h-[40px] items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium text-white/60 hover:border-amber-400/30 hover:text-amber-100 transition"
        aria-label="Center playhead in timeline view"
        title="Center playhead"
      >
        <Crosshair className="h-3.5 w-3.5" />
        Center
      </button>
    </div>
  );
});
