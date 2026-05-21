/**
 * MidiConvertSettings — conversion options (confidence, note length, pitch bends).
 */
import type { MidiConvertSettings as Settings } from "../../hooks/useMidiConvert";

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
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/8 bg-white/3 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
        Conversion settings
      </p>

      {/* Min confidence slider */}
      <label className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-sm text-white/70">
          <span>Note confidence threshold</span>
          <span className="font-mono text-xs text-violet-300">
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
            onUpdate({ minConfidence: parseFloat(e.target.value) })
          }
          disabled={disabled}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-violet-900/40 accent-violet-400 disabled:opacity-40"
        />
        <span className="text-[10px] text-white/35">
          Higher = fewer notes but more accurate. Lower = more notes but may include noise.
        </span>
      </label>

      {/* Min note length slider */}
      <label className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-sm text-white/70">
          <span>Minimum note length</span>
          <span className="font-mono text-xs text-violet-300">
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
            onUpdate({ minNoteLengthMs: parseInt(e.target.value, 10) })
          }
          disabled={disabled}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-violet-900/40 accent-violet-400 disabled:opacity-40"
        />
        <span className="text-[10px] text-white/35">
          Filters out very short notes. Increase for cleaner output.
        </span>
      </label>

      {/* Pitch bends checkbox */}
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-white/70">
        <input
          type="checkbox"
          checked={settings.includePitchBends}
          onChange={(e) => onUpdate({ includePitchBends: e.target.checked })}
          disabled={disabled}
          className="rounded border-violet-400/40 bg-violet-950/40 text-violet-400 focus:ring-violet-400/50"
        />
        Include pitch bends
      </label>

      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-white/45">
        Post-processing
      </p>

      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-white/70">
        <input
          type="checkbox"
          checked={settings.normalizeVelocity}
          onChange={(e) => onUpdate({ normalizeVelocity: e.target.checked })}
          disabled={disabled}
          className="rounded border-violet-400/40 bg-violet-950/40 text-violet-400 focus:ring-violet-400/50"
        />
        Normalize velocity dynamics
      </label>

      {settings.normalizeVelocity && (
        <label
          htmlFor="midi-convert-target-velocity"
          className="ml-5 flex flex-col gap-1.5 border-l border-violet-400/20 pl-3"
        >
          <span className="flex items-center justify-between text-sm text-white/70">
            <span>Target peak velocity</span>
            <span className="font-mono text-xs text-violet-300">
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
              onUpdate({ targetVelocity: parseInt(e.target.value, 10) })
            }
            disabled={disabled}
            aria-label="Target peak velocity"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-violet-900/40 accent-violet-400 disabled:opacity-40"
          />
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-sm text-white/70">
          <span>Max note length</span>
          <span className="font-mono text-xs text-violet-300">
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
            onUpdate({ maxNoteLengthMs: parseInt(e.target.value, 10) })
          }
          disabled={disabled}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-violet-900/40 accent-violet-400 disabled:opacity-40"
        />
        <span className="text-[10px] text-white/35">
          Removes sustained false notes. 0 = disabled.
        </span>
      </label>

      {/* Transpose control */}
      <label className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-sm text-white/70">
          <span>Transpose</span>
          <span className="font-mono text-xs text-violet-300">
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
            onUpdate({ transpose: parseInt(e.target.value, 10) })
          }
          disabled={disabled}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-violet-900/40 accent-violet-400 disabled:opacity-40"
        />
        <span className="text-[10px] text-white/35">
          Shift all notes up or down. Useful for key matching in your DAW.
        </span>
      </label>

      {/* Quantize output checkbox */}
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-white/70">
        <input
          type="checkbox"
          checked={settings.quantize}
          onChange={(e) => onUpdate({ quantize: e.target.checked })}
          disabled={disabled}
          className="rounded border-violet-400/40 bg-violet-950/40 text-violet-400 focus:ring-violet-400/50"
        />
        Quantize output
      </label>

      {/* Conditional quantization settings */}
      {settings.quantize && (
        <div className="ml-5 flex flex-col gap-3 border-l border-violet-400/20 pl-3">
          {/* Grid division selector */}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-white/70">Grid division</span>
            <select
              value={settings.quantizeGrid}
              onChange={(e) => onUpdate({ quantizeGrid: e.target.value })}
              disabled={disabled}
              className="rounded border border-violet-400/30 bg-violet-950/40 px-2 py-1.5 text-sm text-white/90 accent-violet-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400/50 disabled:opacity-40"
            >
              <option value="1/4">1/4</option>
              <option value="1/8">1/8</option>
              <option value="1/16">1/16</option>
              <option value="1/32">1/32</option>
            </select>
          </label>

          {/* BPM input */}
          <label className="flex flex-col gap-1.5">
            <span className="flex items-center justify-between text-sm text-white/70">
              <span>BPM</span>
              <span className="font-mono text-xs text-violet-300">
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
                  onUpdate({ quantizeBpm: Math.max(40, Math.min(300, val)) });
                }
              }}
              disabled={disabled}
              className="rounded border border-violet-400/30 bg-violet-950/40 px-2 py-1.5 text-sm text-white/90 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400/50 disabled:opacity-40"
            />
            <span className="text-[10px] text-white/35">
              Tempo for grid alignment (40–300 BPM)
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="flex items-center justify-between text-sm text-white/70">
              <span>Quantize strength</span>
              <span className="font-mono text-xs text-violet-300">
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
                onUpdate({ quantizeStrength: parseFloat(e.target.value) })
              }
              disabled={disabled}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-violet-900/40 accent-violet-400 disabled:opacity-40"
            />
            <span className="text-[10px] text-white/35">
              Lower values keep more of the original timing.
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
