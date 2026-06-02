import { PITCH_MIN, PITCH_MAX, PITCH_STEP } from "../../../constants/mixerRanges";
import type { StemEditorState } from "../../../stem-editor-state";

export interface PitchPanelProps {
  stemId: string;
  stemLabel: string;
  state: StemEditorState;
  onChange: (stemId: string, next: Partial<StemEditorState>) => void;
}

export function PitchPanel({ stemId, stemLabel, state, onChange }: PitchPanelProps) {
  return (
    <div className="space-y-md">
      <input
        type="range"
        min={PITCH_MIN}
        max={PITCH_MAX}
        step={PITCH_STEP}
        value={state.pitchSemitones}
        onChange={(e) => onChange(stemId, { pitchSemitones: Number(e.target.value) })}
        onDoubleClick={() => onChange(stemId, { pitchSemitones: 0 })}
        className="stem-accent-slider w-full"
        aria-label={`${stemLabel} pitch shift`}
      />
      <p className="text-center text-xs text-muted-foreground">
        {state.pitchSemitones > 0 ? "+" : ""}
        {state.pitchSemitones.toFixed(1)} st
      </p>
      <p className="text-center text-helper text-muted-foreground">
        Double-click to reset
      </p>
    </div>
  );
}
