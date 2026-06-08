/**
 * MidiKnobControl — DAW-style rotary knob for the MIDI workstation.
 * Adapted from pitch-tempo-plugin KnobControl, themed to midi-gold token system.
 *
 * Interactions: vertical drag, scroll wheel, keyboard arrows, double-click to reset.
 * Accessibility: role="slider", aria-valuemin/max/now/text, keyboard navigable.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "../../../utils/cn";

export type MidiKnobSize = "sm" | "md" | "lg";

const SIZE_MAP: Record<MidiKnobSize, number> = {
  sm: 52,
  md: 72,
  lg: 100,
};

export interface MidiKnobControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  formatValue?: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
  size?: MidiKnobSize;
  hint?: string;
  className?: string;
}

export function MidiKnobControl({
  label,
  value,
  min,
  max,
  step = 0.01,
  defaultValue,
  formatValue,
  onChange,
  disabled = false,
  size = "md",
  hint,
  className,
}: MidiKnobControlProps) {
  const id = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const startYRef = useRef(0);
  const startValRef = useRef(0);
  const [focused, setFocused] = useState(false);

  const pxSize = SIZE_MAP[size];
  const MIN_ANGLE = -135;
  const MAX_ANGLE = 135;

  const normalize = (v: number) => (v - min) / (max - min);
  const angle = MIN_ANGLE + normalize(value) * (MAX_ANGLE - MIN_ANGLE);

  const displayValue = formatValue
    ? formatValue(value)
    : `${value.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)}`;

  // ── Drag interaction ──
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      dragging.current = true;
      startYRef.current = e.clientY;
      startValRef.current = value;
    },
    [disabled, value],
  );

  const handleDoubleClick = useCallback(() => {
    if (disabled || defaultValue === undefined) return;
    onChange(defaultValue);
  }, [disabled, defaultValue, onChange]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dy = startYRef.current - e.clientY;
      const range = max - min;
      const delta = (dy / 200) * range;
      const raw = startValRef.current + delta;
      const clamped = Math.max(min, Math.min(max, raw));
      const decimals = step < 1 ? (String(step).split(".")[1]?.length ?? 2) : 0;
      const snapped = parseFloat((Math.round(clamped / step) * step).toFixed(decimals));
      onChange(snapped);
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
  }, [min, max, step, onChange]);

  // ── Scroll interaction ──
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (disabled) return;
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      const multiplier = e.shiftKey ? 10 : 1;
      const raw = value + dir * step * multiplier;
      const clamped = Math.max(min, Math.min(max, raw));
      const decimals = step < 1 ? (String(step).split(".")[1]?.length ?? 2) : 0;
      onChange(parseFloat((Math.round(clamped / step) * step).toFixed(decimals)));
    },
    [disabled, value, min, max, step, onChange],
  );

  // ── Keyboard interaction ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      const multiplier = e.shiftKey ? 10 : 1;
      const decimals = step < 1 ? (String(step).split(".")[1]?.length ?? 2) : 0;
      const clampAndSnap = (v: number) => {
        const clamped = Math.max(min, Math.min(max, v));
        return parseFloat((Math.round(clamped / step) * step).toFixed(decimals));
      };
      if (e.key === "ArrowUp" || e.key === "ArrowRight") {
        e.preventDefault();
        onChange(clampAndSnap(value + step * multiplier));
      } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
        e.preventDefault();
        onChange(clampAndSnap(value - step * multiplier));
      } else if (e.key === "Home") {
        e.preventDefault();
        onChange(min);
      } else if (e.key === "End") {
        e.preventDefault();
        onChange(max);
      } else if (
        (e.key === "Backspace" || e.key === "Delete") &&
        defaultValue !== undefined
      ) {
        e.preventDefault();
        onChange(defaultValue);
      }
    },
    [disabled, value, min, max, step, defaultValue, onChange],
  );

  // ── SVG geometry ──
  const cx = pxSize / 2;
  const cy = pxSize / 2;
  const r = pxSize * 0.38;
  const trackR = r + pxSize * 0.06;
  const toRad = (deg: number) => (deg - 90) * (Math.PI / 180);
  const px = (deg: number) => cx + trackR * Math.cos(toRad(deg));
  const py = (deg: number) => cy + trackR * Math.sin(toRad(deg));

  // Arc path from min to current value
  const arcStart = MIN_ANGLE;
  const arcEnd = angle;
  const startX = px(arcStart);
  const startY2 = py(arcStart);
  const endX = px(arcEnd);
  const endY2 = py(arcEnd);
  const largeArc = arcEnd - arcStart > 180 ? 1 : 0;
  const arcPath = `M ${startX} ${startY2} A ${trackR} ${trackR} 0 ${largeArc} 1 ${endX} ${endY2}`;

  // Indicator needle
  const indLen = r * 0.55;
  const indX = cx + indLen * Math.cos(toRad(angle));
  const indY = cy + indLen * Math.sin(toRad(angle));

  // Unique filter ID to avoid SVG ID collisions
  const filterId = `midi-knob-glow-${id}`;
  const gradId = `midi-knob-grad-${id}`;

  return (
    <div
      className={cn(
        "midi-knob flex flex-col items-center gap-1 select-none",
        disabled && "opacity-40 pointer-events-none",
        className,
      )}
    >
      <span className="midi-knob__label">{label}</span>
      <svg
        ref={svgRef}
        width={pxSize}
        height={pxSize}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={displayValue}
        aria-disabled={disabled || undefined}
        className={cn(
          "midi-knob__svg cursor-pointer outline-none",
          focused && "midi-knob__svg--focused",
        )}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ touchAction: "none" }}
      >
        <defs>
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id={gradId} cx="40%" cy="35%">
            <stop offset="0%" stopColor="#3a3830" />
            <stop offset="100%" stopColor="#1a1814" />
          </radialGradient>
        </defs>

        {/* Track background arc (270° sweep) */}
        <circle
          cx={cx}
          cy={cy}
          r={trackR}
          fill="none"
          stroke="rgba(255, 245, 220, 0.06)"
          strokeWidth={pxSize * 0.055}
          strokeDasharray={`${(2 * Math.PI * trackR * 270) / 360} ${2 * Math.PI * trackR}`}
          strokeDashoffset={`${(-2 * Math.PI * trackR * 45) / 360}`}
          strokeLinecap="round"
        />

        {/* Active arc — midi-gold */}
        {value !== min && (
          <path
            d={arcPath}
            fill="none"
            stroke="rgba(205, 165, 60, 0.92)"
            strokeWidth={pxSize * 0.06}
            strokeLinecap="round"
            filter={`url(#${filterId})`}
          />
        )}

        {/* Knob body */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={`url(#${gradId})`}
          stroke={
            focused
              ? "rgba(205, 165, 60, 0.55)"
              : "rgba(255, 245, 220, 0.1)"
          }
          strokeWidth={focused ? 2 : 1}
        />

        {/* Indicator needle */}
        <line
          x1={cx}
          y1={cy}
          x2={indX}
          y2={indY}
          stroke="rgba(205, 165, 60, 0.92)"
          strokeWidth={pxSize * 0.055}
          strokeLinecap="round"
          filter={`url(#${filterId})`}
        />

        {/* Center dot */}
        <circle
          cx={cx}
          cy={cy}
          r={pxSize * 0.04}
          fill="rgba(205, 165, 60, 0.8)"
        />
      </svg>
      <span className="midi-knob__value">{displayValue}</span>
      {hint && <span className="midi-knob__hint">{hint}</span>}
    </div>
  );
}
