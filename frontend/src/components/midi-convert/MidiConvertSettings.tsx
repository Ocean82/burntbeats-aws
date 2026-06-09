/**
 * MidiConvertSettings — conversion options (confidence, note length, pitch bends).
 * Includes stem-type presets and DAW-style physical parameter sliders.
 */
import { useState } from "react";
import { Drum, Guitar, Mic2, Music, Piano } from "lucide-react";
import type { MidiConvertSettings as Settings } from "../../hooks/useMidiConvert";
import { cn } from "../../utils/cn";
import { MidiParamSlider } from "./controls/MidiParamSlider";
import { MidiKnobControl } from "./controls/MidiKnobControl";

const PRESETS: Record<string, { label: string; hint: string; icon: typeof Music; settings: Partial<Settings> }> = {
  vocals: {
    label: "Vocals",
    hint: "Monophonic melody, high confidence",
    icon: Mic2,
    settings: { minConfidence: 0.6, minNoteLengthMs: 80, includePitchBends: true, maxNoteLengthMs: 0 },
  },
  bass: {
    label: "Bass",
    hint: "Low register, fewer short notes",
    icon: Guitar,
    settings: { minConfidence: 0.55, minNoteLengthMs: 100, includePitchBends: false, maxNoteLengthMs: 2000 },
  },
  drums: {
    label: "Drums",
    hint: "Percussive hits, very short notes",
    icon: Drum,
    settings: { minConfidence: 0.35, minNoteLengthMs: 20, includePitchBends: false, maxNoteLengthMs: 500 },
  },
  melody: {
    label: "Melody",
    hint: "Polyphonic, balanced detection",
    icon: Music,
    settings: { minConfidence: 0.5, minNoteLengthMs: 58, includePitchBends: true, maxNoteLengthMs: 0 },
  },
  piano: {
    label: "Piano",
    hint: "Wide range, sustain-friendly",
    icon: Piano,
    settings: { minConfidence: 0.45, minNoteLengthMs: 50, includePitchBends: false, maxNoteLengthMs: 4000 },
  },
};

interface MidiConvertSettingsProps {
  settings: Settings;
  onUpdate: (partial: Partial<Settings>) => void;
  disabled?: boolean;
}

export function MidiConvertSettings({
  settings,
  onUpdate,
  disabled = false,
}: MidiConvertSettingsProps) {
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const applyPreset = (key: string) => {
    const preset = PRESETS[key];
    if (!preset) return;
    onUpdate(preset.settings);
    setActivePreset(key);
  };

  const handleChange = (partial: Partial<Settings>) => {
    setActivePreset(null);
    onUpdate(partial);
  };

  return (
    <div className="midi-inspector" data-testid="midi-convert-settings">
      <p className="midi-inspector__title">Conversion settings</p>
      <div className="flex flex-col gap-xs">
        {/* Preset cards */}
        <div className="midi-preset-grid">
          {Object.entries(PRESETS).map(([key, { label, hint, icon: Icon }]) => {
            const isActive = activePreset === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                disabled={disabled}
                aria-pressed={isActive}
                className={cn(
                  "midi-preset-card",
                  isActive && "midi-preset-card--active",
                  disabled && "opacity-40 cursor-not-allowed",
                )}
              >
                <Icon
                  className={cn(
                    "midi-preset-card__icon",
                    isActive && "midi-preset-card__icon--active",
                  )}
                  aria-hidden
                />
                <span className="midi-preset-card__label">{label}</span>
                <span className="midi-preset-card__hint">{hint}</span>
              </button>
            );
          })}
        </div>

        {/* Detection section */}
        <div className="midi-section-divider" aria-hidden />
        <div className="midi-rack-panel__section-label">Detection</div>

        <div className="flex flex-wrap items-start gap-md px-sm py-xs">
          <MidiKnobControl
            label="Confidence"
            value={settings.minConfidence}
            min={0.1}
            max={0.9}
            step={0.05}
            defaultValue={0.5}
            onChange={(v) => handleChange({ minConfidence: v })}
            disabled={disabled}
            formatValue={(v) => v.toFixed(2)}
            size="md"
            hint="Threshold"
          />
          <MidiKnobControl
            label="Transpose"
            value={settings.transpose}
            min={-12}
            max={12}
            step={1}
            defaultValue={0}
            onChange={(v) => handleChange({ transpose: v })}
            disabled={disabled}
            formatValue={(v) => (v === 0 ? "0" : v > 0 ? `+${v}` : `${v}`)}
            size="md"
            hint="Semitones"
          />
        </div>

        <MidiParamSlider
          label="Min Note Length"
          value={settings.minNoteLengthMs}
          min={20}
          max={200}
          step={5}
          onChange={(v) => handleChange({ minNoteLengthMs: v })}
          disabled={disabled}
          formatValue={(v) => `${v}ms`}
          hint="Filters out very short notes. Increase for cleaner output."
        />

        {/* Pitch bends toggle */}
        <div className="flex items-center gap-xs px-sm py-1">
          <button
            type="button"
            role="switch"
            aria-checked={settings.includePitchBends}
            onClick={() => handleChange({ includePitchBends: !settings.includePitchBends })}
            disabled={disabled}
            className={`midi-toggle${settings.includePitchBends ? " midi-toggle--on" : ""}${disabled ? " midi-toggle--disabled" : ""}`}
          >
            <span className="midi-toggle__track">
              <span className="midi-toggle__thumb" aria-hidden />
            </span>
            <span className="text-sm">Pitch bends</span>
          </button>
        </div>

        {/* Post-processing section */}
        <div className="midi-section-divider" aria-hidden />
        <div className="midi-rack-panel__section-label">Post-processing</div>

        {/* Normalize velocity toggle */}
        <div className="flex items-center gap-xs px-sm py-1">
          <button
            type="button"
            role="switch"
            aria-checked={settings.normalizeVelocity}
            onClick={() => handleChange({ normalizeVelocity: !settings.normalizeVelocity })}
            disabled={disabled}
            className={`midi-toggle${settings.normalizeVelocity ? " midi-toggle--on" : ""}${disabled ? " midi-toggle--disabled" : ""}`}
          >
            <span className="midi-toggle__track">
              <span className="midi-toggle__thumb" aria-hidden />
            </span>
            <span className="text-sm">Normalize velocity</span>
          </button>
        </div>

        {/* Conditional: target velocity slider */}
        {settings.normalizeVelocity && (
          <div className="ml-lg border-l-2 border-accent-midi/20 pl-sm">
            <MidiParamSlider
              label="Target Peak Velocity"
              value={settings.targetVelocity}
              min={40}
              max={127}
              step={1}
              onChange={(v) => handleChange({ targetVelocity: v })}
              disabled={disabled}
              hint="Peak velocity for normalized notes (MIDI 0-127)."
            />
          </div>
        )}

        <MidiParamSlider
          label="Max Note Length"
          value={settings.maxNoteLengthMs}
          min={0}
          max={4000}
          step={100}
          onChange={(v) => handleChange({ maxNoteLengthMs: v })}
          disabled={disabled}
          formatValue={(v) => (v === 0 ? "OFF" : `${v}ms`)}
          hint="Caps sustained false notes. 0 = unlimited."
        />

        {/* Quantize section */}
        <div className="midi-section-divider" aria-hidden />
        <div className="midi-rack-panel__section-label">Quantize</div>

        {/* Quantize toggle */}
        <div className="flex items-center gap-xs px-sm py-1">
          <button
            type="button"
            role="switch"
            aria-checked={settings.quantize}
            onClick={() => handleChange({ quantize: !settings.quantize })}
            disabled={disabled}
            className={`midi-toggle${settings.quantize ? " midi-toggle--on" : ""}${disabled ? " midi-toggle--disabled" : ""}`}
          >
            <span className="midi-toggle__track">
              <span className="midi-toggle__thumb" aria-hidden />
            </span>
            <span className="text-sm">Enable quantize</span>
          </button>
        </div>

        {/* Conditional: quantize sub-controls */}
        {settings.quantize && (
          <div className="ml-lg border-l-2 border-accent-midi/20 pl-sm">
            <div className="flex flex-col gap-xs px-sm py-1">
              <div className="flex flex-wrap items-start gap-md">
                <MidiKnobControl
                  label="BPM"
                  value={settings.quantizeBpm}
                  min={40}
                  max={300}
                  step={1}
                  defaultValue={120}
                  onChange={(v) => handleChange({ quantizeBpm: v })}
                  disabled={disabled}
                  formatValue={(v) => `${Math.round(v)}`}
                  size="lg"
                />
                <div className="flex flex-col gap-xs flex-1 min-w-[140px]">
                  <div className="flex items-center justify-between">
                    <label htmlFor="midi-quantize-grid" className="midi-param-slider__label">
                      Grid Division
                    </label>
                    <select
                      id="midi-quantize-grid"
                      value={settings.quantizeGrid}
                      onChange={(e) => handleChange({ quantizeGrid: e.target.value })}
                      disabled={disabled}
                      className="midi-rack-select"
                    >
                      <option value="1/4">1/4</option>
                      <option value="1/8">1/8</option>
                      <option value="1/16">1/16</option>
                      <option value="1/32">1/32</option>
                    </select>
                  </div>

                  <MidiParamSlider
                    label="Quantize Strength"
                    value={settings.quantizeStrength}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(v) => handleChange({ quantizeStrength: v })}
                    disabled={disabled}
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                    hint="Lower = keeps more original timing. 100% = fully snapped to grid."
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
