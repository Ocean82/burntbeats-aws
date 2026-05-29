/**
 * MidiPianoRoll — SVG piano roll visualization for MIDI note events.
 * Lightweight, no dependencies. Fixed px/sec timeline with horizontal scroll when needed.
 * Supports optional playhead and note highlighting during playback.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { MidiNoteEvent } from "../../hooks/useMidiConvert";
import { midiToNoteName } from "../../utils/musicTheory";
import { cn } from "../../utils/cn";
import { isBlackKeyPitch, PIANO_ROLL } from "./pianoRollTheme";
import "./midi-tokens.css";

const LEFT_MARGIN = 44;
const TOP_MARGIN = 4;
const BOTTOM_MARGIN = 20;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 160;
const MAX_HEIGHT = 280;
/** Fixed timeline scale (preview); editor canvas uses 80px/s base. */
const PREVIEW_PIXELS_PER_SECOND = 60;

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

  const { rects, pitchRows, pitchLabels, timeLabels, totalDuration, svgWidth, isScrollable, minStart } =
    useMemo(() => {
      if (!notes.length) {
        return {
          rects: [],
          pitchRows: [],
          pitchLabels: [],
          timeLabels: [],
          totalDuration: 0,
          svgWidth: containerWidth,
          isScrollable: false,
          minStart: 0,
        };
      }

      const pitches = notes.map((n) => n.pitch);
      const minP = Math.min(...pitches);
      const maxP = Math.max(...pitches);
      const noteMinStart = Math.min(...notes.map((n) => n.start));
      const maxEnd = Math.max(...notes.map((n) => n.start + n.duration));
      const dur = Math.max(maxEnd * 1.05, 2);

      const range = maxP - minP + 1;
      const drawHeight = height - TOP_MARGIN - BOTTOM_MARGIN;
      const timelineContent = Math.ceil(dur * PREVIEW_PIXELS_PER_SECOND);
      const width = Math.max(containerWidth, LEFT_MARGIN + timelineContent);
      const scrollable = width > containerWidth;

      const rowH = Math.max(drawHeight / range - 1, 3);
      const pitchRows: Array<{ pitch: number; y: number; h: number; isBlack: boolean }> = [];
      for (let p = minP; p <= maxP; p++) {
        const centerY =
          TOP_MARGIN + drawHeight - ((p - minP + 0.5) / range) * drawHeight;
        pitchRows.push({
          pitch: p,
          y: centerY - rowH / 2,
          h: rowH,
          isBlack: isBlackKeyPitch(p),
        });
      }

      const noteRects = notes.map((note, i) => {
        const x = LEFT_MARGIN + note.start * PREVIEW_PIXELS_PER_SECOND;
        const w = Math.max(note.duration * PREVIEW_PIXELS_PER_SECOND, 2);
        const y =
          TOP_MARGIN +
          drawHeight -
          ((note.pitch - minP + 1) / range) * drawHeight;
        const h = rowH;

        return {
          key: i,
          x,
          y: y - h / 2,
          w,
          h,
          velocity: note.velocity,
          start: note.start,
          duration: note.duration,
        };
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

      const visibleSeconds = (width - LEFT_MARGIN) / PREVIEW_PIXELS_PER_SECOND;
      const step =
        visibleSeconds > 120 ? 30 : visibleSeconds > 60 ? 15 : visibleSeconds > 20 ? 5 : 1;
      const tLabels: Array<{ x: number; label: string }> = [];
      for (let t = 0; t <= dur; t += step) {
        const x = LEFT_MARGIN + t * PREVIEW_PIXELS_PER_SECOND;
        const mins = Math.floor(t / 60);
        const secs = Math.floor(t % 60);
        tLabels.push({
          x,
          label: mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`,
        });
      }

      return {
        rects: noteRects,
        pitchRows,
        pitchLabels: labels,
        timeLabels: tLabels,
        totalDuration: dur,
        svgWidth: width,
        isScrollable: scrollable,
        minStart: noteMinStart,
      };
    }, [notes, containerWidth, height]);

  const playheadX = useMemo(() => {
    if (currentTime == null || currentTime < 0 || totalDuration <= 0) return null;
    // useMidiPlayback reports time relative to first note; roll uses absolute seconds
    const absoluteTime = currentTime + minStart;
    return LEFT_MARGIN + absoluteTime * PREVIEW_PIXELS_PER_SECOND;
  }, [currentTime, minStart, totalDuration]);

  if (!notes.length) {
    return (
      <div
        ref={containerRef}
        className={cn(
          "midi-piano-roll flex min-h-[120px] w-full items-center justify-center rounded-lg border border-border p-xl text-sm text-muted-foreground",
          className,
        )}
      >
        No MIDI notes to display
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("midi-piano-roll w-full rounded-lg border border-border", className)}
    >
      <div
        className={cn(isScrollable && "overflow-x-auto overflow-y-hidden")}
        title={isScrollable ? "Scroll horizontally to view the full timeline" : undefined}
      >
        <svg
          width={svgWidth}
          height={height}
          className="block"
          role="img"
          aria-label={`Piano roll showing ${notes.length} MIDI notes${isScrollable ? ", scroll horizontally for full timeline" : ""}`}
        >
          {pitchRows.map((row) => (
            <rect
              key={`row-${row.pitch}`}
              x={LEFT_MARGIN}
              y={row.y}
              width={svgWidth - LEFT_MARGIN}
              height={row.h}
              fill={row.isBlack ? PIANO_ROLL.blackKeyRow : PIANO_ROLL.whiteKeyRow}
            />
          ))}

          {pitchLabels.map((pl, i) => (
            <text
              key={`pl-${i}`}
              x={4}
              y={pl.y + 3}
              fontSize={9}
              fill={PIANO_ROLL.rulerText}
              fontFamily="monospace"
            >
              {pl.label}
            </text>
          ))}

          {timeLabels.map((tl, i) => (
            <g key={`tl-${i}`}>
              <line
                x1={tl.x}
                x2={tl.x}
                y1={TOP_MARGIN}
                y2={height - BOTTOM_MARGIN}
                stroke={PIANO_ROLL.gridBeat}
                strokeWidth={0.5}
              />
              <text
                x={tl.x}
                y={height - 6}
                fontSize={8}
                fill={PIANO_ROLL.rulerText}
                textAnchor="middle"
                fontFamily="monospace"
              >
                {tl.label}
              </text>
            </g>
          ))}

          {rects.map((r) => {
            const absoluteTime =
              currentTime != null ? currentTime + minStart : null;
            const isActive =
              absoluteTime != null &&
              absoluteTime >= r.start &&
              absoluteTime < r.start + r.duration;

            return (
              <rect
                key={r.key}
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                rx={1.5}
                fill={
                  isActive
                    ? PIANO_ROLL.noteSelectedFill(r.velocity)
                    : PIANO_ROLL.noteFill(r.velocity)
                }
                stroke={isActive ? PIANO_ROLL.noteSelectedStroke : PIANO_ROLL.noteStroke}
                strokeWidth={isActive ? 1 : 0.5}
              />
            );
          })}

          {playheadX != null && (
            <line
              x1={playheadX}
              x2={playheadX}
              y1={TOP_MARGIN}
              y2={height - BOTTOM_MARGIN}
              stroke={PIANO_ROLL.playhead}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          )}
        </svg>
      </div>
      {isScrollable && (
        <p className="midi-piano-roll__scroll-hint border-t border-border px-sm py-1 text-[10px] text-muted-foreground">
          Scroll timeline horizontally · {Math.round(totalDuration)}s
        </p>
      )}
    </div>
  );
}
