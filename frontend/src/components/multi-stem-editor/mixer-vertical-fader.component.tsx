import { memo, useCallback } from "react";
import {
  MIXER_GAIN_DB_MAX,
  MIXER_GAIN_DB_MIN,
  formatDb,
} from "../../utils/mixer-format";
import { cn } from "../../utils/cn";

export interface MixerVerticalFaderProps {
  value: number;
  disabled?: boolean;
  height?: number;
  accentColor?: string;
  ariaLabel: string;
  muted?: boolean;
  onChange: (value: number) => void;
  onReset?: () => void;
}

/** Map dB fader value to thumb position (0 = bottom, 1 = top). */
export function faderValueToPercent(
  value: number,
  min = MIXER_GAIN_DB_MIN,
  max = MIXER_GAIN_DB_MAX,
): number {
  return (value - min) / (max - min);
}

export const MixerVerticalFader = memo(function MixerVerticalFader({
  value,
  disabled = false,
  height = 160,
  accentColor = "#f59e0b",
  ariaLabel,
  muted = false,
  onChange,
  onReset,
}: MixerVerticalFaderProps) {
  const thumbPct = faderValueToPercent(value);

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
      onReset?.();
    },
    [disabled, onReset],
  );

  const thumbBottom = `calc(${thumbPct * 100}% - 10px)`;

  return (
    <div
      className={cn(
        "mixer-vertical-fader relative flex shrink-0 items-center justify-center",
        disabled && "opacity-40",
        muted && "opacity-50",
      )}
      style={{ height, width: 28, "--fader-accent": accentColor } as React.CSSProperties}
    >
      <div
        className="mixer-vertical-fader__slot absolute inset-y-1 left-1/2 w-[6px] -translate-x-1/2 rounded-sm"
        aria-hidden
      />
      <div
        className="mixer-vertical-fader__thumb pointer-events-none absolute left-1/2 z-[1] w-[18px] -translate-x-1/2 rounded-[3px]"
        style={{ bottom: thumbBottom }}
        aria-hidden
      >
        <span className="mixer-vertical-fader__thumb-line" />
      </div>
      <input
        type="range"
        min={MIXER_GAIN_DB_MIN}
        max={MIXER_GAIN_DB_MAX}
        step={0.5}
        value={value}
        disabled={disabled}
        onChange={handleChange}
        onClick={stopPropagation}
        onDoubleClick={handleDoubleClick}
        aria-label={ariaLabel}
        aria-valuetext={`${formatDb(value)} dB`}
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
