import { useCallback, useMemo, useRef, useState } from "react";
import type { CcLane, AutomationParam } from "./editorTypes";
import { AUTOMATION_PARAMS } from "./editorTypes";
import { PIANO_ROLL, CC_LANE_HEIGHT, LANE_LABEL_WIDTH } from "./pianoRollTheme";

interface MidiAutomationLaneProps {
  lane: CcLane;
  param: AutomationParam;
  pixelsPerSecond: number;
  totalDuration: number;
  timelineWidth: number;
  onAddPoint: (time: number, value: number) => void;
  onUpdatePoint: (index: number, time: number, value: number) => void;
  onRemovePoint: (index: number) => void;
}

interface PointRect {
  index: number;
  x: number;
  y: number;
}

export function MidiAutomationLane({
  lane,
  param,
  pixelsPerSecond,
  totalDuration,
  timelineWidth,
  onAddPoint,
  onUpdatePoint,
  onRemovePoint,
}: MidiAutomationLaneProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const paramMeta = AUTOMATION_PARAMS.find((p) => p.param === param);
  const paramColors: Record<AutomationParam, { stroke: string; fill: string; point: string }> = {
    volume: { stroke: PIANO_ROLL.automationVolumeStroke, fill: PIANO_ROLL.automationVolumeFill, point: PIANO_ROLL.automationVolumePoint },
    pan: { stroke: PIANO_ROLL.automationPanStroke, fill: PIANO_ROLL.automationPanFill, point: PIANO_ROLL.automationPanPoint },
    filter: { stroke: PIANO_ROLL.automationFilterStroke, fill: PIANO_ROLL.automationFilterFill, point: PIANO_ROLL.automationFilterPoint },
  };
  const colors = paramColors[param];

  const valueToY = useCallback((value: number) => {
    const pad = 8;
    const h = CC_LANE_HEIGHT - pad * 2;
    return pad + h * (1 - value / 127);
  }, []);

  const xToTime = useCallback((x: number) => Math.max(0, x / pixelsPerSecond), [pixelsPerSecond]);

  const timeToX = useCallback((time: number) => time * pixelsPerSecond, [pixelsPerSecond]);

  const pointRects: PointRect[] = useMemo(
    () =>
      lane.events.map((p, i) => ({
        index: i,
        x: timeToX(p.time),
        y: valueToY(p.value),
      })),
    [lane.events, timeToX, valueToY],
  );

  const curvePath = useMemo(() => {
    if (lane.events.length === 0) return "";
    const sorted = [...lane.events].sort((a, b) => a.time - b.time);
    const pts = sorted.map((p) => ({ x: timeToX(p.time), y: valueToY(p.value) }));
    if (pts.length === 1) {
      const { x, y } = pts[0];
      return `M${x},${y} L${x + 1},${y + 1}`;
    }
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const cpx1 = prev.x + (curr.x - prev.x) * 0.4;
      const cpx2 = prev.x + (curr.x - prev.x) * 0.6;
      d += ` C${cpx1},${prev.y} ${cpx2},${curr.y} ${curr.x},${curr.y}`;
    }
    return d;
  }, [lane.events, timeToX, valueToY]);

  const filledPath = useMemo(() => {
    if (!curvePath) return "";
    const lastX = pointRects.length > 0 ? pointRects[pointRects.length - 1].x : 0;
    const firstX = pointRects.length > 0 ? pointRects[0].x : 0;
    return `${curvePath} L${lastX},${CC_LANE_HEIGHT} L${firstX},${CC_LANE_HEIGHT} Z`;
  }, [curvePath, pointRects]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const hitPoint = pointRects.find(
        (p) => Math.abs(p.x - x) < 8 && Math.abs(p.y - y) < 8,
      );
      if (hitPoint) {
        if (e.shiftKey) {
          onRemovePoint(hitPoint.index);
          return;
        }
        setDragIndex(hitPoint.index);
        svg.setPointerCapture(e.pointerId);
        return;
      }

      if (x >= 0 && y >= 0) {
        const time = xToTime(x);
        const value = Math.round(127 * (1 - y / CC_LANE_HEIGHT));
        onAddPoint(time, Math.max(0, Math.min(127, value)));
      }
    },
    [pointRects, onAddPoint, onRemovePoint, xToTime],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (dragIndex == null) return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const time = xToTime(x);
      const value = Math.round(127 * (1 - y / CC_LANE_HEIGHT));
      onUpdatePoint(dragIndex, Math.max(0, time), Math.max(0, Math.min(127, value)));
    },
    [dragIndex, onUpdatePoint, xToTime],
  );

  const handlePointerUp = useCallback(() => {
    setDragIndex(null);
  }, []);

  return (
    <div
      className="w-full overflow-hidden rounded-lg border border-border"
      style={{ backgroundColor: PIANO_ROLL.automationVolumeFill }}
    >
      <div className="flex">
        <div
          className="flex shrink-0 items-center justify-center text-[10px] font-semibold uppercase tracking-wide"
          style={{
            width: LANE_LABEL_WIDTH,
            height: CC_LANE_HEIGHT,
            backgroundColor: PIANO_ROLL.ruler,
            color: colors.stroke,
          }}
        >
          {paramMeta?.label ?? param}
        </div>
        <svg
          ref={svgRef}
          width={timelineWidth}
          height={CC_LANE_HEIGHT}
          className="block cursor-crosshair select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          role="application"
          aria-label={`${paramMeta?.label ?? param} automation lane`}
        >
          <rect x={0} y={0} width={timelineWidth} height={CC_LANE_HEIGHT} fill={PIANO_ROLL.ccLaneSurface} />
          {lane.events.length > 1 && (
            <>
              <path d={filledPath} fill={colors.fill} pointerEvents="none" />
              <path d={curvePath} fill="none" stroke={colors.stroke} strokeWidth={1.5} pointerEvents="none" />
            </>
          )}
          {pointRects.map((p) => (
            <circle
              key={`ap-${p.index}`}
              cx={p.x}
              cy={p.y}
              r={dragIndex === p.index ? 5 : 4}
              fill={dragIndex === p.index ? colors.point : colors.stroke}
              stroke={colors.point}
              strokeWidth={1}
              style={{ cursor: "grab" }}
            />
          ))}
          {pointRects.map((p, i) => (
            <line
              key={`ref-${i}`}
              x1={p.x}
              y1={p.y}
              x2={p.x}
              y2={CC_LANE_HEIGHT}
              stroke={colors.stroke}
              strokeWidth={0.5}
              strokeDasharray="3 3"
              opacity={0.3}
              pointerEvents="none"
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
