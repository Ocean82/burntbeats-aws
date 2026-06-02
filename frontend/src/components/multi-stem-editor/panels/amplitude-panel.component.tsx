import type { StemEditorState } from "../../../stem-editor-state";

export interface AmplitudePanelProps {
  stemId: string;
  stemLabel: string;
  state: StemEditorState;
  onChange: (stemId: string, next: Partial<StemEditorState>) => void;
}

export function AmplitudePanel({ stemId, stemLabel, state, onChange }: AmplitudePanelProps) {
  return (
    <div className="space-y-md">
      <input
        type="range"
        min={-20}
        max={6}
        step={0.5}
        value={state.mixer.gain}
        onChange={(e) =>
          onChange(stemId, {
            mixer: { ...state.mixer, gain: Number(e.target.value) },
          })
        }
        onDoubleClick={() =>
          onChange(stemId, { mixer: { ...state.mixer, gain: 0 } })
        }
        className="stem-accent-slider w-full"
        aria-label={`${stemLabel} volume`}
      />
      <p className="text-center text-xs text-muted-foreground">
        {state.mixer.gain > 0 ? "+" : ""}
        {state.mixer.gain.toFixed(1)} dB
      </p>
      <p className="text-center text-helper text-muted-foreground">
        Double-click to reset
      </p>
    </div>
  );
}
