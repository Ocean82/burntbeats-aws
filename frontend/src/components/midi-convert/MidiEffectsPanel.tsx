/**
 * MidiEffectsPanel — creative MIDI transforms (transpose, scale, chords, repeat, arp).
 * Adapted from BEATS-DAW2; applies non-destructively via parent callback.
 */
import { Wand2 } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  cloneMidiEffects,
  defaultMidiEffects,
  hasActiveMidiEffects,
  MIDI_FX_PRESETS,
  type ArpPattern,
  type ChordType,
  type MidiEffectsConfig,
} from "../../audio/midiEffects";
import type { MidiFxApplyMode } from "./editorTypes";
import { NOTE_NAMES, type RootNote, type Scale } from "../../utils/musicTheory";
import { cn } from "../../utils/cn";
import { SectionLabel } from "../ui/SectionLabel";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Button } from "../ui/button";

const CHORD_TYPES: ChordType[] = [
  "major",
  "minor",
  "maj7",
  "min7",
  "dom7",
  "sus2",
  "sus4",
  "dim",
  "aug",
  "add9",
];

const VOICINGS = ["close", "open", "drop2", "drop3"] as const;
const ARP_PATTERNS: ArpPattern[] = [
  "up",
  "down",
  "updown",
  "downup",
  "random",
  "chord",
  "played",
];
const SCALES: Scale[] = [
  "chromatic",
  "major",
  "minor",
  "pentatonic",
  "blues",
  "dorian",
  "mixolydian",
];
const RATE_OPTIONS = [1, 2, 4, 8, 16, 32];

export interface MidiEffectsPanelProps {
  trackName: string;
  config: MidiEffectsConfig;
  applyMode: MidiFxApplyMode;
  previewEnabled: boolean;
  onChange: (config: MidiEffectsConfig) => void;
  onApplyModeChange: (mode: MidiFxApplyMode) => void;
  onPreviewChange: (enabled: boolean) => void;
  onApplyPreset: (config: MidiEffectsConfig) => void;
  onApply: () => void;
  targetCount: number;
  applyToAllTrack?: boolean;
  onApplyToAllTrackChange?: (enabled: boolean) => void;
  disabled?: boolean;
  className?: string;
}

function EffectBlock({
  title,
  enabled,
  onToggleEnabled,
  children,
  accentClass = "bg-accent-midi",
}: {
  title: string;
  enabled?: boolean;
  onToggleEnabled?: () => void;
  children?: ReactNode;
  accentClass?: string;
}) {
  const toggleLabel = enabled ? `Turn off ${title}` : `Turn on ${title}`;
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 p-sm space-y-xs">
      <div className="flex items-center justify-between gap-sm">
        <span className="text-xs font-medium text-foreground">{title}</span>
        {onToggleEnabled !== undefined && (
          <button
            type="button"
            onClick={onToggleEnabled}
            aria-label={toggleLabel}
            aria-pressed={enabled}
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
              enabled
                ? `${accentClass} text-background`
                : "bg-muted text-muted-foreground",
            )}
          >
            {enabled ? "On" : "Off"}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function RangeRow({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-16 shrink-0 text-[10px] text-muted-foreground">
        {label}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1 accent-accent-midi"
      />
      <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-foreground">
        {format ? format(value) : value}
      </span>
    </div>
  );
}

export function MidiEffectsPanel({
  trackName,
  config,
  applyMode,
  previewEnabled,
  onChange,
  onApplyModeChange,
  onPreviewChange,
  onApplyPreset,
  onApply,
  targetCount,
  applyToAllTrack = false,
  onApplyToAllTrackChange,
  disabled = false,
  className,
}: MidiEffectsPanelProps) {
  const canApply = targetCount > 0 && hasActiveMidiEffects(config) && !disabled;

  const update = <K extends keyof MidiEffectsConfig>(
    key: K,
    patch: Partial<MidiEffectsConfig[K]>,
  ) => {
    onChange({
      ...config,
      [key]: { ...config[key], ...patch },
    });
  };

  const applyLabel = useMemo(() => {
    if (targetCount === 0) return "Select notes to transform";
    if (!hasActiveMidiEffects(config)) return "Enable an effect first";
    const verb = applyMode === "duplicate" ? "Duplicate" : "Apply";
    return `${verb} on ${targetCount} note${targetCount === 1 ? "" : "s"}`;
  }, [applyMode, config, targetCount]);

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-muted/40 p-sm space-y-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-sm">
        <div className="min-w-0">
          <SectionLabel>MIDI FX</SectionLabel>
          <p className="truncate text-[10px] text-muted-foreground">{trackName}</p>
        </div>
        <button
          type="button"
          className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => onChange(defaultMidiEffects())}
        >
          Reset
        </button>
      </div>

      <div className="space-y-xs">
        <label className="text-[10px] text-muted-foreground">Track preset</label>
        <select
          aria-label="MIDI FX preset"
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
          defaultValue=""
          onChange={(e) => {
            const preset = MIDI_FX_PRESETS.find((p) => p.id === e.target.value);
            if (preset) onApplyPreset(cloneMidiEffects(preset.config));
            e.currentTarget.value = "";
          }}
        >
          <option value="" disabled>
            Load preset…
          </option>
          {MIDI_FX_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <span className="text-[10px] text-muted-foreground">Apply mode</span>
        <SegmentedControl
          aria-label="MIDI FX apply mode"
          value={applyMode}
          onChange={onApplyModeChange}
          options={[
            { value: "replace", label: "Replace" },
            { value: "duplicate", label: "Duplicate" },
          ]}
          className="w-full"
        />
      </div>

      <label className="flex items-center justify-between gap-sm rounded-md border border-border/60 bg-muted/20 px-sm py-xs text-xs">
        <span>Live preview during playback</span>
        <input
          type="checkbox"
          checked={previewEnabled}
          onChange={(e) => onPreviewChange(e.target.checked)}
          aria-label="Live preview during playback"
          className="accent-accent-midi"
        />
      </label>

      <div className="space-y-xs max-h-[min(48vh,26rem)] overflow-y-auto pr-0.5">
        <EffectBlock title="Transpose">
          <RangeRow
            label="Semitones"
            value={config.transposer.semitones}
            min={-24}
            max={24}
            format={(v) => `${v > 0 ? "+" : ""}${v}`}
            onChange={(semitones) => update("transposer", { semitones })}
          />
          <RangeRow
            label="Octaves"
            value={config.transposer.octaves}
            min={-2}
            max={2}
            format={(v) => `${v > 0 ? "+" : ""}${v}`}
            onChange={(octaves) => update("transposer", { octaves })}
          />
        </EffectBlock>

        <EffectBlock
          title="Scale quantizer"
          enabled={config.quantizer.enabled}
          onToggleEnabled={() =>
            update("quantizer", { enabled: !config.quantizer.enabled })
          }
        >
          {config.quantizer.enabled && (
            <>
              <div className="flex items-center gap-2">
                <label className="w-16 text-[10px] text-muted-foreground">
                  Root
                </label>
                <select
                  aria-label="Quantizer root"
                  value={config.quantizer.root}
                  onChange={(e) =>
                    update("quantizer", { root: e.target.value as RootNote })
                  }
                  className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  {NOTE_NAMES.map((note) => (
                    <option key={note} value={note}>
                      {note}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="w-16 text-[10px] text-muted-foreground">
                  Scale
                </label>
                <select
                  aria-label="Quantizer scale"
                  value={config.quantizer.scale}
                  onChange={(e) =>
                    update("quantizer", { scale: e.target.value as Scale })
                  }
                  className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  {SCALES.map((scale) => (
                    <option key={scale} value={scale}>
                      {scale}
                    </option>
                  ))}
                </select>
              </div>
              <RangeRow
                label="Strength"
                value={config.quantizer.strength}
                min={0}
                max={1}
                step={0.1}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(strength) => update("quantizer", { strength })}
              />
            </>
          )}
        </EffectBlock>

        <EffectBlock
          title="Chord generator"
          enabled={config.chordGenerator.enabled}
          onToggleEnabled={() =>
            update("chordGenerator", {
              enabled: !config.chordGenerator.enabled,
            })
          }
          accentClass="bg-pink-500"
        >
          {config.chordGenerator.enabled && (
            <>
              <div className="flex items-center gap-2">
                <label className="w-16 text-[10px] text-muted-foreground">
                  Type
                </label>
                <select
                  aria-label="Chord type"
                  value={config.chordGenerator.chordType}
                  onChange={(e) =>
                    update("chordGenerator", {
                      chordType: e.target.value as ChordType,
                    })
                  }
                  className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  {CHORD_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="w-16 text-[10px] text-muted-foreground">
                  Voicing
                </label>
                <select
                  aria-label="Chord voicing"
                  value={config.chordGenerator.voicing}
                  onChange={(e) =>
                    update("chordGenerator", {
                      voicing: e.target.value as (typeof VOICINGS)[number],
                    })
                  }
                  className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  {VOICINGS.map((voicing) => (
                    <option key={voicing} value={voicing}>
                      {voicing}
                    </option>
                  ))}
                </select>
              </div>
              <RangeRow
                label="Inversion"
                value={config.chordGenerator.inversion}
                min={0}
                max={3}
                onChange={(inversion) =>
                  update("chordGenerator", { inversion })
                }
              />
              <RangeRow
                label="Strum"
                value={config.chordGenerator.strumSpeed}
                min={0}
                max={0.15}
                step={0.01}
                format={(v) => `${Math.round(v * 1000)}ms`}
                onChange={(strumSpeed) =>
                  update("chordGenerator", { strumSpeed })
                }
              />
            </>
          )}
        </EffectBlock>

        <EffectBlock
          title="Note repeater"
          enabled={config.noteRepeater.enabled}
          onToggleEnabled={() =>
            update("noteRepeater", { enabled: !config.noteRepeater.enabled })
          }
          accentClass="bg-blue-500"
        >
          {config.noteRepeater.enabled && (
            <>
              <div className="flex items-center gap-2">
                <label className="w-16 text-[10px] text-muted-foreground">
                  Rate
                </label>
                <select
                  aria-label="Repeater rate"
                  value={config.noteRepeater.rate}
                  onChange={(e) =>
                    update("noteRepeater", { rate: Number(e.target.value) })
                  }
                  className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  {RATE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      1/{r}
                    </option>
                  ))}
                </select>
              </div>
              <RangeRow
                label="Repeats"
                value={config.noteRepeater.repeats}
                min={2}
                max={16}
                onChange={(repeats) => update("noteRepeater", { repeats })}
              />
              <RangeRow
                label="Vel decay"
                value={config.noteRepeater.velocityDecay}
                min={0}
                max={0.9}
                step={0.1}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(velocityDecay) =>
                  update("noteRepeater", { velocityDecay })
                }
              />
              <RangeRow
                label="Pitch"
                value={config.noteRepeater.pitchOffset}
                min={-12}
                max={12}
                format={(v) => `${v > 0 ? "+" : ""}${v}`}
                onChange={(pitchOffset) =>
                  update("noteRepeater", { pitchOffset })
                }
              />
            </>
          )}
        </EffectBlock>

        <EffectBlock
          title="Arpeggiator"
          enabled={config.arpeggiator.enabled}
          onToggleEnabled={() =>
            update("arpeggiator", { enabled: !config.arpeggiator.enabled })
          }
          accentClass="bg-yellow-500 text-black"
        >
          {config.arpeggiator.enabled && (
            <>
              <div className="flex items-center gap-2">
                <label className="w-16 text-[10px] text-muted-foreground">
                  Pattern
                </label>
                <select
                  aria-label="Arpeggiator pattern"
                  value={config.arpeggiator.pattern}
                  onChange={(e) =>
                    update("arpeggiator", {
                      pattern: e.target.value as ArpPattern,
                    })
                  }
                  className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  {ARP_PATTERNS.map((pattern) => (
                    <option key={pattern} value={pattern}>
                      {pattern}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="w-16 text-[10px] text-muted-foreground">
                  Rate
                </label>
                <select
                  aria-label="Arpeggiator rate"
                  value={config.arpeggiator.rate}
                  onChange={(e) =>
                    update("arpeggiator", { rate: Number(e.target.value) })
                  }
                  className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  {RATE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      1/{r}
                    </option>
                  ))}
                </select>
              </div>
              <RangeRow
                label="Octaves"
                value={config.arpeggiator.octaves}
                min={1}
                max={4}
                onChange={(octaves) => update("arpeggiator", { octaves })}
              />
              <RangeRow
                label="Gate"
                value={config.arpeggiator.gateLength}
                min={0.1}
                max={1}
                step={0.1}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(gateLength) =>
                  update("arpeggiator", { gateLength })
                }
              />
            </>
          )}
        </EffectBlock>
      </div>

      {onApplyToAllTrackChange ? (
        <label className="flex items-center justify-between gap-sm rounded-md border border-border/60 bg-muted/20 px-sm py-xs text-xs">
          <span>Apply to all notes on track</span>
          <input
            type="checkbox"
            checked={applyToAllTrack}
            onChange={(e) => onApplyToAllTrackChange(e.target.checked)}
            aria-label="Apply MIDI FX to all notes on track"
            className="accent-accent-midi"
          />
        </label>
      ) : null}

      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="w-full gap-1.5"
        disabled={!canApply}
        onClick={onApply}
      >
        <Wand2 className="h-3.5 w-3.5" aria-hidden />
        {applyLabel}
      </Button>
    </div>
  );
}
