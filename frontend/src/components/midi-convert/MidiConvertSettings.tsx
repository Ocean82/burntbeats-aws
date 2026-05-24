/**
 * MidiConvertSettings — conversion options (confidence, note length, pitch bends).
 * Includes stem-type presets for quick configuration.
 */
import { useState } from "react";
import type { MidiConvertSettings as Settings } from "../../hooks/useMidiConvert";

const PRESETS: Record<string, { label: string; hint: string; settings: Partial<Settings> }> = {
  vocals: {
    label: "Vocals",
    hint: "Monophonic melody — high confidence, longer notes",
    settings: { minConfidence: 0.6, minNoteLengthMs: 80, includePitchBends: true, maxNoteLengthMs: 0 },
  },
  bass: {
    label: "Bass",
    hint: "Low register — fewer short notes, no pitch bends",
    settings: { minConfidence: 0.55, minNoteLengthMs: 100, includePitchBends: false, maxNoteLengthMs: 2000 },
  },
  drums: {
    label: "Drums",
    hint: "Percussive hits — low confidence, very short notes",
    settings: { minConfidence: 0.35, minNoteLengthMs: 20, includePitchBends: false, maxNoteLengthMs: 500 },
  },
  melody: {
    label: "Melody",
    hint: "Polyphonic — balanced detection",
    settings: { minConfidence: 0.5, minNoteLengthMs: 58, includePitchBends: true, maxNoteLengthMs: 0 },
  },
  piano: {
    label: "Piano / Keys",
    hint: "Wide range, sustain-friendly",
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

  // Clear preset indicator when user manually changes a setting
  const handleUpdate = (partial: Partial<Settings>) => {
    setActivePreset(null);
    handleUpdate(partial);
  };

  return (
    <div className="flex flex-col gap-sm rounded-xl border border-border bg-muted px-md py-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Conversion settings
      </p>

      {/* Stem-type presets */}
      <div className="flex flex-col gap-xs">
        <span className="text-xs text-muted-foreground">
          Quick presets — pick your source type for optimized settings:
        </span>
        <div className="flex flex-wrap gap-xs">
          {Object.entries(PRESETS).map(([key, { label, hint }]) => (
            <button
              key={key}
              type="button"
              onClick={() => applyPreset(key)}
              disabled={disabled}
              title={hint}
              className={`rounded-full border px-sm py-xs text-xs font-medium transition ${
                activePreset === key
                  ? "border-accent-midi-400/60 bg-accent-midi-500/20 text-accent-midi-200"
                  : "border-border bg-secondary text-muted-foreground hover:text-secondary-foreground hover:border-border"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Min confidence slider */}
      <label className="flex flex-col gap-xs">
        <span className="flex items-center justify-between text-sm text-secondary-foreground">
          <span>Note confidence threshold</span>
          <span className="font-mono text-xs text-accent-midi-300">
            {settings.minConfidence.toFixed(2)}
          </span>
        </span>
        <input
          type="range"
          min={0.1}
          max={0.9}
          step={0.05}
          value={settings.minConfidence}
          onChange={(e) =>
            handleUpdate({ minConfidence: parseFloat(e.target.value) })
          }
          disabled={disabled}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-accent-midi-900/40 accent-accent-midi-400 disabled:opacity-40"
        />
        <span className="text-meta text-muted-foreground">
          Higher = fewer notes but more accurate. Lower = more notes but may include noise.
        </span>
      </label>

      {/* Min note length slider */}
      <label className="flex flex-col gap-xs">
        <span className="flex items-center justify-between text-sm text-secondary-foreground">
          <span>Minimum note length</span>
          <span className="font-mono text-xs text-accent-midi-300">
            {settings.minNoteLengthMs}ms
          </span>
        </span>
        <input
          type="range"
          min={20}
          max={200}
          step={5}
          value={settings.minNoteLengthMs}
          onChange={(e) =>
            handleUpdate({ minNoteLengthMs: parseInt(e.target.value, 10) })
          }
          disabled={disabled}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-accent-midi-900/40 accent-accent-midi-400 disabled:opacity-40"
        />
        <span className="text-meta text-muted-foreground">
          Filters out very short notes. Increase for cleaner output.
        </span>
      </label>

      {/* Pitch bends checkbox */}
      <label className="inline-flex cursor-pointer items-center gap-xs text-sm text-secondary-foreground">
        <input
          type="checkbox"
          checked={settings.includePitchBends}
          onChange={(e) => handleUpdate({ includePitchBends: e.target.checked })}
          disabled={disabled}
          className="rounded border-accent-midi-400/40 bg-accent-midi-950/40 text-accent-midi-400 focus:ring-accent-midi-400/50"
        />
        Include pitch bends
      </label>

      <p className="mt-2xs text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Post-processing
      </p>

      <label className="inline-flex cursor-pointer items-center gap-xs text-sm text-secondary-foreground">
        <input
          type="checkbox"
          checked={settings.normalizeVelocity}
          onChange={(e) => handleUpdate({ normalizeVelocity: e.target.checked })}
          disabled={disabled}
          className="rounded border-accent-midi-400/40 bg-accent-midi-950/40 text-accent-midi-400 focus:ring-accent-midi-400/50"
        />
        Normalize velocity dynamics
      </label>

      {settings.normalizeVelocity && (
        <label
          htmlFor="midi-convert-target-velocity"
          className="ml-lg flex flex-col gap-xs border-l border-accent-midi/25 pl-sm"
        >
          <span className="flex items-center justify-between text-sm text-secondary-foreground">
            <span>Target peak velocity</span>
            <span className="font-mono text-xs text-accent-midi-300">
              {settings.targetVelocity}
            </span>
          </span>
          <input
            id="midi-convert-target-velocity"
            type="range"
            min={40}
            max={127}
            step={1}
            value={settings.targetVelocity}
            onChange={(e) =>
              handleUpdate({ targetVelocity: parseInt(e.target.value, 10) })
            }
            disabled={disabled}
            aria-label="Target peak velocity"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-accent-midi-900/40 accent-accent-midi-400 disabled:opacity-40"
          />
        </label>
      )}

      <label className="flex flex-col gap-xs">
        <span className="flex items-center justify-between text-sm text-secondary-foreground">
          <span>Max note length</span>
          <span className="font-mono text-xs text-accent-midi-300">
            {settings.maxNoteLengthMs === 0
              ? "off"
              : `${settings.maxNoteLengthMs}ms`}
          </span>
        </span>
        <input
          type="range"
          min={0}
          max={4000}
          step={100}
          value={settings.maxNoteLengthMs}
          onChange={(e) =>
            handleUpdate({ maxNoteLengthMs: parseInt(e.target.value, 10) })
          }
          disabled={disabled}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-accent-midi-900/40 accent-accent-midi-400 disabled:opacity-40"
        />
        <span className="text-meta text-muted-foreground">
          Removes sustained false notes. 0 = disabled.
        </span>
      </label>

      {/* Transpose control */}
      <label className="flex flex-col gap-xs">
        <span className="flex items-center justify-between text-sm text-secondary-foreground">
          <span>Transpose</span>
          <span className="font-mono text-xs text-accent-midi-300">
            {settings.transpose === 0
              ? "0"
              : settings.transpose > 0
                ? `+${settings.transpose}`
                : `${settings.transpose}`}{" "}
            semitones
          </span>
        </span>
        <input
          type="range"
          min={-12}
          max={12}
          step={1}
          value={settings.transpose}
          onChange={(e) =>
            handleUpdate({ transpose: parseInt(e.target.value, 10) })
          }
          disabled={disabled}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-accent-midi-900/40 accent-accent-midi-400 disabled:opacity-40"
        />
        <span className="text-meta text-muted-foreground">
          Shift all notes up or down. Useful for key matching in your DAW.
        </span>
      </label>

      {/* Quantize output checkbox */}
      <label className="inline-flex cursor-pointer items-center gap-xs text-sm text-secondary-foreground">
        <input
          type="checkbox"
          checked={settings.quantize}
          onChange={(e) => handleUpdate({ quantize: e.target.checked })}
          disabled={disabled}
          className="rounded border-accent-midi-400/40 bg-accent-midi-950/40 text-accent-midi-400 focus:ring-accent-midi-400/50"
        />
        Quantize output
      </label>

      {/* Conditional quantization settings */}
      {settings.quantize && (
        <div className="ml-lg flex flex-col gap-sm border-l border-accent-midi/25 pl-sm">
          {/* Grid division selector */}
          <label className="flex flex-col gap-xs">
            <span className="text-sm text-secondary-foreground">Grid division</span>
            <select
              value={settings.quantizeGrid}
              onChange={(e) => handleUpdate({ quantizeGrid: e.target.value })}
              disabled={disabled}
              className="rounded border border-accent-midi/30 bg-accent-midi-950/40 px-xs py-xs text-sm text-secondary-foreground accent-accent-midi focus:border-accent-midi focus:outline-none focus:ring-1 focus:ring-accent-midi/50 disabled:opacity-40"
            >
              <option value="1/4">1/4</option>
              <option value="1/8">1/8</option>
              <option value="1/16">1/16</option>
              <option value="1/32">1/32</option>
            </select>
          </label>

          {/* BPM input */}
          <label className="flex flex-col gap-xs">
            <span className="flex items-center justify-between text-sm text-secondary-foreground">
              <span>BPM</span>
              <span className="font-mono text-xs text-accent-midi-300">
                {settings.quantizeBpm}
              </span>
            </span>
            <input
              type="number"
              min={40}
              max={300}
              value={settings.quantizeBpm}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) {
                  handleUpdate({ quantizeBpm: Math.max(40, Math.min(300, val)) });
                }
              }}
              disabled={disabled}
              className="rounded border border-accent-midi/30 bg-accent-midi-950/40 px-xs py-xs text-sm text-secondary-foreground focus:border-accent-midi focus:outline-none focus:ring-1 focus:ring-accent-midi/50 disabled:opacity-40"
            />
            <span className="text-meta text-muted-foreground">
              Tempo for grid alignment (40–300 BPM)
            </span>
          </label>

          <label className="flex flex-col gap-xs">
            <span className="flex items-center justify-between text-sm text-secondary-foreground">
              <span>Quantize strength</span>
              <span className="font-mono text-xs text-accent-midi-300">
                {Math.round(settings.quantizeStrength * 100)}%
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.quantizeStrength}
              onChange={(e) =>
                handleUpdate({ quantizeStrength: parseFloat(e.target.value) })
              }
              disabled={disabled}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-accent-midi-900/40 accent-accent-midi-400 disabled:opacity-40"
            />
            <span className="text-meta text-muted-foreground">
              Lower values keep more of the original timing.
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
