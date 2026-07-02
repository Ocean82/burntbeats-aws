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
        <h2 className="text-sm font-semibold text-foreground">
          {TOOL_LABELS[activeTool]}
        </h2>
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
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Select a stem to adjust parameters
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
}

function SliderControl({ label, min, max, step, value, onChange, unit = "" }: SliderControlProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-secondary-foreground">
        {label}: <span className="text-foreground">{value}{unit}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-purple-500"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
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
    <div data-testid="pitch-controls" className="flex flex-col gap-5">
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
  );
}

interface EQControlsProps {
  stemState: StemEditorState;
  onUpdate: (field: string, value: number) => void;
}

function EQControls({ stemState, onUpdate }: EQControlsProps) {
  return (
    <div data-testid="eq-controls" className="flex flex-col gap-5">
      <SliderControl
        label="Low Gain"
        min={-12}
        max={12}
        step={0.1}
        value={stemState.mixer.eqLow}
        onChange={(v) => onUpdate("eqLow", v)}
        unit=" dB"
      />
      <SliderControl
        label="Mid Gain"
        min={-12}
        max={12}
        step={0.1}
        value={stemState.mixer.eqMid}
        onChange={(v) => onUpdate("eqMid", v)}
        unit=" dB"
      />
      <SliderControl
        label="High Gain"
        min={-12}
        max={12}
        step={0.1}
        value={stemState.mixer.eqHigh}
        onChange={(v) => onUpdate("eqHigh", v)}
        unit=" dB"
      />
    </div>
  );
}

interface TimeStretchControlsProps {
  stemState: StemEditorState;
  onUpdate: (field: keyof StemEditorState, value: number | boolean) => void;
}

function TimeStretchControls({ stemState, onUpdate }: TimeStretchControlsProps) {
  return (
    <div data-testid="time-stretch-controls" className="flex flex-col gap-5">
      <SliderControl
        label="Speed"
        min={0.5}
        max={2.0}
        step={0.01}
        value={stemState.timeStretch}
        onChange={(v) => onUpdate("timeStretch", v)}
        unit="x"
      />
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
    <div data-testid="amplitude-controls" className="flex flex-col gap-5">
      <SliderControl
        label="Gain"
        min={-12}
        max={12}
        step={0.1}
        value={stemState.mixer.gain}
        onChange={(v) => onUpdateMixer("gain", v)}
        unit=" dB"
      />
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
  );
}

interface FXControlsProps {
  stemState: StemEditorState;
  onUpdate: (field: string, value: number) => void;
}

function FXControls({ stemState, onUpdate }: FXControlsProps) {
  return (
    <div data-testid="fx-controls" className="flex flex-col gap-5">
      <SliderControl
        label="Reverb Mix"
        min={0}
        max={100}
        step={1}
        value={stemState.mixer.reverbWet}
        onChange={(v) => onUpdate("reverbWet", v)}
      />
      <SliderControl
        label="Delay Mix"
        min={0}
        max={100}
        step={1}
        value={stemState.mixer.delayWet}
        onChange={(v) => onUpdate("delayWet", v)}
      />
    </div>
  );
}
