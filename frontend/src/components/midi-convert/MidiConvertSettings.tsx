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
    </div>
  );
}
