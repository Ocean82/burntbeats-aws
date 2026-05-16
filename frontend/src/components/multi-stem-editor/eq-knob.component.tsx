import { memo, useCallback, useId, useState } from "react";
import { formatDb } from "../../utils/mixer-format";
import { cn } from "../../utils/cn";
import { useRotaryKnob } from "./use-rotary-knob";

export interface EqKnobProps {
  value: number;
  label: string;
  disabled?: boolean;
  color?: string;
  ariaLabel: string;
  onChange: (value: number) => void;
}

const MIN_ANGLE = -135;
const MAX_ANGLE = 135;
const KNOB_SIZE = 32;

export const EqKnob = memo(function EqKnob({
  value,
  label,
  disabled = false,
  color = "#f59e0b",
  ariaLabel,
  onChange,
}: EqKnobProps) {
  const gradientId = useId();
  const [focused, setFocused] = useState(false);
  const min = -12;
  const max = 12;
  const step = 0.5;

  const { normalize, handleMouseDown, handleWheel, handleKeyDown } = useRotaryKnob({
    value,
    min,
    max,
    step,
    disabled,
    onChange,
    dragSensitivity: 120,
  });

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (disabled) return;
      onChange(0);
    },
    [disabled, onChange],
  );

  const angle = MIN_ANGLE + normalize(value) * (MAX_ANGLE - MIN_ANGLE);
  const cx = KNOB_SIZE / 2;
  const cy = KNOB_SIZE / 2;
  const r = KNOB_SIZE * 0.32;
  const toRad = (deg: number) => (deg - 90) * (Math.PI / 180);
  const indLen = r * 0.55;
  const indX = cx + indLen * Math.cos(toRad(angle));
  const indY = cy + indLen * Math.sin(toRad(angle));

  const displayDb =
    value === 0 ? "0" : value > 0 ? `+${value.toFixed(0)}` : value.toFixed(0);

  return (
    <div className="flex flex-col items-center gap-0.5 select-none">
      <span className="text-[7px] font-semibold uppercase tracking-wider text-white/35">
        {label}
      </span>
      <svg
        width={KNOB_SIZE}
        height={KNOB_SIZE}
        tabIndex={disabled ? -1 : 0}
        role="slider"
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${formatDb(value)} dB`}
        className={cn(
          "cursor-pointer outline-none",
          disabled && "cursor-not-allowed opacity-40",
          focused && !disabled && "drop-shadow-[0_0_4px_rgba(245,158,11,0.3)]",
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
        <defs>
          <radialGradient id={gradientId} cx="35%" cy="30%" r="65%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.14)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.65)" />
          </radialGradient>
        </defs>
        <circle
          cx={cx}
          cy={cy}
          r={r + 3}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={2}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={`url(#${gradientId})`}
          stroke={focused ? color : "rgba(255,255,255,0.1)"}
          strokeWidth={1}
        />
        <line
          x1={cx}
          y1={cy - r * 0.3}
          x2={cx}
          y2={cy - r * 0.15}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth={0.75}
          strokeLinecap="round"
        />
        <line
          x1={cx}
          y1={cy}
          x2={indX}
          y2={indY}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </svg>
      <span className="font-mono text-[7px] tabular-nums text-white/40">{displayDb}</span>
    </div>
  );
});
