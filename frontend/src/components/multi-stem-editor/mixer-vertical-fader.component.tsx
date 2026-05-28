import { memo, useCallback, useState } from "react";
import {
  MIXER_GAIN_DB_MAX,
  MIXER_GAIN_DB_MIN,
  formatDb,
} from "../../utils/mixer-format";
import { cn } from "../../utils/cn";

export interface MixerVerticalFaderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  height?: number;
  accentColor?: string;
  ariaLabel: string;
  muted?: boolean;
  formatValue?: (value: number) => string;
  resetValue?: number;
  onChange: (value: number) => void;
  onReset?: () => void;
}

/** Map fader value to thumb position (0 = bottom, 1 = top). */
export function faderValueToPercent(
  value: number,
  min = MIXER_GAIN_DB_MIN,
  max = MIXER_GAIN_DB_MAX,
): number {
  if (max === min) return 0;
  return (value - min) / (max - min);
}

export const MixerVerticalFader = memo(function MixerVerticalFader({
  value,
  min = MIXER_GAIN_DB_MIN,
  max = MIXER_GAIN_DB_MAX,
  step = 0.5,
  disabled = false,
  height = 160,
  accentColor = "var(--primary-400)",
  ariaLabel,
  muted = false,
  formatValue = formatDb,
  resetValue = 0,
  onChange,
  onReset,
}: MixerVerticalFaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const thumbPct = faderValueToPercent(value, min, max);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    },
    [onChange],
  );

  const stopPropagation = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLInputElement>) => {
      e.stopPropagation();
      if (disabled) return;
      if (onReset) {
        onReset();
      } else {
        onChange(resetValue);
      }
    },
    [disabled, onReset, onChange, resetValue],
  );

  const handlePointerDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handlePointerEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const thumbBottom = `clamp(4px, calc(${thumbPct * 100}% - 10px), calc(100% - 24px))`;
  const valueText = formatValue(value);

  return (
    <div
      className={cn(
        "mixer-vertical-fader relative flex shrink-0 items-center justify-center overflow-visible",
        isDragging && "mixer-vertical-fader--dragging",
        disabled && "opacity-40",
        muted && "opacity-50",
      )}
      style={{ height, width: 32, "--fader-accent": accentColor } as React.CSSProperties}
    >
      <div
        className="fader-groove absolute inset-y-0 left-1/2 w-[10px] -translate-x-1/2"
        aria-hidden
      />
      <div
        className="mixer-vertical-fader__thumb pointer-events-none absolute left-1/2 z-[1] w-[24px] -translate-x-1/2"
        style={{ 
          bottom: thumbBottom,
          background: "linear-gradient(180deg, var(--muted) 0%, var(--bg) 100%)",
          boxShadow: isDragging 
            ? `0 0 15px ${accentColor}88, 0 4px 8px rgba(0,0,0,0.5)` 
            : `0 4px 8px rgba(0,0,0,0.5)`
        }}
        aria-hidden
      >
        <div 
          className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2" 
          style={{ background: accentColor, boxShadow: `0 0 8px ${accentColor}` }}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={handleChange}
        onClick={stopPropagation}
        onDoubleClick={handleDoubleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onBlur={handlePointerEnd}
        aria-label={ariaLabel}
        aria-valuetext={valueText}
        className="mixer-vertical-fader__input absolute inset-0 z-[2] h-full w-full cursor-pointer opacity-0"
        style={
          {
            WebkitAppearance: "slider-vertical",
            writingMode: "vertical-lr",
            direction: "rtl",
          } as React.CSSProperties
        }
      />
    </div>
  );
});
