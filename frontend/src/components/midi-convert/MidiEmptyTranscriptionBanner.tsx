/**
 * MidiEmptyTranscriptionBanner — recovery guidance when conversion completes with zero notes.
 */
import { AlertTriangle, RefreshCw, Settings2 } from "lucide-react";

interface MidiEmptyTranscriptionBannerProps {
  onAdjustSettings?: () => void;
  onRetry?: () => void;
}

export function MidiEmptyTranscriptionBanner({
  onAdjustSettings,
  onRetry,
}: MidiEmptyTranscriptionBannerProps) {
  return (
    <div
      className="rounded-xl border border-amber-500/35 bg-amber-950/25 px-md py-sm"
      role="alert"
      data-testid="midi-empty-transcription-banner"
    >
      <div className="flex items-start gap-sm">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-xs">
          <p className="text-sm font-medium text-amber-100">
            No notes detected
          </p>
          <p className="text-xs leading-relaxed text-amber-200/80">
            Basic Pitch did not find playable notes in this audio. Try lowering
            Min confidence, switching to the Drums preset for percussion, or
            shortening Min note length, then convert again.
          </p>
          <div className="flex flex-wrap gap-xs pt-1">
            {onAdjustSettings ? (
              <button
                type="button"
                onClick={onAdjustSettings}
                className="midi-btn text-xs"
              >
                <Settings2 className="h-3.5 w-3.5" aria-hidden />
                Adjust settings
              </button>
            ) : null}
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="midi-btn midi-btn--play text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Try again
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
