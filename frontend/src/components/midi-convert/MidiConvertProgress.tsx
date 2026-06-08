/**
 * MidiConvertProgress — multi-phase progress indicator during MIDI conversion.
 * Shows labeled sub-phases, elapsed time, gradient-glow progress bar, and cancel.
 */
import { Check, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../utils/cn";

interface ProgressPhase {
  id: string;
  label: string;
  /** Progress percentage where this phase starts. */
  start: number;
  /** Progress percentage where this phase ends. */
  end: number;
}

const PHASES: ProgressPhase[] = [
  { id: "upload", label: "Uploading", start: 0, end: 15 },
  { id: "analyze", label: "Analyzing audio", start: 15, end: 40 },
  { id: "extract", label: "Extracting notes", start: 40, end: 80 },
  { id: "finalize", label: "Finalizing MIDI", start: 80, end: 100 },
];

function getActivePhase(percent: number, isUploading: boolean): ProgressPhase {
  if (isUploading) return PHASES[0];
  for (let i = PHASES.length - 1; i >= 0; i--) {
    if (percent >= PHASES[i].start) return PHASES[i];
  }
  return PHASES[0];
}

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
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number>(0);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Track elapsed time
  useEffect(() => {
    if (!isConverting && !isUploading) {
      setElapsed(0);
      startTimeRef.current = 0;
      return;
    }
    if (startTimeRef.current === 0) {
      startTimeRef.current = Date.now();
    }
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isConverting, isUploading]);

  // Reset cancel confirmation when progress changes
  useEffect(() => {
    setConfirmCancel(false);
  }, [progress]);

  if (!isConverting && !isUploading) return null;

  const barPercent = isUploading ? uploadProgress : progress;
  const activePhase = getActivePhase(barPercent, isUploading);
  const displayLabel = statusMessage || activePhase.label;

  const handleCancel = () => {
    if (!confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    onCancel?.();
    setConfirmCancel(false);
  };

  return (
    <div className="midi-status-panel" role="status" aria-live="polite">
      {/* Phase indicators */}
      <div className="flex items-center gap-xs flex-wrap">
        {PHASES.map((phase) => {
          const isDone = barPercent >= phase.end;
          const isActive = phase.id === activePhase.id;
          return (
            <span
              key={phase.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-xs py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
                isDone && "text-success bg-success-muted/30",
                isActive && !isDone && "text-accent-midi-200 bg-accent-midi-950/40",
                !isDone && !isActive && "text-muted-foreground/50",
              )}
            >
              {isDone && <Check className="h-2.5 w-2.5" aria-hidden />}
              {isActive && !isDone && (
                <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
              )}
              {phase.label}
            </span>
          );
        })}
      </div>

      {/* Header with label, elapsed, percent, cancel */}
      <div className="midi-status-panel__header">
        <span className="midi-status-panel__label">
          <Loader2 className="h-4 w-4 animate-spin text-accent-midi-400" aria-hidden />
          <span>{displayLabel}</span>
          {elapsed > 0 && (
            <span className="text-[10px] text-muted-foreground tabular-nums ml-xs">
              {elapsed}s
            </span>
          )}
        </span>
        <div className="flex items-center gap-sm">
          <span className="midi-status-panel__percent tabular-nums">
            {barPercent}%
          </span>
          {onCancel && (
            <button
              type="button"
              onClick={handleCancel}
              className={cn(
                "flex h-9 min-w-[44px] items-center justify-center gap-xs rounded-lg border px-sm text-xs font-medium transition",
                confirmCancel
                  ? "border-destructive-500/60 bg-destructive-950/30 text-destructive-200"
                  : "border-border/60 text-muted-foreground hover:border-destructive-500/40 hover:text-destructive-200",
              )}
              aria-label={confirmCancel ? "Confirm cancel" : "Cancel conversion"}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              {confirmCancel ? "Sure?" : "Cancel"}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar with gradient glow */}
      <div className="midi-progress-bar-wrap">
        <progress
          className="midi-status-panel__meter"
          value={Math.min(100, Math.max(2, barPercent))}
          max={100}
          aria-label={displayLabel}
        />
        <div
          className="midi-progress-bar-glow"
          style={{ width: `${Math.min(100, Math.max(2, barPercent))}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}
