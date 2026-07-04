import { useCallback, useMemo } from "react";
import { motion, useReducedMotion as useFramerReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/utils/cn";
import { LAYOUT } from "@/constants/layout";
import { useWorkflow } from "@/contexts/WorkflowContext";
import { defaultStemState } from "@/stem-editor-state";
import type { StemEditorState } from "@/stem-editor-state";
import type { ToolCategory } from "@/types/tools";
import { AudioIntelligencePanel } from "@/components/mix-phase/AudioIntelligencePanel";

export interface EffectsPanelProps {
  activeTool: ToolCategory;
  onClose: () => void;
  /** When true, panel content is visible but no slide animation occurs (for tablet overlay or direct render). */
  isOverlay?: boolean;
  /** The stem ID whose DSP params the controls bind to. */
  activeStemId?: string;
}

/** Human-readable label for each tool category. */
const TOOL_LABELS: Record<ToolCategory, string> = {
  pitch: "Pitch Shift",
  eq: "Equalizer",
  timeStretch: "Time Stretch",
  amplitude: "Amplitude",
  fx: "Effects",
  intelligence: "Audio Intelligence",
};

/**
 * EffectsPanel — 320px slide-out drawer from the right side.
 *
 * - Slides in horizontally within 250ms; respects reduced motion.
 * - Renders tool-specific controls based on `activeTool`.
 * - Close button deactivates the tool via `onClose`.
 * - Controls remain visible during slide-out animation.
 * - At tablet (768-1023px) width, rendered as overlay by parent Workspace.
 * - Controls are wired to the active stem's DSP parameters via WorkflowContext.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
 */
export function EffectsPanel({ activeTool, onClose, isOverlay = false, activeStemId }: EffectsPanelProps) {
  const prefersReducedMotion = useFramerReducedMotion();
  const { stemStates, setStemStates } = useWorkflow();

  const stemState = useMemo(
    () => (activeStemId ? stemStates[activeStemId] ?? null : null),
    [activeStemId, stemStates],
  );

  const updateStemField = useCallback(
    (field: keyof StemEditorState, value: number | boolean) => {
      if (!activeStemId) return;
      setStemStates((prev) => ({
        ...prev,
        [activeStemId]: {
          ...(prev[activeStemId] ?? defaultStemState()),
          [field]: value,
        },
      }));
    },
    [activeStemId, setStemStates],
  );

  /** Update a nested mixer field (eqLow, eqMid, etc.) */
  const updateMixerField = useCallback(
    (field: string, value: number) => {
      if (!activeStemId) return;
      setStemStates((prev) => {
        const current = prev[activeStemId] ?? defaultStemState();
        return {
          ...prev,
          [activeStemId]: {
            ...current,
            mixer: {
              ...current.mixer,
              [field]: value,
            },
          },
        };
      });
    },
    [activeStemId, setStemStates],
  );

  const slideVariants = {
    hidden: { x: LAYOUT.EFFECTS_PANEL_WIDTH },
    visible: { x: 0 },
  };

  const transition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: LAYOUT.EFFECTS_SLIDE_DURATION / 1000, ease: "easeOut" as const };

  const panelContent = (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            {TOOL_LABELS[activeTool]}
          </h2>
          {activeStemId && stemState && (
            <span className="text-[10px] font-medium text-muted-foreground px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
              {activeStemId.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close effects panel"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>

      {/* Tool-specific controls */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTool === "intelligence" ? (
          <AudioIntelligencePanel onClose={onClose} />
        ) : stemState ? (
          <ToolControls
            activeTool={activeTool}
            stemState={stemState}
            onUpdateStemField={updateStemField}
            onUpdateMixerField={updateMixerField}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
            <div className="h-10 w-10 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
              <svg className="h-5 w-5 text-muted-foreground/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 19V6l12-3v13M9 19c0 1.1-1.3 2-3 2s-3-.9-3-2 1.3-2 3-2 3 .9 3 2zM21 16c0 1.1-1.3 2-3 2s-3-.9-3-2 1.3-2 3-2 3 .9 3 2z" />
              </svg>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Select a stem in the waveform view to adjust its parameters here
            </p>
          </div>
        )}
      </div>
    </div>
  );

  // In overlay mode, render content directly without slide animation
  if (isOverlay) {
    return (
      <div
        data-testid="effects-panel"
        className={cn(
          "h-full bg-[hsl(220,15%,12%)]/80 backdrop-blur-md text-white",
        )}
        style={{
          width: `${LAYOUT.EFFECTS_PANEL_WIDTH}px`,
          borderRadius: `${LAYOUT.PANEL_BORDER_RADIUS}px 0 0 ${LAYOUT.PANEL_BORDER_RADIUS}px`,
        }}
      >
        {panelContent}
      </div>
    );
  }

  return (
    <motion.div
      data-testid="effects-panel"
      initial="hidden"
      animate="visible"
      exit="hidden"
      variants={slideVariants}
      transition={transition}
      className={cn(
        "h-full bg-[hsl(220,15%,12%)]/80 backdrop-blur-md text-white",
      )}
      style={{
        width: `${LAYOUT.EFFECTS_PANEL_WIDTH}px`,
        borderRadius: `${LAYOUT.PANEL_BORDER_RADIUS}px 0 0 ${LAYOUT.PANEL_BORDER_RADIUS}px`,
      }}
    >
      {panelContent}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Tool-specific controls
// ---------------------------------------------------------------------------

interface ToolControlsProps {
  activeTool: ToolCategory;
  stemState: StemEditorState;
  onUpdateStemField: (field: keyof StemEditorState, value: number | boolean) => void;
  onUpdateMixerField: (field: string, value: number) => void;
}

function ToolControls({ activeTool, stemState, onUpdateStemField, onUpdateMixerField }: ToolControlsProps) {
  switch (activeTool) {
    case "pitch":
      return <PitchControls stemState={stemState} onUpdate={onUpdateStemField} />;
    case "eq":
      return <EQControls stemState={stemState} onUpdate={onUpdateMixerField} />;
    case "timeStretch":
      return <TimeStretchControls stemState={stemState} onUpdate={onUpdateStemField} />;
    case "amplitude":
      return <AmplitudeControls stemState={stemState} onUpdate={onUpdateStemField} onUpdateMixer={onUpdateMixerField} />;
    case "fx":
      return <FXControls stemState={stemState} onUpdate={onUpdateMixerField} />;
  }
}

// ---------------------------------------------------------------------------
// Slider helper (controlled)
// ---------------------------------------------------------------------------

interface SliderControlProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  /** Value to reset to on double-click. Defaults to 0 if range includes 0, otherwise min. */
  resetValue?: number;
}

function SliderControl({ label, min, max, step, value, onChange, unit = "", resetValue }: SliderControlProps) {
  const defaultReset = resetValue ?? (min <= 0 && max >= 0 ? 0 : min);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-secondary-foreground">
        {label}: <span className="font-mono tabular-nums text-foreground">{value}{unit}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(defaultReset)}
        aria-label={label}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/[0.08] accent-primary-400"
      />
      <div className="flex justify-between text-[9px] font-mono text-muted-foreground tabular-nums">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Per-tool control panels (controlled, wired to stem DSP params)
// ---------------------------------------------------------------------------

interface PitchControlsProps {
  stemState: StemEditorState;
  onUpdate: (field: keyof StemEditorState, value: number | boolean) => void;
}

function PitchControls({ stemState, onUpdate }: PitchControlsProps) {
  return (
    <div data-testid="pitch-controls" className="flex flex-col gap-4">
      {/* Quick Pitch Presets */}
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
          Quick Shift
        </h3>
        <div className="grid grid-cols-4 gap-1.5">
          {[-5, -3, -1, 0, 1, 3, 5, 7].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => onUpdate("pitchSemitones", st)}
              className={cn(
                "rounded-md border px-2 py-1.5 text-[11px] font-mono font-bold transition active:scale-[0.95]",
                stemState.pitchSemitones === st
                  ? "border-primary-400/60 bg-primary-500/20 text-primary-100"
                  : "border-white/10 bg-white/5 text-secondary-foreground hover:border-primary-400/30 hover:text-foreground",
              )}
            >
              {st > 0 ? "+" : ""}{st}
            </button>
          ))}
        </div>
      </div>

      {/* Fine Control */}
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
          Fine Control
        </h3>
        <SliderControl
          label="Semitones"
          min={-12}
          max={12}
          step={1}
          value={stemState.pitchSemitones}
          onChange={(v) => onUpdate("pitchSemitones", v)}
          unit=" st"
        />
      </div>

      {/* Current Value Display */}
      <div className="flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] py-3">
        <span className="text-2xl font-mono font-bold tabular-nums text-foreground">
          {stemState.pitchSemitones > 0 ? "+" : ""}{stemState.pitchSemitones}
        </span>
        <span className="ml-1.5 text-sm text-muted-foreground">semitones</span>
      </div>
    </div>
  );
}

interface EQControlsProps {
  stemState: StemEditorState;
  onUpdate: (field: string, value: number) => void;
}

function EQControls({ stemState, onUpdate }: EQControlsProps) {
  const applyPreset = (preset: Record<string, number>) => {
    Object.entries(preset).forEach(([field, value]) => onUpdate(field, value));
  };

  return (
    <div data-testid="eq-controls" className="flex flex-col gap-4">
      {/* 3-Band EQ */}
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
          3-Band EQ
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {([
            { field: "eqLow", label: "Low", value: stemState.mixer.eqLow },
            { field: "eqMid", label: "Mid", value: stemState.mixer.eqMid },
            { field: "eqHigh", label: "High", value: stemState.mixer.eqHigh },
          ] as const).map(({ field, label, value }) => (
            <div key={field} className="flex flex-col items-center gap-2">
              <div className="relative w-10 h-20 flex items-end justify-center">
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={value}
                  onChange={(e) => onUpdate(field, Number(e.target.value))}
                  onDoubleClick={() => onUpdate(field, 0)}
                  aria-label={`${label} EQ`}
                  className="h-16 w-2 cursor-pointer appearance-none rounded-full bg-white/10 accent-primary-400 [writing-mode:vertical-lr] rotate-180"
                />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
              <span className="text-[10px] font-mono text-foreground tabular-nums">
                {value > 0 ? "+" : ""}{value.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Filters */}
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
          Quick Filters
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {([
            { label: "Muffle (Low-pass)", preset: { eqLow: 3, eqMid: -4, eqHigh: -10 } },
            { label: "Thin (High-pass)", preset: { eqLow: -10, eqMid: -2, eqHigh: 3 } },
            { label: "Radio (Band-pass)", preset: { eqLow: -8, eqMid: 4, eqHigh: -6 } },
            { label: "Bass Boost", preset: { eqLow: 8, eqMid: 0, eqHigh: -2 } },
            { label: "Vocal Presence", preset: { eqLow: -3, eqMid: 5, eqHigh: 2 } },
            { label: "Flat", preset: { eqLow: 0, eqMid: 0, eqHigh: 0 } },
          ]).map(({ label, preset }) => (
            <button
              key={label}
              type="button"
              onClick={() => applyPreset(preset)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-medium text-secondary-foreground transition hover:border-primary-400/40 hover:bg-primary-500/10 hover:text-foreground active:scale-[0.97]"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Full sliders for fine control */}
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
          Fine Control
        </h3>
        <div className="flex flex-col gap-2.5">
          <SliderControl
            label="Low"
            min={-12}
            max={12}
            step={0.1}
            value={stemState.mixer.eqLow}
            onChange={(v) => onUpdate("eqLow", v)}
            unit=" dB"
          />
          <SliderControl
            label="Mid"
            min={-12}
            max={12}
            step={0.1}
            value={stemState.mixer.eqMid}
            onChange={(v) => onUpdate("eqMid", v)}
            unit=" dB"
          />
          <SliderControl
            label="High"
            min={-12}
            max={12}
            step={0.1}
            value={stemState.mixer.eqHigh}
            onChange={(v) => onUpdate("eqHigh", v)}
            unit=" dB"
          />
        </div>
      </div>
    </div>
  );
}

interface TimeStretchControlsProps {
  stemState: StemEditorState;
  onUpdate: (field: keyof StemEditorState, value: number | boolean) => void;
}

function TimeStretchControls({ stemState, onUpdate }: TimeStretchControlsProps) {
  const displayPercent = Math.round(stemState.timeStretch * 100);

  return (
    <div data-testid="time-stretch-controls" className="flex flex-col gap-4">
      {/* Speed Presets */}
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
          Speed Presets
        </h3>
        <div className="grid grid-cols-4 gap-1.5">
          {([
            { label: "50%", value: 0.5 },
            { label: "75%", value: 0.75 },
            { label: "100%", value: 1.0 },
            { label: "125%", value: 1.25 },
            { label: "150%", value: 1.5 },
            { label: "175%", value: 1.75 },
            { label: "200%", value: 2.0 },
            { label: "Half", value: 0.5 },
          ]).slice(0, 7).map(({ label, value }) => (
            <button
              key={label}
              type="button"
              onClick={() => onUpdate("timeStretch", value)}
              className={cn(
                "rounded-md border px-2 py-1.5 text-[11px] font-medium transition active:scale-[0.95]",
                Math.abs(stemState.timeStretch - value) < 0.01
                  ? "border-primary-400/60 bg-primary-500/20 text-primary-100"
                  : "border-white/10 bg-white/5 text-secondary-foreground hover:border-primary-400/30 hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Fine Control */}
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
          Fine Control
        </h3>
        <SliderControl
          label="Speed"
          min={0.5}
          max={2.0}
          step={0.01}
          value={stemState.timeStretch}
          onChange={(v) => onUpdate("timeStretch", v)}
          unit="x"
          resetValue={1.0}
        />
      </div>

      {/* Current Value Display */}
      <div className="flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] py-3">
        <span className="text-2xl font-mono font-bold tabular-nums text-foreground">
          {displayPercent}%
        </span>
        <span className="ml-1.5 text-sm text-muted-foreground">speed</span>
      </div>
    </div>
  );
}

interface AmplitudeControlsProps {
  stemState: StemEditorState;
  onUpdate: (field: keyof StemEditorState, value: number | boolean) => void;
  onUpdateMixer: (field: string, value: number) => void;
}

function AmplitudeControls({ stemState, onUpdate, onUpdateMixer }: AmplitudeControlsProps) {
  return (
    <div data-testid="amplitude-controls" className="flex flex-col gap-4">
      {/* Volume */}
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
          Volume
        </h3>
        <SliderControl
          label="Gain"
          min={-20}
          max={6}
          step={0.1}
          value={stemState.mixer.gain}
          onChange={(v) => onUpdateMixer("gain", v)}
          unit=" dB"
        />
      </div>

      {/* Fades */}
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
          Fades
        </h3>
        <div className="flex flex-col gap-2.5">
          <SliderControl
            label="Fade In"
            min={0}
            max={10}
            step={0.1}
            value={stemState.fadeIn}
            onChange={(v) => onUpdate("fadeIn", v)}
            unit="s"
          />
          <SliderControl
            label="Fade Out"
            min={0}
            max={10}
            step={0.1}
            value={stemState.fadeOut}
            onChange={(v) => onUpdate("fadeOut", v)}
            unit="s"
          />
        </div>
      </div>

      {/* Compressor */}
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
          Compressor
        </h3>
        <div className="flex flex-col gap-2.5">
          <SliderControl
            label="Threshold"
            min={-60}
            max={0}
            step={1}
            value={stemState.mixer.compThreshold ?? -24}
            onChange={(v) => onUpdateMixer("compThreshold", v)}
            unit=" dB"
          />
          <SliderControl
            label="Ratio"
            min={1}
            max={20}
            step={0.5}
            value={stemState.mixer.compRatio ?? 1}
            onChange={(v) => onUpdateMixer("compRatio", v)}
            unit=":1"
            resetValue={1}
          />
          <SliderControl
            label="Attack"
            min={1}
            max={200}
            step={1}
            value={stemState.mixer.compAttackMs ?? 10}
            onChange={(v) => onUpdateMixer("compAttackMs", v)}
            unit=" ms"
            resetValue={10}
          />
          <SliderControl
            label="Release"
            min={10}
            max={1000}
            step={10}
            value={stemState.mixer.compReleaseMs ?? 100}
            onChange={(v) => onUpdateMixer("compReleaseMs", v)}
            unit=" ms"
            resetValue={100}
          />
        </div>
      </div>

      {/* Pan */}
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
          Pan
        </h3>
        <SliderControl
          label="Pan"
          min={-100}
          max={100}
          step={1}
          value={stemState.mixer.pan}
          onChange={(v) => onUpdateMixer("pan", v)}
        />
      </div>
    </div>
  );
}

interface FXControlsProps {
  stemState: StemEditorState;
  onUpdate: (field: string, value: number) => void;
}

function FXControls({ stemState, onUpdate }: FXControlsProps) {
  const applyPreset = (preset: Record<string, number>) => {
    Object.entries(preset).forEach(([field, value]) => onUpdate(field, value));
  };

  return (
    <div data-testid="fx-controls" className="flex flex-col gap-4">
      {/* FX Presets */}
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
          Quick Presets
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {([
            { label: "Hall Verb", preset: { reverbWet: 45, delayWet: 0 } },
            { label: "Slapback", preset: { reverbWet: 10, delayWet: 35 } },
            { label: "Ambient", preset: { reverbWet: 60, delayWet: 20 } },
            { label: "Dry", preset: { reverbWet: 0, delayWet: 0 } },
          ]).map(({ label, preset }) => (
            <button
              key={label}
              type="button"
              onClick={() => applyPreset(preset)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-medium text-secondary-foreground transition hover:border-primary-400/40 hover:bg-primary-500/10 hover:text-foreground active:scale-[0.97]"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Reverb & Delay */}
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
          Reverb & Delay
        </h3>
        <div className="flex flex-col gap-2.5">
          <SliderControl
            label="Reverb Mix"
            min={0}
            max={100}
            step={1}
            value={stemState.mixer.reverbWet}
            onChange={(v) => onUpdate("reverbWet", v)}
            unit="%"
          />
          <SliderControl
            label="Delay Mix"
            min={0}
            max={100}
            step={1}
            value={stemState.mixer.delayWet}
            onChange={(v) => onUpdate("delayWet", v)}
            unit="%"
          />
        </div>
      </div>

      {/* Character */}
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
          Character
        </h3>
        <div className="flex flex-col gap-2.5">
          <SliderControl
            label="Warmth"
            min={0}
            max={100}
            step={1}
            value={stemState.mixer.warmth ?? 0}
            onChange={(v) => onUpdate("warmth", v)}
            unit="%"
          />
          <SliderControl
            label="Presence"
            min={-12}
            max={12}
            step={0.5}
            value={stemState.mixer.presence ?? 0}
            onChange={(v) => onUpdate("presence", v)}
            unit=" dB"
          />
        </div>
      </div>
    </div>
  );
}
