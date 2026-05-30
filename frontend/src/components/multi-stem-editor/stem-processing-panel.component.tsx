/**
 * StemProcessingPanel — shared pitch/EQ/amplitude/time/FX controls for the active stem.
 * Used by MultiStemEditor and DjModeEditor waveform workspaces.
 */
import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ChevronDown,
  Copy,
  Sliders,
  Sparkles,
  Timer,
  Waves,
  X,
} from "lucide-react";

import type { StemDefinition } from "../../types";
import { cn } from "../../utils/cn";
import {
  PITCH_MIN,
  PITCH_MAX,
  PITCH_STEP,
  TIME_STRETCH_MIN,
  TIME_STRETCH_MAX,
  TIME_STRETCH_STEP,
  timeStretchToDisplayPercent,
} from "../../constants/mixerRanges";
import { defaultStemState, type StemEditorState } from "../../stem-editor-state";
import {
  applyMixerToAllStems,
  type CopySettingsScope,
} from "../../utils/copyStemSettings";
import { isStemModified } from "../../utils/isStemModified";

export type StemProcessingPanelId = "pitch" | "eq" | "amplitude" | "time" | "fx";

export interface StemProcessingToolbarProps {
  activePanel: StemProcessingPanelId | null;
  playbackReady: boolean;
  onPanelChange: (panel: StemProcessingPanelId | null) => void;
  className?: string;
}

export function StemProcessingToolbar({
  activePanel,
  playbackReady,
  onPanelChange,
  className,
}: StemProcessingToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2xs rounded-xl border border-border bg-muted p-0.5",
        className,
      )}
      role="toolbar"
      aria-label="Stem processing tools"
    >
      {(
        [
          { id: "pitch" as const, icon: Waves, label: "Pitch" },
          { id: "eq" as const, icon: Sliders, label: "EQ" },
          { id: "amplitude" as const, icon: Activity, label: "Amplitude" },
          { id: "time" as const, icon: Timer, label: "Time" },
          { id: "fx" as const, icon: Sparkles, label: "FX" },
        ] as const
      ).map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onPanelChange(activePanel === id ? null : id)}
          disabled={!playbackReady}
          aria-pressed={activePanel === id}
          className={cn(
            "flex items-center gap-xs rounded-lg px-sm py-1.5 text-xs font-medium transition",
            activePanel === id
              ? "bg-primary-500/20 text-primary-200"
              : "text-muted-foreground hover:text-foreground",
            !playbackReady && "cursor-not-allowed opacity-40",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

export interface StemProcessingPanelProps {
  activePanel: StemProcessingPanelId;
  stems: StemDefinition[];
  activeStem: StemDefinition;
  activeState: StemEditorState;
  activeStemId: string;
  stemStates: Record<string, StemEditorState>;
  onStemStateChange: (stemId: string, next: Partial<StemEditorState>) => void;
  onActiveStemChange: (stemId: string) => void;
  onClose: () => void;
  className?: string;
}

export function StemProcessingPanel({
  activePanel,
  stems,
  activeStem,
  activeState,
  activeStemId,
  stemStates,
  onStemStateChange,
  onActiveStemChange,
  onClose,
  className,
}: StemProcessingPanelProps) {
  const [channelsSummaryOpen, setChannelsSummaryOpen] = useState(true);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);

  const handleCopySettings = useCallback(
    (scope: CopySettingsScope) => {
      setCopyMenuOpen(false);
      const sourceId = activeStemId;
      if (!sourceId) return;
      const ids = stems.map((s) => s.id);
      const modifiedCount = ids.filter(
        (id) =>
          id !== sourceId &&
          isStemModified(stemStates[id] ?? defaultStemState()),
      ).length;
      if (
        modifiedCount > 0 &&
        !window.confirm(`Overwrite ${modifiedCount} modified channel(s)?`)
      ) {
        return;
      }
      const next = applyMixerToAllStems(sourceId, stemStates, ids, { scope });
      for (const id of ids) {
        if (id === sourceId && scope !== "all") continue;
        const patch = next[id];
        if (patch) onStemStateChange(id, patch);
      }
    },
    [activeStemId, stems, stemStates, onStemStateChange],
  );

  return (
    <div
      className={cn(
        "flex max-h-[320px] flex-col overflow-y-auto rounded-xl border border-border bg-chrome backdrop-blur-md shadow-[-8px_0_24px_rgba(0,0,0,0.5)]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-md py-sm bg-secondary">
        <h3 className="text-sm font-bold uppercase tracking-wider text-primary-300">
          {activePanel === "pitch" && "Pitch Shift"}
          {activePanel === "eq" && "EQ & Filters"}
          {activePanel === "amplitude" && "Amplitude"}
          {activePanel === "time" && "Time Stretch"}
          {activePanel === "fx" && "Effects"}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="tap-target-expand rounded-md text-muted-foreground transition-[color,transform] duration-[var(--motion-fast)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-border">
        <button
          type="button"
          onClick={() => setChannelsSummaryOpen((o) => !o)}
          className="tap-feedback flex min-h-[44px] w-full items-center justify-between px-md py-xs text-meta font-semibold uppercase tracking-wider text-muted-foreground transition-[color,background-color] duration-[var(--motion-fast)] hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={channelsSummaryOpen}
        >
          All channels
          <ChevronDown className={cn("h-3.5 w-3.5", channelsSummaryOpen && "rotate-180")} />
        </button>
        {channelsSummaryOpen && (
          <ul className="max-h-28 space-y-0.5 overflow-y-auto px-xs pb-2">
            {stems.map((s) => {
              const st = stemStates[s.id] ?? defaultStemState();
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onActiveStemChange(s.id)}
                    className={cn(
                      "tap-feedback flex min-h-[44px] w-full gap-xs rounded-lg px-xs py-xs text-left text-helper transition-[background-color,transform] duration-[var(--motion-fast)] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]",
                      s.id === activeStemId && "bg-primary-500/10",
                    )}
                  >
                    <span className="truncate flex-1">{s.label}</span>
                    <span className="font-mono text-helper text-muted-foreground">
                      {st.mixer.gain.toFixed(0)}dB
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <motion.div layout className="flex flex-col gap-lg p-md">
        {activePanel === "pitch" && (
          <div className="space-y-md">
            <input
              type="range"
              min={PITCH_MIN}
              max={PITCH_MAX}
              step={PITCH_STEP}
              value={activeState.pitchSemitones}
              onChange={(e) =>
                onStemStateChange(activeStem.id, {
                  pitchSemitones: Number(e.target.value),
                })
              }
              onDoubleClick={() =>
                onStemStateChange(activeStem.id, { pitchSemitones: 0 })
              }
              className="stem-accent-slider w-full"
              aria-label={`${activeStem.label} pitch shift`}
            />
            <p className="text-center text-xs text-muted-foreground">
              {activeState.pitchSemitones > 0 ? "+" : ""}
              {activeState.pitchSemitones.toFixed(1)} st
            </p>
            <p className="text-center text-helper text-muted-foreground">
              Double-click to reset
            </p>
          </div>
        )}
        {activePanel === "eq" && (
          <div className="space-y-sm">
            {([
              { key: "eqLow" as const, label: "Low", freq: "200 Hz" },
              { key: "eqLowMid" as const, label: "Low-Mid", freq: "400 Hz" },
              { key: "eqMid" as const, label: "Mid", freq: "1 kHz" },
              { key: "eqHigh" as const, label: "High", freq: "6 kHz" },
            ]).map(({ key, label, freq }) => (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-meta font-medium uppercase tracking-wider text-muted-foreground">
                    {label} <span className="text-muted-foreground">{freq}</span>
                  </span>
                  <span className="font-mono text-meta tabular-nums text-muted-foreground">
                    {activeState.mixer[key] > 0 ? "+" : ""}
                    {activeState.mixer[key].toFixed(1)} dB
                  </span>
                </div>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={activeState.mixer[key]}
                  onChange={(e) =>
                    onStemStateChange(activeStem.id, {
                      mixer: {
                        ...activeState.mixer,
                        [key]: Number(e.target.value),
                      },
                    })
                  }
                  onDoubleClick={() =>
                    onStemStateChange(activeStem.id, {
                      mixer: { ...activeState.mixer, [key]: 0 },
                    })
                  }
                  className="stem-accent-slider w-full"
                  aria-label={`${activeStem.label} ${label} EQ (${freq})`}
                />
              </div>
            ))}
            <p className="text-center text-helper text-muted-foreground pt-1">
              Double-click to reset
            </p>
          </div>
        )}
        {activePanel === "amplitude" && (
          <div className="space-y-md">
            <input
              type="range"
              min={-20}
              max={6}
              step={0.5}
              value={activeState.mixer.gain}
              onChange={(e) =>
                onStemStateChange(activeStem.id, {
                  mixer: { ...activeState.mixer, gain: Number(e.target.value) },
                })
              }
              onDoubleClick={() =>
                onStemStateChange(activeStem.id, {
                  mixer: { ...activeState.mixer, gain: 0 },
                })
              }
              className="stem-accent-slider w-full"
              aria-label={`${activeStem.label} volume`}
            />
            <p className="text-center text-xs text-muted-foreground">
              {activeState.mixer.gain > 0 ? "+" : ""}
              {activeState.mixer.gain.toFixed(1)} dB
            </p>
            <p className="text-center text-helper text-muted-foreground">
              Double-click to reset
            </p>
          </div>
        )}
        {activePanel === "time" && (
          <div className="space-y-md">
            <input
              type="range"
              min={TIME_STRETCH_MIN}
              max={TIME_STRETCH_MAX}
              step={TIME_STRETCH_STEP}
              value={activeState.timeStretch}
              onChange={(e) =>
                onStemStateChange(activeStem.id, {
                  timeStretch: Number(e.target.value),
                })
              }
              onDoubleClick={() =>
                onStemStateChange(activeStem.id, { timeStretch: 1.0 })
              }
              className="stem-accent-slider w-full"
              aria-label={`${activeStem.label} tempo`}
            />
            <p className="text-center text-xs text-muted-foreground">
              {timeStretchToDisplayPercent(activeState.timeStretch) >= 0 ? "+" : ""}
              {timeStretchToDisplayPercent(activeState.timeStretch)}%
            </p>
            <p className="text-center text-helper text-muted-foreground">
              Double-click to reset
            </p>
          </div>
        )}
        {activePanel === "fx" && (
          <div className="space-y-md">
            <FxSlider
              label="Warmth"
              value={activeState.mixer.warmth}
              min={0}
              max={100}
              unit="%"
              stemLabel={activeStem.label}
              onChange={(warmth) =>
                onStemStateChange(activeStem.id, {
                  mixer: { ...activeState.mixer, warmth },
                })
              }
              onReset={() =>
                onStemStateChange(activeStem.id, {
                  mixer: { ...activeState.mixer, warmth: 0 },
                })
              }
            />
            <FxSlider
              label="Presence"
              value={activeState.mixer.presence}
              min={-12}
              max={12}
              step={0.5}
              unit=" dB"
              stemLabel={activeStem.label}
              onChange={(presence) =>
                onStemStateChange(activeStem.id, {
                  mixer: { ...activeState.mixer, presence },
                })
              }
              onReset={() =>
                onStemStateChange(activeStem.id, {
                  mixer: { ...activeState.mixer, presence: 0 },
                })
              }
            />
            <FxSlider
              label="Reverb"
              value={activeState.mixer.reverbWet}
              min={0}
              max={100}
              unit="%"
              stemLabel={activeStem.label}
              onChange={(reverbWet) =>
                onStemStateChange(activeStem.id, {
                  mixer: { ...activeState.mixer, reverbWet },
                })
              }
              onReset={() =>
                onStemStateChange(activeStem.id, {
                  mixer: { ...activeState.mixer, reverbWet: 0 },
                })
              }
            />
            <FxSlider
              label="Delay"
              value={activeState.mixer.delayWet}
              min={0}
              max={100}
              unit="%"
              stemLabel={activeStem.label}
              onChange={(delayWet) =>
                onStemStateChange(activeStem.id, {
                  mixer: { ...activeState.mixer, delayWet },
                })
              }
              onReset={() =>
                onStemStateChange(activeStem.id, {
                  mixer: { ...activeState.mixer, delayWet: 0 },
                })
              }
            />
            <FxSlider
              label="Comp Threshold"
              value={activeState.mixer.compThreshold}
              min={-60}
              max={0}
              unit=" dB"
              stemLabel={activeStem.label}
              onChange={(compThreshold) =>
                onStemStateChange(activeStem.id, {
                  mixer: { ...activeState.mixer, compThreshold },
                })
              }
              onReset={() =>
                onStemStateChange(activeStem.id, {
                  mixer: { ...activeState.mixer, compThreshold: 0 },
                })
              }
            />
            <FxSlider
              label="Comp Ratio"
              value={activeState.mixer.compRatio}
              min={1}
              max={20}
              step={0.5}
              unit=":1"
              format={(v) => v.toFixed(1)}
              stemLabel={activeStem.label}
              onChange={(compRatio) =>
                onStemStateChange(activeStem.id, {
                  mixer: { ...activeState.mixer, compRatio },
                })
              }
              onReset={() =>
                onStemStateChange(activeStem.id, {
                  mixer: { ...activeState.mixer, compRatio: 1 },
                })
              }
            />
            <FxSlider
              label="Comp Attack"
              value={activeState.mixer.compAttackMs}
              min={1}
              max={200}
              unit=" ms"
              stemLabel={activeStem.label}
              onChange={(compAttackMs) =>
                onStemStateChange(activeStem.id, {
                  mixer: { ...activeState.mixer, compAttackMs },
                })
              }
              onReset={() =>
                onStemStateChange(activeStem.id, {
                  mixer: { ...activeState.mixer, compAttackMs: 10 },
                })
              }
            />
            <FxSlider
              label="Comp Release"
              value={activeState.mixer.compReleaseMs}
              min={10}
              max={1000}
              step={10}
              unit=" ms"
              stemLabel={activeStem.label}
              onChange={(compReleaseMs) =>
                onStemStateChange(activeStem.id, {
                  mixer: { ...activeState.mixer, compReleaseMs },
                })
              }
              onReset={() =>
                onStemStateChange(activeStem.id, {
                  mixer: { ...activeState.mixer, compReleaseMs: 100 },
                })
              }
            />
            <p className="text-center text-helper text-muted-foreground pt-1">
              Double-click to reset
            </p>
          </div>
        )}
      </motion.div>

      <div className="relative border-t border-border p-sm">
        <button
          type="button"
          onClick={() => setCopyMenuOpen((o) => !o)}
          className="flex min-h-[40px] w-full items-center justify-center gap-xs rounded-lg border border-border bg-muted px-sm py-xs text-xs font-medium text-secondary-foreground hover:border-primary-400/30 hover:text-primary-100 transition"
          aria-expanded={copyMenuOpen}
          aria-haspopup="menu"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy settings
          <ChevronDown className={cn("h-3.5 w-3.5", copyMenuOpen && "rotate-180")} />
        </button>
        {copyMenuOpen && (
          <div
            role="menu"
            className="absolute bottom-full left-3 right-3 mb-1 rounded-lg border border-border bg-chrome py-1 shadow-elevation-md"
          >
            {(
              [
                ["all", "Apply to all"],
                ["eq", "Copy EQ"],
                ["fx", "Copy FX"],
                ["pitchTime", "Copy pitch/time"],
              ] as const
            ).map(([scope, label]) => (
              <button
                key={scope}
                type="button"
                role="menuitem"
                onClick={() => handleCopySettings(scope)}
                className="block w-full px-sm py-xs text-left text-xs text-secondary-foreground hover:bg-muted hover:text-foreground"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface FxSliderProps {
  label: string;
  value: number;
  min?: number;
  max: number;
  step?: number;
  unit?: string;
  stemLabel: string;
  format?: (value: number) => string;
  onChange: (value: number) => void;
  onReset: () => void;
}

function FxSlider({
  label,
  value,
  min = 0,
  max,
  step = 1,
  unit = "",
  stemLabel,
  format,
  onChange,
  onReset,
}: FxSliderProps) {
  const display = format ? format(value) : String(value);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-meta font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-meta tabular-nums text-muted-foreground">
          {display}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={onReset}
        className="stem-accent-slider w-full"
        aria-label={`${stemLabel} ${label.toLowerCase()}`}
      />
    </div>
  );
}
