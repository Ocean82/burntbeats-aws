/**
 * MidiConvertProgress — progress bar during MIDI conversion.
 */
import { Loader2, X } from "lucide-react";

interface MidiConvertProgressProps {
  isConverting: boolean;
  isUploading?: boolean;
  uploadProgress?: number;
  progress: number;
  statusMessage: string;
  onCancel?: () => void;
}

export function MidiConvertProgress({
  isConverting,
  isUploading = false,
  uploadProgress = 0,
  progress,
  statusMessage,
  onCancel,
}: MidiConvertProgressProps) {
  if (!isConverting && !isUploading) return null;

  const barPercent = isUploading ? uploadProgress : progress;
  const label = isUploading
    ? statusMessage || `Uploading… ${uploadProgress}%`
    : statusMessage || "Processing...";

  return (
    <div className="midi-status-panel" role="status" aria-live="polite">
      <div className="midi-status-panel__header">
        <span className="midi-status-panel__label">
          <Loader2 className="h-4 w-4 animate-spin text-accent-midi-400" aria-hidden />
          <span>{label}</span>
        </span>
        <div className="flex items-center gap-sm">
          <span className="midi-status-panel__percent">{barPercent}%</span>
          {onCancel && (
            <button
              type="button"
              onClick={() => void onCancel()}
              className="flex h-9 min-w-[44px] items-center justify-center gap-xs rounded-lg border border-border/60 px-sm text-xs font-medium text-muted-foreground transition hover:border-destructive-500/40 hover:text-destructive-200"
              aria-label="Abandon conversion"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Abandon
            </button>
          )}
        </div>
      </div>
      <div
        className="midi-status-panel__meter"
        role="progressbar"
        aria-valuenow={barPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="midi-status-panel__meter-fill"
          style={{ width: `${Math.max(barPercent, 2)}%` }}
        />
      </div>
    </div>
  );
}
