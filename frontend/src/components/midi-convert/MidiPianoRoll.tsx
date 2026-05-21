/**
 * MidiPianoRoll — SVG piano roll visualization for MIDI note events.
 * Lightweight, no dependencies. Renders note rectangles on a time × pitch grid.
 * Supports optional playhead and note highlighting during playback.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { MidiNoteEvent } from "../../hooks/useMidiConvert";
import { midiToNoteName } from "../../utils/musicTheory";

const LEFT_MARGIN = 44;
const TOP_MARGIN = 4;
const BOTTOM_MARGIN = 20;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 160;
const MAX_HEIGHT = 280;

interface MidiPianoRollProps {
  notes: MidiNoteEvent[];
  currentTime?: number | null;
  className?: string;
}

function computeHeightForPitchRange(pitchRange: number): number {
  const rowHeight = Math.max(8, Math.min(14, 200 / Math.max(pitchRange, 1)));
  return Math.round(
    Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, TOP_MARGIN + BOTTOM_MARGIN + pitchRange * rowHeight)),
  );
}

export function MidiPianoRoll({
  notes,
  currentTime = null,
  className = "",
}: MidiPianoRollProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(MIN_WIDTH);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setContainerWidth(Math.max(MIN_WIDTH, w));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pitchRange = useMemo(() => {
    if (!notes.length) return 1;
    const pitches = notes.map((n) => n.pitch);
    return Math.max(1, Math.max(...pitches) - Math.min(...pitches) + 1);
  }, [notes]);

  const height = computeHeightForPitchRange(pitchRange);
  const width = containerWidth;

  const { rects, pitchLabels, timeLabels, minStart, totalDuration, drawWidth, bottomMargin } =
    useMemo(() => {
      if (!notes.length) {
        return {
          rects: [],
          pitchLabels: [],
          timeLabels: [],
          minStart: 0,
          totalDuration: 0,
          drawWidth: 0,
          bottomMargin: BOTTOM_MARGIN,
        };
      }

      const pitches = notes.map((n) => n.pitch);
      const minP = Math.min(...pitches);
      const maxP = Math.max(...pitches);
      const mStart = Math.min(...notes.map((n) => n.start));
      const maxE = Math.max(...notes.map((n) => n.start + n.duration));

      const range = maxP - minP + 1;
      const dWidth = width - LEFT_MARGIN;
      const drawHeight = height - TOP_MARGIN - BOTTOM_MARGIN;
      const dur = maxE - mStart;

      const noteRects = notes.map((note, i) => {
        const x = LEFT_MARGIN + ((note.start - mStart) / dur) * dWidth;
        const w = Math.max((note.duration / dur) * dWidth, 2);
        const y =
          TOP_MARGIN +
          drawHeight -
          ((note.pitch - minP + 1) / range) * drawHeight;
        const h = Math.max(drawHeight / range - 1, 3);
        const opacity = 0.5 + note.velocity * 0.5;

        return { key: i, x, y, w, h, opacity, start: note.start, duration: note.duration };
      });

      const labels: Array<{ y: number; label: string }> = [];
      for (let p = minP; p <= maxP; p++) {
        if (p % 12 === 0) {
          const y =
            TOP_MARGIN +
            drawHeight -
            ((p - minP + 0.5) / range) * drawHeight;
          labels.push({ y, label: midiToNoteName(p) });
        }
      }

      const step = dur > 60 ? 15 : dur > 20 ? 5 : 1;
      const tLabels: Array<{ x: number; label: string }> = [];
      for (let t = 0; t <= dur; t += step) {
        const x = LEFT_MARGIN + (t / dur) * dWidth;
        const mins = Math.floor(t / 60);
        const secs = Math.floor(t % 60);
        tLabels.push({
          x,
          label: mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`,
        });
      }

      return {
        rects: noteRects,
        pitchLabels: labels,
        timeLabels: tLabels,
        minStart: mStart,
        totalDuration: dur,
        drawWidth: dWidth,
        bottomMargin: BOTTOM_MARGIN,
      };
    }, [notes, width, height]);

  const playheadX = useMemo(() => {
    if (currentTime == null || currentTime <= 0 || totalDuration <= 0) return null;
    const clampedTime = Math.min(currentTime, totalDuration);
    return LEFT_MARGIN + (clampedTime / totalDuration) * drawWidth;
  }, [currentTime, totalDuration, drawWidth]);

  if (!notes.length) {
    return (
      <div
        ref={containerRef}
        className={`flex w-full min-h-[120px] items-center justify-center rounded-xl border border-violet-500/20 bg-black/30 p-8 text-sm text-white/40 ${className}`}
      >
        No MIDI notes to display
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`w-full rounded-xl border border-violet-500/20 bg-black/40 ${className}`}
    >
      <svg
        width={width}
        height={height}
        className="block w-full"
        role="img"
        aria-label={`Piano roll showing ${notes.length} MIDI notes`}
      >
        {pitchLabels.map((pl, i) => (
          <g key={`pl-${i}`}>
            <line
              x1={LEFT_MARGIN}
              x2={width}
              y1={pl.y}
              y2={pl.y}
              stroke="rgba(139,92,246,0.15)"
              strokeWidth={0.5}
            />
            <text
              x={2}
              y={pl.y + 3}
              fontSize={9}
              fill="rgba(255,255,255,0.4)"
              fontFamily="monospace"
            >
              {pl.label}
            </text>
          </g>
        ))}

        {timeLabels.map((tl, i) => (
          <g key={`tl-${i}`}>
            <line
              x1={tl.x}
              x2={tl.x}
              y1={TOP_MARGIN}
              y2={height - bottomMargin}
              stroke="rgba(139,92,246,0.1)"
              strokeWidth={0.5}
            />
            <text
              x={tl.x}
              y={height - 6}
              fontSize={8}
              fill="rgba(255,255,255,0.35)"
              textAnchor="middle"
              fontFamily="monospace"
            >
              {tl.label}
            </text>
          </g>
        ))}

        {rects.map((r) => {
          const isActive =
            currentTime != null &&
            currentTime > 0 &&
            currentTime >= r.start - minStart &&
            currentTime < r.start - minStart + r.duration;
          const fillOpacity = isActive ? 1.0 : r.opacity;
          const strokeColor = isActive
            ? "rgba(251, 191, 36, 0.9)"
            : "rgba(139, 92, 246, 0.6)";
          const fillColor = isActive
            ? `rgba(251, 191, 36, ${fillOpacity})`
            : `rgba(167, 139, 250, ${fillOpacity})`;

          return (
            <rect
              key={r.key}
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              rx={1.5}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={isActive ? 1 : 0.5}
            />
          );
        })}

        {playheadX != null && (
          <line
            x1={playheadX}
            x2={playheadX}
            y1={TOP_MARGIN}
            y2={height - bottomMargin}
            stroke="rgba(251, 146, 60, 0.9)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        )}
      </svg>
    </div>
  );
}
