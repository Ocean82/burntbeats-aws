/**
 * MidiAnalysisPanel — musical insights from the conversion analysis pass.
 */
import type { MidiAnalysis } from "../../hooks/useMidiConvert";

interface MidiAnalysisPanelProps {
  analysis: MidiAnalysis;
  onApplySuggestedBpm?: (bpm: number) => void;
}

export function MidiAnalysisPanel({
  analysis,
  onApplySuggestedBpm,
}: MidiAnalysisPanelProps) {
  const { pitch_range: range } = analysis;

  return (
    <div className="rounded-lg border border-accent-midi-400/15 bg-accent-midi-950/30 px-sm py-sm">
      <p className="mb-xs text-xs font-semibold uppercase tracking-wide text-accent-midi-200/80">
        Musical analysis
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Estimated key</dt>
          <dd className="font-medium text-secondary-foreground">{analysis.estimated_key}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Pitch range</dt>
          <dd className="font-medium text-secondary-foreground">
            {range.min_name} – {range.max_name}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Note density</dt>
          <dd className="font-medium text-secondary-foreground">
            {analysis.note_density.toFixed(1)} / sec
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Complexity</dt>
          <dd className="font-medium text-secondary-foreground">
            {Math.round(analysis.complexity_score * 100)}%
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-muted-foreground">Suggested BPM</dt>
          <dd className="flex flex-wrap items-center gap-xs font-medium text-secondary-foreground">
            {analysis.suggested_bpm != null ? (
              <>
                <span>{analysis.suggested_bpm}</span>
                {onApplySuggestedBpm && (
                  <button
                    type="button"
                    onClick={() => onApplySuggestedBpm(analysis.suggested_bpm!)}
                    className="rounded border border-accent-midi-400/40 px-xs py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-midi-200 transition hover:border-accent-midi-300/60 hover:bg-accent-midi-500/20"
                  >
                    Use for quantize
                  </button>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
