import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CcLane as CcLaneType } from "./editorTypes";
import { CC_LANE_HEIGHT, PIANO_ROLL } from "./pianoRollTheme";

interface MidiCcLaneProps {
  lane: CcLaneType;
  pixelsPerSecond: number;
  totalDuration: number;
  timelineWidth: number;
  onAddPoint: (time: number, value: number) => void;
  onUpdatePoint: (index: number, time: number, value: number) => void;
  onRemovePoint: (index: number) => void;
}

type DragAction =
  | { type: "idle" }
  | { type: "drag-point"; index: number }
  | { type: "draw-curve" };

export function MidiCcLane({
  lane,
  pixelsPerSecond,
  totalDuration,
  timelineWidth,
  onAddPoint,
  onUpdatePoint,
  onRemovePoint,
}: MidiCcLaneProps) {
  const [dragState, setDragState] = useState<DragAction>({ type: "idle" });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const maxTime = Math.max(totalDuration, 4);
  const svgWidth = Math.max(timelineWidth, Math.ceil(maxTime * pixelsPerSecond));

  const timeToScreen = useCallback(
    (t: number) => t * pixelsPerSecond,
    [pixelsPerSecond],
  );

  const screenToTime = useCallback(
    (x: number) => Math.max(0, x / pixelsPerSecond),
    [pixelsPerSecond],
  );

  const screenToValue = useCallback(
    (y: number) => {
      const fraction = 1 - y / (CC_LANE_HEIGHT - 8);
      return Math.max(0, Math.min(127, Math.round(fraction * 127)));
    },
    [],
  );

  const valueToScreen = useCallback((value: number) => {
    return (CC_LANE_HEIGHT - 8) * (1 - value / 127) + 4;
  }, []);

  const renderCurve = () => {
    if (lane.events.length === 0) return null;
    const sorted = [...lane.events].sort((a, b) => a.time - b.time);

    let pathD = "";
    let fillD = "";

    for (let i = 0; i < sorted.length; i++) {
      const px = timeToScreen(sorted[i].time);
      const py = valueToScreen(sorted[i].value);

      if (i === 0) {
        pathD += `M ${px} ${py}`;
        fillD += `M ${px} ${py}`;
      } else {
        pathD += ` L ${px} ${py}`;
        fillD += ` L ${px} ${py}`;
      }
    }

    const lastX = timeToScreen(sorted[sorted.length - 1].time);

    return (
      <g>
        <path
          d={pathD}
          fill="none"
          stroke={PIANO_ROLL.ccCurveStroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <path
          d={`${fillD} L ${lastX} ${CC_LANE_HEIGHT - 4} L ${timeToScreen(sorted[0].time)} ${CC_LANE_HEIGHT - 4} Z`}
          fill={PIANO_ROLL.ccCurveFill}
        />
      </g>
    );
  };

  const renderedCurve = renderCurve();

  const getPointAt = useCallback(
    (x: number, y: number): number | null => {
      for (let i = lane.events.length - 1; i >= 0; i--) {
        const ev = lane.events[i];
        const px = timeToScreen(ev.time);
        const py = valueToScreen(ev.value);
        if (Math.abs(x - px) < 8 && Math.abs(y - py) < 8) {
          return i;
        }
      }
      return null;
    },
    [lane.events, timeToScreen, valueToScreen],
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const pointIndex = getPointAt(x, y);
      if (pointIndex !== null) {
        if (e.shiftKey) {
          onRemovePoint(pointIndex);
          return;
        }
        setDragState({ type: "drag-point", index: pointIndex });
        svg.setPointerCapture(e.pointerId);
      } else {
        const time = screenToTime(x);
        const value = screenToValue(y);
        onAddPoint(time, value);
        const newIdx = lane.events.length;
        setDragState({ type: "drag-point", index: newIdx });
        svg.setPointerCapture(e.pointerId);
      }
    },
    [getPointAt, screenToTime, screenToValue, onAddPoint, onRemovePoint, lane.events.length],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (dragState.type !== "drag-point") {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const idx = getPointAt(x, y);
        setHoveredIndex(idx);
        return;
      }

      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const time = screenToTime(x);
      const value = screenToValue(y);
      onUpdatePoint(dragState.index, time, value);
    },
    [dragState, screenToTime, screenToValue, onUpdatePoint, getPointAt],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (dragState.type !== "idle") {
        const svg = svgRef.current;
        if (svg) svg.releasePointerCapture(e.pointerId);
        setDragState({ type: "idle" });
      }
    },
    [dragState],
  );

  return (
    <div className="midi-cc-lane" style={{ height: CC_LANE_HEIGHT }}>
      <div className="midi-cc-lane__label">
        <span className="text-[9px] font-semibold uppercase tracking-wider">
          {lane.name}
        </span>
        <span className="font-mono text-[8px] opacity-60">CC{lane.ccNumber}</span>
      </div>
      <svg
        ref={svgRef}
        width={svgWidth}
        height={CC_LANE_HEIGHT}
        className="block flex-1 cursor-crosshair select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        role="application"
        aria-label={`${lane.name} CC lane. Click to add points, drag to move, Shift+click to remove.`}
      >
        <rect
          x={0}
          y={0}
          width={svgWidth}
          height={CC_LANE_HEIGHT}
          fill={PIANO_ROLL.ccLaneSurface}
        />
        {lane.events.length >= 2 && renderedCurve}
        {lane.events.map((ev, i) => {
          const px = timeToScreen(ev.time);
          const py = valueToScreen(ev.value);
          const isHovered = hoveredIndex === i;
          const isDragged = dragState.type === "drag-point" && dragState.index === i;

          return (
            <g key={`cc-${i}`}>
              <circle
                cx={px}
                cy={py}
                r={isHovered || isDragged ? 5 : 3.5}
                fill={
                  isDragged
                    ? PIANO_ROLL.ccPointHover
                    : isHovered
                      ? PIANO_ROLL.ccPointHover
                      : PIANO_ROLL.ccPointFill
                }
                stroke={PIANO_ROLL.ccPointStroke}
                strokeWidth={1.5}
              />
              {(isHovered || isDragged) && (
                <text
                  x={px + 8}
                  y={py - 4}
                  fontSize={8}
                  fill={PIANO_ROLL.rulerText}
                  fontFamily="monospace"
                >
                  {ev.value}@{ev.time.toFixed(2)}s
                </text>
              )}
            </g>
          );
        })}
        {[0, 32, 64, 96, 127].map((v) => {
          const y = valueToScreen(v);
          return (
            <g key={`ref-${v}`}>
              <line
                x1={0}
                x2={svgWidth}
                y1={y}
                y2={y}
                stroke="rgba(255,245,220,0.05)"
                strokeWidth={0.5}
              />
              <text
                x={4}
                y={y + 3}
                fontSize={7}
                fill="rgba(255,245,220,0.25)"
                fontFamily="monospace"
              >
                {v}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
