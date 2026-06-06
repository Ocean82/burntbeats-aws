import { useCallback, type PointerEvent as ReactPointerEvent } from "react";
import { PIANO_ROLL, clampEditorZoom } from "./pianoRollTheme";
import type { LoopRegion, TimeSignature } from "./editorTypes";
import { DEFAULT_TIME_SIG } from "./editorTypes";
import { secondsPerBar } from "../../utils/midiEditorSnap";

interface MidiTimelineRulerProps {
  totalDuration: number;
  pixelsPerSecond: number;
  timelineWidth: number;
  bpm?: number;
  timeSignature?: TimeSignature;
  loopRegion: LoopRegion;
  onSeek: (time: number) => void;
  onLoopChange: (region: LoopRegion) => void;
  onZoomLevelChange?: (level: number) => void;
}

const RULER_HEIGHT = 24;

function formatTimeLabel(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frac = Math.floor((seconds % 1) * 100);
  return mins > 0
    ? `${mins}:${secs.toString().padStart(2, "0")}.${frac.toString().padStart(2, "0")}`
    : `${secs}.${frac.toString().padStart(2, "0")}s`;
}

type LoopHandle = "start" | "end" | "body" | null;

export function MidiTimelineRuler({
  totalDuration,
  pixelsPerSecond,
  timelineWidth,
  bpm = 120,
  timeSignature = DEFAULT_TIME_SIG,
  loopRegion,
  onSeek,
  onLoopChange,
  onZoomLevelChange,
}: MidiTimelineRulerProps) {
  const maxTime = Math.max(totalDuration, 4);
  const svgWidth = Math.max(timelineWidth, Math.ceil(maxTime * pixelsPerSecond));

  const timeLabels: { x: number; label: string }[] = [];
  const step =
    maxTime > 120 ? 30 : maxTime > 60 ? 15 : maxTime > 20 ? 5 : maxTime > 8 ? 2 : 1;

  for (let t = 0; t <= maxTime; t += step) {
    timeLabels.push({ x: t * pixelsPerSecond, label: formatTimeLabel(t) });
  }

  const barLines: { x: number }[] = [];
  const beatLines: { x: number }[] = [];
  const barSec = secondsPerBar(bpm, timeSignature);
  const gridStep = barSec / timeSignature.beatsPerBar;

  for (let t = 0; t <= maxTime + gridStep * 0.01; t += gridStep) {
    const isBar = Math.abs(t % barSec) < gridStep * 0.25 || t === 0;
    if (isBar) {
      barLines.push({ x: t * pixelsPerSecond });
    } else {
      beatLines.push({ x: t * pixelsPerSecond });
    }
  }

  const handleRulerClick = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = x / pixelsPerSecond;
      onSeek(Math.max(0, Math.min(time, maxTime)));
    },
    [pixelsPerSecond, onSeek, maxTime],
  );

  const loopStartX = loopRegion.enabled ? loopRegion.start * pixelsPerSecond : 0;
  const loopEndX = loopRegion.enabled ? loopRegion.end * pixelsPerSecond : 0;
  const loopWidth = loopRegion.enabled ? loopEndX - loopStartX : 0;

  const handleLoopHandlePointerDown = useCallback(
    (handle: LoopHandle) => (e: ReactPointerEvent<SVGGElement>) => {
      if (!handle) return;
      e.stopPropagation();
      const svg = (e.currentTarget.ownerSVGElement as SVGSVGElement | null);
      if (!svg) return;
      svg.setPointerCapture(e.pointerId);

      const onMove = (me: PointerEvent) => {
        const rect = svg.getBoundingClientRect();
        const x = me.clientX - rect.left;
        const time = Math.max(0, Math.min(x / pixelsPerSecond, maxTime));
        if (handle === "start") {
          if (time < loopRegion.end) {
            onLoopChange({ ...loopRegion, start: time });
          }
        } else if (handle === "end") {
          if (time > loopRegion.start) {
            onLoopChange({ ...loopRegion, end: time });
          }
        }
      };

      const onUp = () => {
        svg.removeEventListener("pointermove", onMove);
        svg.removeEventListener("pointerup", onUp);
        svg.releasePointerCapture(e.pointerId);
      };

      svg.addEventListener("pointermove", onMove);
      svg.addEventListener("pointerup", onUp);
    },
    [pixelsPerSecond, loopRegion, onLoopChange, maxTime],
  );

  const wheelHandler = useCallback(
    (e: WheelEvent) => {
      if (!e.ctrlKey || !onZoomLevelChange) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.002);
      const current = pixelsPerSecond / 80;
      onZoomLevelChange(clampEditorZoom(current * factor));
    },
    [pixelsPerSecond, onZoomLevelChange],
  );

  return (
    <div
      className="relative select-none"
      style={{ height: RULER_HEIGHT, backgroundColor: PIANO_ROLL.ruler }}
      onWheel={wheelHandler as unknown as React.WheelEventHandler}
    >
      <svg
        width={svgWidth}
        height={RULER_HEIGHT}
        className="block cursor-pointer"
        onPointerDown={handleRulerClick}
        role="slider"
        aria-label="Timeline ruler. Click to seek."
        aria-valuemin={0}
        aria-valuemax={Math.round(maxTime)}
        aria-valuenow={0}
      >
        <rect
          x={0}
          y={0}
          width={svgWidth}
          height={RULER_HEIGHT}
          fill={PIANO_ROLL.ruler}
        />
        {beatLines.map((line, i) => (
          <line
            key={`beat-${i}`}
            x1={line.x}
            x2={line.x}
            y1={RULER_HEIGHT - 4}
            y2={RULER_HEIGHT}
            stroke={PIANO_ROLL.gridBeat}
            strokeWidth={0.5}
          />
        ))}
        {barLines.map((line, i) => (
          <line
            key={`bar-${i}`}
            x1={line.x}
            x2={line.x}
            y1={0}
            y2={RULER_HEIGHT}
            stroke={PIANO_ROLL.gridBar}
            strokeWidth={1}
          />
        ))}
        {timeLabels.map((tl, i) => (
          <text
            key={`tl-${i}`}
            x={tl.x}
            y={16}
            fontSize={9}
            fill={PIANO_ROLL.rulerText}
            textAnchor="middle"
            fontFamily="monospace"
          >
            {tl.label}
          </text>
        ))}
        {loopRegion.enabled && (
          <g pointerEvents="auto">
            <rect
              x={loopStartX}
              y={0}
              width={loopWidth}
              height={RULER_HEIGHT}
              fill={PIANO_ROLL.loopRegionFill}
            />
            <rect
              x={loopStartX - 1}
              y={0}
              width={3}
              height={RULER_HEIGHT}
              fill={PIANO_ROLL.loopRegionHandle}
              cursor="ew-resize"
              onPointerDown={handleLoopHandlePointerDown("start")}
            />
            <rect
              x={loopEndX - 1}
              y={0}
              width={3}
              height={RULER_HEIGHT}
              fill={PIANO_ROLL.loopRegionHandle}
              cursor="ew-resize"
              onPointerDown={handleLoopHandlePointerDown("end")}
            />
          </g>
        )}
      </svg>
    </div>
  );
}
