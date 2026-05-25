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
    <div className="midi-param-slider">
      <p className="midi-param-slider__label mb-1">Musical analysis</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="midi-param-slider__label">Estimated key</dt>
          <dd className="midi-param-slider__value mt-1 inline-block">{analysis.estimated_key}</dd>
        </div>
        <div>
          <dt className="midi-param-slider__label">Pitch range</dt>
          <dd className="midi-param-slider__value mt-1 inline-block">
            {range.min_name} – {range.max_name}
          </dd>
        </div>
        <div>
          <dt className="midi-param-slider__label">Note density</dt>
          <dd className="midi-param-slider__value mt-1 inline-block">
            {analysis.note_density.toFixed(1)} / sec
          </dd>
        </div>
        <div>
          <dt className="midi-param-slider__label">Complexity</dt>
          <dd className="midi-param-slider__value mt-1 inline-block">
            {Math.round(analysis.complexity_score * 100)}%
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="midi-param-slider__label">Suggested BPM</dt>
          <dd className="flex flex-wrap items-center gap-xs mt-1">
            {analysis.suggested_bpm != null ? (
              <>
                <span className="midi-param-slider__value">{analysis.suggested_bpm}</span>
                {onApplySuggestedBpm && (
                  <button
                    type="button"
                    onClick={() => onApplySuggestedBpm(analysis.suggested_bpm!)}
                    className="midi-btn text-[10px] px-sm py-0"
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
