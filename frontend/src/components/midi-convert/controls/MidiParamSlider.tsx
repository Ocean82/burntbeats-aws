/**
 * MidiParamSlider — horizontal DAW-style parameter slider.
 * Physical groove track, knurled thumb, value readout, and optional tick marks.
 * Designed for the MIDI conversion settings panel.
 */
import { useCallback, useRef, useState } from "react";

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
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const range = max - min;
  const pct = range > 0 ? ((value - min) / range) * 100 : 0;

  const displayValue = formatValue ? formatValue(value) : String(value);

  const valueFromPointer = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const raw = (clientX - rect.left) / rect.width;
      const clamped = Math.max(0, Math.min(1, raw));
      const rawValue = min + clamped * range;
      const steps = Math.round(rawValue / step);
      const snapped = Math.max(min, Math.min(max, steps * step));
      // Avoid floating-point drift: round to step precision
      const decimals = step.toString().split(".")[1]?.length ?? 0;
      onChange(parseFloat(snapped.toFixed(decimals)));
    },
    [min, max, range, step, onChange],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    valueFromPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || disabled) return;
    valueFromPointer(e.clientX);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  // Generate tick marks
  const tickCount = Math.min(Math.floor(range / step) + 1, 21);
  const ticks = [];
  for (let i = 0; i < tickCount; i++) {
    const tickPct = (i / (tickCount - 1)) * 100;
    ticks.push(
      <div
        key={i}
        className="midi-param-slider__tick"
        style={{ left: `${tickPct}%` }}
        aria-hidden
      />,
    );
  }

  return (
    <div className={`midi-param-slider${isDragging ? " midi-param-slider--dragging" : ""}${disabled ? " midi-param-slider--disabled" : ""}`}>
      <div className="midi-param-slider__header">
        <span className="midi-param-slider__label">{label}</span>
        <span className="midi-param-slider__value">{displayValue}</span>
      </div>
      <div
        ref={trackRef}
        className="midi-param-slider__track"
        role="slider"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="midi-param-slider__ticks" aria-hidden>
          {ticks}
        </div>
        <div className="midi-param-slider__groove" aria-hidden />
        <div
          className="midi-param-slider__fill"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
        <div
          className="midi-param-slider__thumb"
          style={{ left: `${pct}%` }}
          aria-hidden
        />
      </div>
      {hint && <span className="midi-param-slider__hint">{hint}</span>}
    </div>
  );
}
