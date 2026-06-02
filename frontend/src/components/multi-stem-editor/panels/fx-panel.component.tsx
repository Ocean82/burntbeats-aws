import type { StemEditorState } from "../../../stem-editor-state";

export interface FXPanelProps {
  stemId: string;
  stemLabel: string;
  state: StemEditorState;
  onChange: (stemId: string, next: Partial<StemEditorState>) => void;
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
          {display}{unit}
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

export function FXPanel({ stemId, stemLabel, state, onChange }: FXPanelProps) {
  const setMixer = (field: string, value: number) =>
    onChange(stemId, { mixer: { ...state.mixer, [field]: value } });

  const resetMixer = (field: string, defaultValue: number) =>
    onChange(stemId, { mixer: { ...state.mixer, [field]: defaultValue } });

  return (
    <div className="space-y-md">
      <FxSlider
        label="Warmth"
        value={state.mixer.warmth}
        min={0} max={100}
        unit="%"
        stemLabel={stemLabel}
        onChange={(v) => setMixer("warmth", v)}
        onReset={() => resetMixer("warmth", 0)}
      />
      <FxSlider
        label="Presence"
        value={state.mixer.presence}
        min={-12} max={12} step={0.5}
        unit=" dB"
        stemLabel={stemLabel}
        onChange={(v) => setMixer("presence", v)}
        onReset={() => resetMixer("presence", 0)}
      />
      <FxSlider
        label="Reverb"
        value={state.mixer.reverbWet}
        min={0} max={100}
        unit="%"
        stemLabel={stemLabel}
        onChange={(v) => setMixer("reverbWet", v)}
        onReset={() => resetMixer("reverbWet", 0)}
      />
      <FxSlider
        label="Delay"
        value={state.mixer.delayWet}
        min={0} max={100}
        unit="%"
        stemLabel={stemLabel}
        onChange={(v) => setMixer("delayWet", v)}
        onReset={() => resetMixer("delayWet", 0)}
      />
      <FxSlider
        label="Comp Threshold"
        value={state.mixer.compThreshold}
        min={-60} max={0}
        unit=" dB"
        stemLabel={stemLabel}
        onChange={(v) => setMixer("compThreshold", v)}
        onReset={() => resetMixer("compThreshold", 0)}
      />
      <FxSlider
        label="Comp Ratio"
        value={state.mixer.compRatio}
        min={1} max={20} step={0.5}
        unit=":1"
        format={(v) => v.toFixed(1)}
        stemLabel={stemLabel}
        onChange={(v) => setMixer("compRatio", v)}
        onReset={() => resetMixer("compRatio", 1)}
      />
      <FxSlider
        label="Comp Attack"
        value={state.mixer.compAttackMs}
        min={1} max={200}
        unit=" ms"
        stemLabel={stemLabel}
        onChange={(v) => setMixer("compAttackMs", v)}
        onReset={() => resetMixer("compAttackMs", 10)}
      />
      <FxSlider
        label="Comp Release"
        value={state.mixer.compReleaseMs}
        min={10} max={1000} step={10}
        unit=" ms"
        stemLabel={stemLabel}
        onChange={(v) => setMixer("compReleaseMs", v)}
        onReset={() => resetMixer("compReleaseMs", 100)}
      />
      <p className="text-center text-helper text-muted-foreground pt-1">
        Double-click to reset
      </p>
    </div>
  );
}
