import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { cn } from "@/utils/cn";
import { LAYOUT } from "@/constants/layout";
import { generateFakeWaveform } from "@/utils/waveformCanvas";
import { drawWaveformBars } from "@/utils/waveformCanvas";

/* ─── Types ─────────────────────────────────────────────────────── */

export interface WaveformTimelineStem {
  id: string;
  label: string;
  color: string;
}

export interface WaveformTimelineProps {
  stems: WaveformTimelineStem[];
  /** Waveform data per stem (array of amplitude values 0-1) */
  waveforms?: Record<string, number[]>;
  /** Active/selected stem id */
  activeStemId?: string;
  onStemActivate?: (stemId: string) => void;
  /** Playhead position as percentage (0-100) */
  playheadPct?: number;
  showPlayhead?: boolean;
  /** Zoom level (1 = full view) */
  zoom?: number;
  className?: string;
}

/* ─── Constants ─────────────────────────────────────────────────── */

const WAVEFORM_BINS = 512;

/**
 * Stem lane colors that satisfy Requirement 8.4:
 * - At least 4 distinct colors
 * - Each maintains ≥ 3:1 contrast ratio against dark background (hsl(0, 0%, 8%))
 * - ≥ 30° hue separation between any two adjacent lanes
 *
 * Color definitions (HSL hue | hex | contrast ratio against #141414):
 *   Cyan:    hue ~187° | #06b6d4 | ~8.5:1
 *   Pink:    hue ~330° | #ec4899 | ~5.5:1
 *   Amber:   hue ~38°  | #f59e0b | ~7.8:1
 *   Emerald: hue ~160° | #10b981 | ~7.2:1
 *   Violet:  hue ~263° | #8b5cf6 | ~4.6:1
 *
 * Adjacent hue separations:
 *   Cyan→Pink:    143° (|330-187|)
 *   Pink→Amber:   68° (|38+360-330|)
 *   Amber→Emerald: 122° (|160-38|)
 *   Emerald→Violet: 103° (|263-160|)
 *
 * All separations exceed the required minimum of 30°.
 */
export const STEM_LANE_COLORS = [
  "#06b6d4", // Cyan — hue ~187°
  "#ec4899", // Pink — hue ~330°
  "#f59e0b", // Amber — hue ~38°
  "#10b981", // Emerald — hue ~160°
  "#8b5cf6", // Violet — hue ~263°
] as const;

/* ─── Lane Sub-component ────────────────────────────────────────── */

interface LaneProps {
  stem: WaveformTimelineStem;
  waveform: number[];
  isActive: boolean;
  onActivate: (stemId: string) => void;
}

const Lane = memo(function Lane({ stem, waveform, isActive, onActivate }: LaneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas resolution to match display size
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    drawWaveformBars({
      canvas,
      values: waveform,
      color: stem.color,
      minimumBarHeightPx: 4,
      alphaEven: isActive ? 0.92 : 0.6,
      alphaOdd: isActive ? 0.65 : 0.38,
      gapPx: 1.5,
      heightScale: 0.9,
      centerGapPx: 2,
    });
  }, [waveform, stem.color, isActive]);

  const handleClick = useCallback(() => {
    onActivate(stem.id);
  }, [onActivate, stem.id]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate(stem.id);
      }
    },
    [onActivate, stem.id],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${stem.label} waveform lane — click to select`}
      className={cn(
        "relative flex-1 min-h-[40px] overflow-hidden rounded-lg border transition-all cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isActive
          ? "border-[color:var(--lane-color)]/50 bg-[color:var(--lane-color)]/[0.06]"
          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]",
      )}
      style={{ "--lane-color": stem.color } as React.CSSProperties}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {/* Active accent rail */}
      {isActive && (
        <span
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[3px] rounded-l-lg"
          style={{ backgroundColor: stem.color }}
          aria-hidden
        />
      )}

      {/* Waveform canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      />

      {/* Stem label */}
      <span
        className="pointer-events-none absolute left-2 top-1 z-10 text-[10px] font-bold uppercase tracking-wider"
        style={{ color: stem.color, opacity: 0.85 }}
        aria-hidden
      >
        {stem.label}
      </span>
    </div>
  );
});

/* ─── Main Component ─────────────────────────────────────────────── */

export function WaveformTimeline({
  stems,
  waveforms,
  activeStemId,
  onStemActivate,
  playheadPct = 0,
  showPlayhead = false,
  zoom = 1,
  className,
}: WaveformTimelineProps) {
  const handleActivate = useCallback(
    (stemId: string) => {
      onStemActivate?.(stemId);
    },
    [onStemActivate],
  );

  // Generate fallback waveforms for stems without provided data
  const resolvedWaveforms = useMemo(() => {
    const result: Record<string, number[]> = {};
    for (const stem of stems) {
      result[stem.id] = waveforms?.[stem.id] ?? generateFakeWaveform(stem.id, WAVEFORM_BINS);
    }
    return result;
  }, [stems, waveforms]);

  return (
    <div
      className={cn(
        "relative flex flex-1 flex-col gap-1 rounded-2xl border border-white/[0.06] bg-[hsl(0_0%_8%)] p-2 h-full",
        className,
      )}
      style={{ minHeight: `${LAYOUT.WAVEFORM_MIN_HEIGHT}px` }}
      data-testid="waveform-timeline"
      aria-label="Waveform timeline"
    >
      {/* Scrollable zoom container */}
      <div
        className="relative flex flex-1 flex-col gap-1 overflow-x-auto"
        style={{ width: zoom > 1 ? `${zoom * 100}%` : undefined }}
      >
        {/* Stem lanes */}
        {stems.map((stem) => (
          <Lane
            key={stem.id}
            stem={stem}
            waveform={resolvedWaveforms[stem.id] ?? []}
            isActive={stem.id === activeStemId}
            onActivate={handleActivate}
          />
        ))}

        {/* Playhead */}
        {showPlayhead && (
          <div
            className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-white/80 shadow-[0_0_6px_rgba(255,255,255,0.4)]"
            style={{ left: `${Math.min(Math.max(playheadPct, 0), 100)}%` }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}
