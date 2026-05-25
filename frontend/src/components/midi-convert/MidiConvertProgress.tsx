/**
 * MidiConvertProgress — progress bar during MIDI conversion.
 */
import { Loader2 } from "lucide-react";

interface MidiConvertProgressProps {
  isConverting: boolean;
  isUploading?: boolean;
  uploadProgress?: number;
  progress: number;
  statusMessage: string;
}

export function MidiConvertProgress({
  isConverting,
  isUploading = false,
  uploadProgress = 0,
  progress,
  statusMessage,
}: MidiConvertProgressProps) {
  if (!isConverting && !isUploading) return null;

  const barPercent = isUploading ? uploadProgress : progress;
  const label = isUploading
    ? statusMessage || `Uploading… ${uploadProgress}%`
    : statusMessage || "Processing...";

  return (
    <div className="midi-param-slider">
      <div className="midi-param-slider__header">
        <span className="flex items-center gap-xs text-sm text-accent-midi-100/80">
          <Loader2 className="h-4 w-4 animate-spin text-accent-midi-400" aria-hidden />
          <span>{label}</span>
        </span>
        <span className="midi-param-slider__value">{barPercent}%</span>
      </div>
      <div className="midi-param-slider__track" role="progressbar" aria-valuenow={barPercent} aria-valuemin={0} aria-valuemax={100}>
        <div className="midi-param-slider__groove" aria-hidden />
        <div
          className="midi-param-slider__fill"
          style={{ width: `${Math.max(barPercent, 2)}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}
