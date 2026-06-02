import {
  TIME_STRETCH_MIN,
  TIME_STRETCH_MAX,
  TIME_STRETCH_STEP,
  timeStretchToDisplayPercent,
} from "../../../constants/mixerRanges";
import type { StemEditorState } from "../../../stem-editor-state";

export interface TimePanelProps {
  stemId: string;
  stemLabel: string;
  state: StemEditorState;
  onChange: (stemId: string, next: Partial<StemEditorState>) => void;
}

export function TimePanel({ stemId, stemLabel, state, onChange }: TimePanelProps) {
  return (
    <div className="space-y-md">
      <input
        type="range"
        min={TIME_STRETCH_MIN}
        max={TIME_STRETCH_MAX}
        step={TIME_STRETCH_STEP}
        value={state.timeStretch}
        onChange={(e) =>
          onChange(stemId, { timeStretch: Number(e.target.value) })
        }
        onDoubleClick={() => onChange(stemId, { timeStretch: 1.0 })}
        className="stem-accent-slider w-full"
        aria-label={`${stemLabel} tempo`}
      />
      <p className="text-center text-xs text-muted-foreground">
        {timeStretchToDisplayPercent(state.timeStretch) >= 0 ? "+" : ""}
        {timeStretchToDisplayPercent(state.timeStretch)}%
      </p>
      <p className="text-center text-helper text-muted-foreground">
        Double-click to reset
      </p>
    </div>
  );
}
