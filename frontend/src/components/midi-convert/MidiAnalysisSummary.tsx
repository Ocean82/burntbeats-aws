/**
 * MidiAnalysisSummary — compact musical stats visible in View and Edit modes.
 */
import type {
  MidiAnalysis,
  MidiFileAnalysisDetail,
} from "../../hooks/useMidiConvert";

export interface MidiAnalysisSummaryProps {
  analysis: MidiAnalysis;
  fileAnalysis?: MidiFileAnalysisDetail | null;
  notesDetected: number;
  onApplyEditorBpm?: (bpm: number) => void;
  onApplyReconvertBpm?: (bpm: number) => void;
  showBpmActions?: boolean;
}

function formatKey(
  analysis: MidiAnalysis,
  fileAnalysis: MidiFileAnalysisDetail | null | undefined,
): string {
  return (fileAnalysis?.key_signature ?? analysis.estimated_key)
    .replace(/b/g, "♭")
    .replace(/#/g, "♯");
}

export function MidiAnalysisSummary({
  analysis,
  fileAnalysis = null,
  notesDetected,
  onApplyEditorBpm,
  onApplyReconvertBpm,
  showBpmActions = true,
}: MidiAnalysisSummaryProps) {
  const bpm = fileAnalysis?.tempo_bpm ?? analysis.suggested_bpm;
  const showActions =
    showBpmActions &&
    bpm != null &&
    analysis.suggested_bpm != null &&
    (onApplyEditorBpm || onApplyReconvertBpm);

  return (
    <div
      className="midi-analysis-summary rounded-lg border border-border/60 bg-muted/25 px-sm py-xs"
      data-testid="midi-analysis-summary"
    >
      <div className="flex flex-wrap items-center gap-sm">
        {bpm != null && (
          <div className="midi-analysis-bpm-badge">
            <span className="midi-analysis-bpm-badge__value">{bpm}</span>
            <span className="midi-analysis-bpm-badge__unit">BPM</span>
          </div>
        )}
        <span className="font-mono text-xs font-semibold text-accent-midi-200 tabular-nums">
          {formatKey(analysis, fileAnalysis)}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {notesDetected} notes · {analysis.note_density.toFixed(1)}/sec
        </span>
        {showActions ? (
          <div className="flex flex-wrap gap-xs">
            {onApplyEditorBpm ? (
              <button
                type="button"
                onClick={() => onApplyEditorBpm(bpm!)}
                className="midi-btn text-[10px] px-sm py-0"
                data-testid="midi-apply-editor-bpm"
              >
                Use in editor
              </button>
            ) : null}
            {onApplyReconvertBpm ? (
              <button
                type="button"
                onClick={() => onApplyReconvertBpm(bpm!)}
                className="midi-btn text-[10px] px-sm py-0"
                data-testid="midi-apply-reconvert-bpm"
              >
                Use for re-convert
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
