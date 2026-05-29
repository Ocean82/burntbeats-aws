/**
 * MidiParamSlider — horizontal DAW-style parameter slider (native range input).
 * Decorative groove + ticks; knurled thumb via CSS on type="range".
 */
import { useId, useMemo } from "react";

export interface MidiParamSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  hint?: string;
  formatValue?: (value: number) => string;
}

export function MidiParamSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled = false,
  hint,
  formatValue,
}: MidiParamSliderProps) {
  const inputId = useId();
  const range = max - min;
  const pct = range > 0 ? ((value - min) / range) * 100 : 0;
  const displayValue = formatValue ? formatValue(value) : String(value);

  const ticks = useMemo(() => {
    const tickCount = Math.min(Math.floor(range / step) + 1, 21);
    const items: { pct: number; key: number }[] = [];
    for (let i = 0; i < tickCount; i++) {
      items.push({ pct: tickCount > 1 ? (i / (tickCount - 1)) * 100 : 0, key: i });
    }
    return items;
  }, [range, step]);

  return (
    <div
      className={`midi-param-slider${disabled ? " midi-param-slider--disabled" : ""}`}
    >
      <div className="midi-param-slider__header">
        <label htmlFor={inputId} className="midi-param-slider__label">
          {label}
        </label>
        <span className="midi-param-slider__value" aria-hidden>
          {displayValue}
        </span>
      </div>
      <div className="midi-param-slider__track">
        <div className="midi-param-slider__ticks" aria-hidden>
          {ticks.map((t) => (
            <div
              key={t.key}
              className="midi-param-slider__tick"
              style={{ left: `${t.pct}%` }}
            />
          ))}
        </div>
        <div className="midi-param-slider__groove" aria-hidden />
        <div
          className="midi-param-slider__fill"
          style={{ width: `calc(${pct}% - 4px)` }}
          aria-hidden
        />
        <input
          id={inputId}
          type="range"
          className="midi-param-slider__input"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-valuetext={displayValue}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
      </div>
      {hint && <span className="midi-param-slider__hint">{hint}</span>}
    </div>
  );
}
