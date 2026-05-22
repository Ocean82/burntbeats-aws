/**
 * Vertical fader with groove track (DAW-style draw velocity, etc.).
 */
export interface MidiPhysicalFaderProps {
  label: string;
  min?: number;
  max?: number;
  value: number;
  onChange: (value: number) => void;
  ariaLabel?: string;
}

export function MidiPhysicalFader({
  label,
  min = 0,
  max = 127,
  value,
  onChange,
  ariaLabel,
}: MidiPhysicalFaderProps) {
  const range = max - min;
  const pct = range > 0 ? ((value - min) / range) * 100 : 0;

  return (
    <div className="midi-fader" title={ariaLabel ?? label}>
      <span className="midi-fader__label">{label}</span>
      <div className="midi-fader__track-wrap">
        <div className="midi-fader__track" aria-hidden />
        <div className="midi-fader__fill" style={{ height: `${Math.max(8, pct)}%` }} aria-hidden />
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          aria-label={ariaLabel ?? label}
        />
      </div>
      <span className="midi-fader__value">{value}</span>
    </div>
  );
}
