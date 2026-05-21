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
    <div className="flex flex-col gap-2 rounded-xl border border-violet-400/15 bg-violet-500/5 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-violet-100/80">
        <Loader2 className="h-4 w-4 animate-spin text-violet-400" aria-hidden />
        <span>{label}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-violet-900/30">
        <div
          className="h-full rounded-full bg-violet-500 transition-all duration-300"
          style={{ width: `${Math.max(barPercent, 2)}%` }}
          role="progressbar"
          aria-valuenow={barPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={isUploading ? "MIDI upload progress" : "MIDI conversion progress"}
        />
      </div>
      <p className="text-right text-xs text-white/40">{barPercent}%</p>
    </div>
  );
}
