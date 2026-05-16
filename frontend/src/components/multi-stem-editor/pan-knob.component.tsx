import { memo, useCallback, useEffect, useRef, useState } from "react";
import { formatPan } from "../../utils/mixer-format";
import { cn } from "../../utils/cn";

export interface PanKnobProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  color?: string;
  ariaLabel: string;
  onChange: (value: number) => void;
}

const MIN_ANGLE = -135;
const MAX_ANGLE = 135;
const KNOB_SIZE = 44;

export const PanKnob = memo(function PanKnob({
  value,
  min = -100,
  max = 100,
  step = 1,
  disabled = false,
  color = "#f59e0b",
  ariaLabel,
  onChange,
}: PanKnobProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startVal = useRef(0);
  const [focused, setFocused] = useState(false);

  const clamp = useCallback((v: number) => Math.max(min, Math.min(max, v)), [min, max]);
  const snap = useCallback((v: number) => Math.round(v / step) * step, [step]);

  const normalize = (v: number) => (v - min) / (max - min);
  const angle = MIN_ANGLE + normalize(value) * (MAX_ANGLE - MIN_ANGLE);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      dragging.current = true;
      startY.current = e.clientY;
      startVal.current = value;
    },
    [disabled, value],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (disabled) return;
      onChange(0);
    },
    [disabled, onChange],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dy = startY.current - e.clientY;
      const range = max - min;
      const sensitivity = e.shiftKey ? 4 : 1;
      const delta = ((dy / 200) * range) / sensitivity;
      onChange(clamp(snap(startVal.current + delta)));
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [min, max, onChange, clamp, snap]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      const dir = e.deltaY < 0 ? 1 : -1;
      const mult = e.shiftKey ? 0.25 : 1;
      onChange(clamp(snap(value + dir * step * mult)));
    },
    [disabled, value, step, onChange, clamp, snap],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      e.stopPropagation();
      const mult = e.shiftKey ? 5 : 1;
      if (e.key === "ArrowUp" || e.key === "ArrowRight") {
        e.preventDefault();
        onChange(clamp(snap(value + step * mult)));
      } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
        e.preventDefault();
        onChange(clamp(snap(value - step * mult)));
      }
    },
    [disabled, value, step, onChange, clamp, snap],
  );

  const cx = KNOB_SIZE / 2;
  const cy = KNOB_SIZE / 2;
  const r = KNOB_SIZE * 0.34;
  const trackR = r + KNOB_SIZE * 0.06;
  const toRad = (deg: number) => (deg - 90) * (Math.PI / 180);
  const px = (deg: number) => cx + trackR * Math.cos(toRad(deg));
  const py = (deg: number) => cy + trackR * Math.sin(toRad(deg));

  const centerTickLen = r * 0.35;
  const centerX1 = cx;
  const centerY1 = cy - centerTickLen;
  const centerX2 = cx;
  const centerY2 = cy - centerTickLen * 0.55;

  const arcStart = MIN_ANGLE;
  const arcEnd = angle;
  const startX = px(arcStart);
  const startY2 = py(arcStart);
  const endX = px(arcEnd);
  const endY2 = py(arcEnd);
  const largeArc = arcEnd - arcStart > 180 ? 1 : 0;
  const arcPath = `M ${startX} ${startY2} A ${trackR} ${trackR} 0 ${largeArc} 1 ${endX} ${endY2}`;

  const indLen = r * 0.55;
  const indX = cx + indLen * Math.cos(toRad(angle));
  const indY = cy + indLen * Math.sin(toRad(angle));

  return (
    <div className="flex flex-col items-center gap-0.5 select-none">
      <svg
        ref={svgRef}
        width={KNOB_SIZE}
        height={KNOB_SIZE}
        tabIndex={disabled ? -1 : 0}
        role="slider"
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={formatPan(value)}
        className={cn(
          "cursor-pointer outline-none",
          disabled && "cursor-not-allowed opacity-40",
          focused && !disabled && "drop-shadow-[0_0_6px_rgba(245,158,11,0.35)]",
        )}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onClick={(e) => e.stopPropagation()}
        style={{ touchAction: "none" }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={trackR}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={3}
        />
        {value !== min && (
          <path
            d={arcPath}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            opacity={disabled ? 0.4 : 1}
          />
        )}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="rgba(0,0,0,0.5)"
          stroke={focused ? color : "rgba(255,255,255,0.12)"}
          strokeWidth={1}
        />
        <line
          x1={centerX1}
          y1={centerY1}
          x2={centerX2}
          y2={centerY2}
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={1}
          strokeLinecap="round"
        />
        <line
          x1={cx}
          y1={cy}
          x2={indX}
          y2={indY}
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={2} fill={color} opacity={0.85} />
      </svg>
      <span className="font-mono text-[9px] tabular-nums text-white/45">{formatPan(value)}</span>
    </div>
  );
});
