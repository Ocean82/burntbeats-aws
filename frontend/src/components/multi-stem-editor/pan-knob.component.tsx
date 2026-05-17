import { memo, useCallback, useId, useState } from "react";
import { formatPan } from "../../utils/mixer-format";
import { cn } from "../../utils/cn";
import { useRotaryKnob } from "./use-rotary-knob";

export interface PanKnobProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  color?: string;
  variant?: "default" | "console";
  ariaLabel: string;
  onChange: (value: number) => void;
}

const MIN_ANGLE = -135;
const MAX_ANGLE = 135;
const KNOB_SIZE_DEFAULT = 44;
const KNOB_SIZE_CONSOLE = 52;

export const PanKnob = memo(function PanKnob({
  value,
  min = -100,
  max = 100,
  step = 1,
  disabled = false,
  color = "#f59e0b",
  variant = "default",
  ariaLabel,
  onChange,
}: PanKnobProps) {
  const gradientId = useId();
  const [focused, setFocused] = useState(false);
  const isConsole = variant === "console";
  const KNOB_SIZE = isConsole ? KNOB_SIZE_CONSOLE : KNOB_SIZE_DEFAULT;

  const { normalize, handleMouseDown, handleWheel, handleKeyDown } = useRotaryKnob({
    value,
    min,
    max,
    step,
    disabled,
    onChange,
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
  const r = KNOB_SIZE * 0.34;
  const trackR = r + KNOB_SIZE * 0.06;
  const toRad = (deg: number) => (deg - 90) * (Math.PI / 180);
  const px = (deg: number) => cx + trackR * Math.cos(toRad(deg));
  const py = (deg: number) => cy + trackR * Math.sin(toRad(deg));

  const centerTickLen = r * (isConsole ? 0.42 : 0.35);
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

  const readout = (
    <span
      className={cn(
        "pan-knob__readout font-mono tabular-nums",
        isConsole ? "pan-knob__readout--console" : "text-[9px] text-white/45",
      )}
    >
      {formatPan(value)}
    </span>
  );

  return (
    <div
      className={cn(
        "pan-knob flex flex-col items-center select-none",
        isConsole ? "pan-knob--console w-[52px] gap-0.5" : "gap-0.5",
      )}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <svg
        width={KNOB_SIZE}
        height={KNOB_SIZE}
        overflow="visible"
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
        onPointerDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onClick={(e) => e.stopPropagation()}
        style={{ touchAction: "none" }}
      >
        {isConsole && (
          <defs>
            <radialGradient id={gradientId} cx="35%" cy="28%" r="70%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
              <stop offset="55%" stopColor="rgba(40,40,45,0.9)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.85)" />
            </radialGradient>
          </defs>
        )}
        <circle
          cx={cx}
          cy={cy}
          r={trackR}
          fill="none"
          stroke={isConsole ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.08)"}
          strokeWidth={isConsole ? 4 : 3}
        />
        {value !== min && (
          <path
            d={arcPath}
            fill="none"
            stroke={color}
            strokeWidth={isConsole ? 3.5 : 3}
            strokeLinecap="round"
            opacity={disabled ? 0.4 : 1}
          />
        )}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={isConsole ? `url(#${gradientId})` : "rgba(0,0,0,0.5)"}
          stroke={focused ? color : isConsole ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.12)"}
          strokeWidth={isConsole ? 1.5 : 1}
        />
        <line
          x1={centerX1}
          y1={centerY1}
          x2={centerX2}
          y2={centerY2}
          stroke={isConsole ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.25)"}
          strokeWidth={isConsole ? 1.5 : 1}
          strokeLinecap="round"
        />
        <line
          x1={cx}
          y1={cy}
          x2={indX}
          y2={indY}
          stroke={color}
          strokeWidth={isConsole ? 3 : 2.5}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={isConsole ? 2.5 : 2} fill={color} opacity={0.85} />
      </svg>
      {readout}
    </div>
  );
});
