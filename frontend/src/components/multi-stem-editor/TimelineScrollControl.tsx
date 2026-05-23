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
      className={cn("flex flex-wrap items-center gap-xs", className)}
      role="group"
      aria-label="Timeline scroll"
    >
      <span className="text-meta font-medium uppercase tracking-wider text-muted-foreground">
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
      <span className="font-mono text-meta tabular-nums text-muted-foreground">{readout}%</span>
      <button
        type="button"
        onClick={onCenterPlayhead}
        className="tap-feedback flex min-h-[44px] items-center gap-2xs rounded-lg border border-border bg-muted px-xs py-xs text-meta font-medium text-muted-foreground transition-[color,background-color,border-color,transform] duration-[var(--motion-fast)] hover:border-primary-400/30 hover:bg-secondary hover:text-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
        aria-label="Center playhead in timeline view"
        title="Center playhead"
      >
        <Crosshair className="h-3.5 w-3.5" />
        Center
      </button>
    </div>
  );
});
