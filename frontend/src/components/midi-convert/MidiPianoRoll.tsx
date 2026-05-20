/**
 * MidiPianoRoll — SVG piano roll visualization for MIDI note events.
 * Lightweight, no dependencies. Renders note rectangles on a time × pitch grid.
 */
import { useMemo } from "react";
import type { MidiNoteEvent } from "../../hooks/useMidiConvert";
import { midiToNoteName } from "../../utils/musicTheory";

interface MidiPianoRollProps {
  notes: MidiNoteEvent[];
  width?: number;
  height?: number;
  className?: string;
}

export function MidiPianoRoll({
  notes,
  width = 600,
  height = 180,
  className = "",
}: MidiPianoRollProps) {
  const { rects, pitchLabels, timeLabels } =
    useMemo(() => {
      if (!notes.length) {
        return { rects: [], pitchLabels: [], timeLabels: [] };
      }

      const pitches = notes.map((n) => n.pitch);
      const minP = Math.min(...pitches);
      const maxP = Math.max(...pitches);
      const minStart = Math.min(...notes.map((n) => n.start));
      const maxE = Math.max(...notes.map((n) => n.start + n.duration));

      const pitchRange = maxP - minP + 1;
      const leftMargin = 44;
      const topMargin = 4;
      const bottomMargin = 20;
      const drawWidth = width - leftMargin;
      const drawHeight = height - topMargin - bottomMargin;

      const noteRects = notes.map((note, i) => {
        const x =
          leftMargin +
          ((note.start - minStart) / (maxE - minStart)) * drawWidth;
        const w = Math.max(
          (note.duration / (maxE - minStart)) * drawWidth,
          2,
        );
        const y =
          topMargin +
          drawHeight -
          ((note.pitch - minP + 1) / pitchRange) * drawHeight;
        const h = Math.max(drawHeight / pitchRange - 1, 2);
        const opacity = 0.5 + note.velocity * 0.5;

        return { key: i, x, y, w, h, opacity };
      });

      // Pitch labels (every octave C)
      const labels: Array<{ y: number; label: string }> = [];
      for (let p = minP; p <= maxP; p++) {
        if (p % 12 === 0) {
          const y =
            topMargin +
            drawHeight -
            ((p - minP + 0.5) / pitchRange) * drawHeight;
          labels.push({ y, label: midiToNoteName(p) });
        }
      }

      // Time labels (every N seconds)
      const duration = maxE - minStart;
      const step = duration > 60 ? 15 : duration > 20 ? 5 : 1;
      const tLabels: Array<{ x: number; label: string }> = [];
      for (let t = 0; t <= duration; t += step) {
        const x = leftMargin + (t / duration) * drawWidth;
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
      };
    }, [notes, width, height]);

  if (!notes.length) {
    return (
      <div className={`flex items-center justify-center rounded-xl border border-violet-500/20 bg-black/30 p-8 text-sm text-white/40 ${className}`}>
        No MIDI notes to display
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto rounded-xl border border-violet-500/20 bg-black/40 ${className}`}>
      <svg
        width={width}
        height={height}
        className="block min-w-full"
        role="img"
        aria-label={`Piano roll showing ${notes.length} MIDI notes`}
      >
        {/* Grid lines for each pitch */}
        {pitchLabels.map((pl, i) => (
          <g key={`pl-${i}`}>
            <line
              x1={44}
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

        {/* Time labels */}
        {timeLabels.map((tl, i) => (
          <g key={`tl-${i}`}>
            <line
              x1={tl.x}
              x2={tl.x}
              y1={4}
              y2={height - 20}
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

        {/* Note rectangles */}
        {rects.map((r) => (
          <rect
            key={r.key}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            rx={1.5}
            fill={`rgba(167, 139, 250, ${r.opacity})`}
            stroke="rgba(139, 92, 246, 0.6)"
            strokeWidth={0.5}
          />
        ))}
      </svg>
    </div>
  );
}
