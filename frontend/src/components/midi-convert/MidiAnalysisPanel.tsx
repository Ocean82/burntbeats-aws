/**
 * MidiAnalysisPanel — musical insights from conversion + MIDI file analysis.
 * Enriched with visual meters, prominent BPM badge, and colored genre hints.
 */
import type {
  MidiAnalysis,
  MidiFileAnalysisDetail,
} from "../../hooks/useMidiConvert";
import { cn } from "../../utils/cn";

interface MidiAnalysisPanelProps {
  analysis: MidiAnalysis;
  fileAnalysis?: MidiFileAnalysisDetail | null;
  onApplyEditorBpm?: (bpm: number) => void;
  onApplyReconvertBpm?: (bpm: number) => void;
}

/** Segmented complexity meter (5 segments). */
function ComplexityMeter({ value }: { value: number }) {
  // Normalize to 0-1 range
  const normalized = value <= 1 ? value : value <= 10 ? value / 10 : value / 100;
  const filledSegments = Math.round(normalized * 5);
  return (
    <div className="flex items-center gap-0.5" aria-label={`Complexity ${Math.round(normalized * 100)}%`}>
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-2.5 w-3 rounded-sm transition-colors",
            i < filledSegments
              ? "bg-accent-midi/70"
              : "bg-[var(--midi-surface-inset)]",
          )}
        />
      ))}
    </div>
  );
}

/** Note density mini bar. */
function DensityBar({ density }: { density: number }) {
  // Cap at 20 notes/sec for visualization
  const pct = Math.min(100, (density / 20) * 100);
  return (
    <div className="flex items-center gap-xs">
      <span className="font-mono text-sm font-semibold text-accent-midi-200 tabular-nums">
        {density.toFixed(1)}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-[var(--midi-surface-inset)] max-w-[60px]">
        <div
          className="h-1.5 rounded-full bg-accent-midi/60"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[9px] text-muted-foreground">/sec</span>
    </div>
  );
}

export function MidiAnalysisPanel({
  analysis,
  fileAnalysis = null,
}: MidiAnalysisPanelProps) {
  const { pitch_range: range } = analysis;
  const complexity =
    fileAnalysis?.complexity_score ?? analysis.complexity_score;
  const genreHints = fileAnalysis?.genre_hints ?? [];
  const trackInfo = fileAnalysis?.track_info ?? [];

  return (
    <div className="midi-inspector" data-testid="midi-analysis-panel">
      <p className="midi-inspector__title">Musical analysis</p>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Key
          </dt>
          <dd className="mt-1 inline-flex items-center gap-1 rounded-md border border-accent-midi/20 bg-accent-midi-950/20 px-xs py-0.5 font-mono text-sm font-semibold text-accent-midi-200">
            {(fileAnalysis?.key_signature ?? analysis.estimated_key)
              .replace(/b/g, "♭")
              .replace(/#/g, "♯")}
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
          <dd className="mt-1">
            <DensityBar density={analysis.note_density} />
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Complexity
          </dt>
          <dd className="mt-1.5">
            <ComplexityMeter value={complexity as number} />
          </dd>
        </div>
        {fileAnalysis && (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Drums
            </dt>
            <dd className="mt-1 font-mono text-sm font-semibold text-accent-midi-200">
              {fileAnalysis.has_drums ? "Yes" : "No"}
            </dd>
          </div>
        )}
      </dl>

      {genreHints.length > 0 && (
        <div className="mt-sm">
          <p className="midi-inspector__title mb-1">Genre hints</p>
          <div className="flex flex-wrap gap-xs">
            {genreHints.map((hint) => (
              <span
                key={hint}
                className="midi-analysis-genre-badge"
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
                className="flex items-center justify-between gap-sm rounded-md border border-border/60 bg-muted/40 px-sm py-1"
              >
                <div className="flex items-center gap-xs min-w-0">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background: t.is_drum
                        ? "oklch(72% 0.12 205)"
                        : "var(--midi-accent)",
                    }}
                  />
                  <span className="truncate font-medium">{t.name}</span>
                </div>
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
