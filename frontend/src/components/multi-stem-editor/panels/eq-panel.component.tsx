import type { StemEditorState } from "../../../stem-editor-state";

export interface EQPanelProps {
  stemId: string;
  stemLabel: string;
  state: StemEditorState;
  onChange: (stemId: string, next: Partial<StemEditorState>) => void;
}

const EQ_BANDS = [
  { key: "eqLow" as const, label: "Low", freq: "200 Hz" },
  { key: "eqLowMid" as const, label: "Low-Mid", freq: "400 Hz" },
  { key: "eqMid" as const, label: "Mid", freq: "1 kHz" },
  { key: "eqHigh" as const, label: "High", freq: "6 kHz" },
];

export function EQPanel({ stemId, stemLabel, state, onChange }: EQPanelProps) {
  return (
    <div className="space-y-sm">
      {EQ_BANDS.map(({ key, label, freq }) => (
        <div key={key} className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-meta font-medium uppercase tracking-wider text-muted-foreground">
              {label} <span className="text-muted-foreground">{freq}</span>
            </span>
            <span className="font-mono text-meta tabular-nums text-muted-foreground">
              {state.mixer[key] > 0 ? "+" : ""}
              {state.mixer[key].toFixed(1)} dB
            </span>
          </div>
          <input
            type="range"
            min={-12}
            max={12}
            step={0.5}
            value={state.mixer[key]}
            onChange={(e) =>
              onChange(stemId, {
                mixer: { ...state.mixer, [key]: Number(e.target.value) },
              })
            }
            onDoubleClick={() =>
              onChange(stemId, { mixer: { ...state.mixer, [key]: 0 } })
            }
            className="stem-accent-slider w-full"
            aria-label={`${stemLabel} ${label} EQ (${freq})`}
          />
        </div>
      ))}
      <p className="text-center text-helper text-muted-foreground pt-1">
        Double-click to reset
      </p>
    </div>
  );
}
