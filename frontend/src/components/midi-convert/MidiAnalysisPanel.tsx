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
    <div className="rounded-lg border border-violet-400/15 bg-violet-950/30 px-3 py-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-200/80">
        Musical analysis
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-white/45">Estimated key</dt>
          <dd className="font-medium text-white/85">{analysis.estimated_key}</dd>
        </div>
        <div>
          <dt className="text-white/45">Pitch range</dt>
          <dd className="font-medium text-white/85">
            {range.min_name} – {range.max_name}
          </dd>
        </div>
        <div>
          <dt className="text-white/45">Note density</dt>
          <dd className="font-medium text-white/85">
            {analysis.note_density.toFixed(1)} / sec
          </dd>
        </div>
        <div>
          <dt className="text-white/45">Complexity</dt>
          <dd className="font-medium text-white/85">
            {Math.round(analysis.complexity_score * 100)}%
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-white/45">Suggested BPM</dt>
          <dd className="flex flex-wrap items-center gap-2 font-medium text-white/85">
            {analysis.suggested_bpm != null ? (
              <>
                <span>{analysis.suggested_bpm}</span>
                {onApplySuggestedBpm && (
                  <button
                    type="button"
                    onClick={() => onApplySuggestedBpm(analysis.suggested_bpm!)}
                    className="rounded border border-violet-400/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200 transition hover:border-violet-300/60 hover:bg-violet-500/20"
                  >
                    Use for quantize
                  </button>
                )}
              </>
            ) : (
              <span className="text-white/50">—</span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
