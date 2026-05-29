/**
 * MidiAnalysisPanel — musical insights from conversion + MIDI file analysis.
 */
import type {
  MidiAnalysis,
  MidiFileAnalysisDetail,
} from "../../hooks/useMidiConvert";

interface MidiAnalysisPanelProps {
  analysis: MidiAnalysis;
  fileAnalysis?: MidiFileAnalysisDetail | null;
  onApplySuggestedBpm?: (bpm: number) => void;
}

export function MidiAnalysisPanel({
  analysis,
  fileAnalysis = null,
  onApplySuggestedBpm,
}: MidiAnalysisPanelProps) {
  const { pitch_range: range } = analysis;
  const complexity =
    fileAnalysis?.complexity_score ?? analysis.complexity_score;
  const genreHints = fileAnalysis?.genre_hints ?? [];
  const trackInfo = fileAnalysis?.track_info ?? [];

  return (
    <div className="midi-inspector" data-testid="midi-analysis-panel">
      <p className="midi-inspector__title">Musical analysis</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Estimated key
          </dt>
          <dd className="mt-1 font-mono text-sm font-semibold text-accent-midi-200">
            {fileAnalysis?.key_signature ?? analysis.estimated_key}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Pitch range
          </dt>
          <dd className="mt-1 font-mono text-sm font-semibold text-accent-midi-200">
            {range.min_name} – {range.max_name}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Note density
          </dt>
          <dd className="mt-1 font-mono text-sm font-semibold text-accent-midi-200">
            {analysis.note_density.toFixed(1)} / sec
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Complexity
          </dt>
          <dd className="mt-1 font-mono text-sm font-semibold text-accent-midi-200">
            {typeof complexity === "number" && complexity <= 10
              ? complexity.toFixed(1)
              : `${Math.round((complexity as number) * 100)}%`}
          </dd>
        </div>
        {fileAnalysis && (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Drums detected
            </dt>
            <dd className="mt-1 font-mono text-sm font-semibold text-accent-midi-200">
              {fileAnalysis.has_drums ? "Yes" : "No"}
            </dd>
          </div>
        )}
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Suggested BPM
          </dt>
          <dd className="mt-1 flex flex-wrap items-center gap-xs">
            {(fileAnalysis?.tempo_bpm ?? analysis.suggested_bpm) != null ? (
              <>
                <span className="font-mono text-sm font-semibold text-accent-midi-200">
                  {fileAnalysis?.tempo_bpm ?? analysis.suggested_bpm}
                </span>
                {onApplySuggestedBpm && analysis.suggested_bpm != null && (
                  <button
                    type="button"
                    onClick={() =>
                      onApplySuggestedBpm(
                        fileAnalysis?.tempo_bpm ?? analysis.suggested_bpm!,
                      )
                    }
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

      {genreHints.length > 0 && (
        <div className="mt-sm">
          <p className="midi-inspector__title mb-1">Genre hints</p>
          <div className="flex flex-wrap gap-xs">
            {genreHints.map((hint) => (
              <span
                key={hint}
                className="rounded-full border border-accent-midi/30 bg-accent-midi-950/30 px-sm py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-midi-200"
              >
                {hint}
              </span>
            ))}
          </div>
        </div>
      )}

      {trackInfo.length > 0 && (
        <div className="mt-sm">
          <p className="midi-inspector__title mb-1">Tracks</p>
          <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-secondary-foreground">
            {trackInfo.map((t) => (
              <li
                key={t.index}
                className="flex justify-between gap-sm rounded-md border border-border/60 bg-muted/40 px-sm py-1"
              >
                <span className="truncate font-medium">{t.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {t.notes} notes
                  {t.is_drum ? " · drums" : ""}
                  {t.instrument_name ? ` · ${t.instrument_name}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
