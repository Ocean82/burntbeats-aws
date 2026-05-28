/**
 * DjTransportBar — Compact transport controls for DJ mode.
 * Play/Stop, Loop, Zoom, Beat Grid, Timecode display.
 */
import { Circle, Download, Grid, Play, Repeat, Square, StopCircle, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "../../utils/cn";

interface DjTransportBarProps {
  isPlaying: boolean;
  playbackReady: boolean;
  loopEnabled: boolean;
  playheadPct: number;
  maxDuration: number;
  zoom: number;
  maxScrollPct: number;
  scrollPct: number;
  showBeatGrid: boolean;
  hasBeatGrid: boolean;
  onPlayPause: () => void;
  onLoopToggle?: (enabled: boolean) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onScrollChange: (value: number) => void;
  onBeatGridToggle: () => void;
  isExporting?: boolean;
  exportReady?: boolean;
  onExport?: () => void;
  /** Whether the recorder is actively capturing audio. */
  isRecording?: boolean;
  /** Recording duration in seconds (displayed while recording). */
  recordingDuration?: number;
  /** Start recording the master mix output. */
  onStartRecording?: () => void;
  /** Stop recording and trigger WAV conversion/download. */
  onStopRecording?: () => void;
}

function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00.00";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const whole = Math.floor(secs);
  const frac = Math.floor((secs - whole) * 100);
  return `${String(mins).padStart(2, "0")}:${String(whole).padStart(2, "0")}.${String(frac).padStart(2, "0")}`;
}

export function DjTransportBar({
  isPlaying,
  playbackReady,
  loopEnabled,
  playheadPct,
  maxDuration,
  zoom,
  maxScrollPct,
  scrollPct,
  showBeatGrid,
  hasBeatGrid,
  onPlayPause,
  onLoopToggle,
  onZoomIn,
  onZoomOut,
  onScrollChange,
  onBeatGridToggle,
  isExporting = false,
  exportReady = false,
  onExport,
  isRecording = false,
  recordingDuration = 0,
  onStartRecording,
  onStopRecording,
}: DjTransportBarProps) {
  const currentTime = (playheadPct / 100) * maxDuration;

  return (
    <div
      className="flex flex-wrap items-center gap-xs px-sm py-sm sm:gap-sm sm:px-md bg-chrome border-b border-border/[0.06]"
      role="toolbar"
      aria-label="Transport controls"
    >
      {/* Play / Stop */}
      <button
        type="button"
        onClick={onPlayPause}
        disabled={!playbackReady}
        aria-label={isPlaying ? "Stop" : "Play"}
        className={cn(
          "flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-full border transition",
          isPlaying
            ? "border-info-400/60 bg-info-500/20 text-info-200 shadow-[0_0_12px_rgba(0,220,255,0.3)]"
            : "border-border bg-muted text-secondary-foreground hover:bg-muted hover:border-border",
          !playbackReady && "opacity-40",
        )}
      >
        {isPlaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>

      {/* Record */}
      {onStartRecording && onStopRecording && (
        <button
          type="button"
          onClick={isRecording ? onStopRecording : onStartRecording}
          disabled={!playbackReady}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
          className={cn(
            "flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-full border transition relative",
            isRecording
              ? "border-destructive-400/60 bg-destructive-500/20 text-destructive-200 shadow-[0_0_12px_rgba(255,0,0,0.3)] animate-pulse"
              : "border-border bg-muted text-muted-foreground hover:text-destructive-300 hover:border-destructive-400/40",
            !playbackReady && "opacity-40",
          )}
        >
          {isRecording ? (
            <StopCircle className="h-4 w-4" />
          ) : (
            <>
              <Circle className="h-3 w-3 fill-current" />
              {recordingDuration > 0 && (
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] font-mono text-destructive-300 tabular-nums whitespace-nowrap">
                  {Math.floor(recordingDuration / 60)}:{String(Math.floor(recordingDuration % 60)).padStart(2, "0")}
                </span>
              )}
            </>
          )}
        </button>
      )}

      {/* Loop */}
      <button
        type="button"
        onClick={() => onLoopToggle?.(!loopEnabled)}
        disabled={!playbackReady}
        aria-label={loopEnabled ? "Disable loop" : "Enable loop"}
        className={cn(
          "flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-lg border transition",
          loopEnabled
            ? "border-info-400/50 bg-info-500/15 text-info-200"
            : "border-border bg-muted text-muted-foreground hover:text-foreground",
          !playbackReady && "opacity-40",
        )}
      >
        <Repeat className="h-3.5 w-3.5" />
      </button>

      {/* Timecode */}
      <time
        className="order-first w-full sm:order-none sm:w-auto font-mono text-base sm:text-lg font-light tracking-wider text-info-300/90 tabular-nums min-w-[6.5rem] text-center"
        aria-label="Current playback time"
        aria-live="off"
      >
        {formatTimecode(currentTime)}
      </time>

      {/* Spacer */}
      <div className="hidden sm:flex sm:flex-1" />

      {onExport && (
        <button
          type="button"
          onClick={onExport}
          disabled={!exportReady || isExporting}
          className={cn(
            "tap-feedback flex min-h-[44px] items-center gap-xs rounded-lg border px-sm sm:px-md py-xs text-xs font-semibold transition-[color,background-color,border-color,transform] duration-[var(--motion-fast)] ease-[var(--ease-out-quart)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]",
            exportReady && !isExporting
              ? "border-primary-400/50 bg-primary-500/20 text-primary-100 hover:bg-primary-500/30"
              : "cursor-not-allowed border-border bg-muted text-muted-foreground opacity-50",
          )}
          aria-label={isExporting ? "Exporting mix" : "Export mix"}
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          {isExporting ? "Exporting…" : "Export"}
        </button>
      )}

      {/* Beat Grid */}
      {hasBeatGrid && (
        <button
          type="button"
          onClick={onBeatGridToggle}
          aria-label="Toggle beat grid"
          className={cn(
            "flex min-h-[40px] items-center gap-2xs rounded-lg border px-sm py-1.5 text-meta font-medium uppercase tracking-wider transition",
            showBeatGrid
              ? "border-primary-400/40 bg-primary-500/15 text-primary-200"
              : "border-border bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          <Grid className="h-3 w-3" />
          Grid
        </button>
      )}

      {/* Zoom */}
      <div className="ml-auto sm:ml-0 flex items-center gap-2xs rounded-lg border border-border bg-muted">
        <button
          type="button"
          onClick={onZoomOut}
          disabled={zoom <= 1}
          aria-label="Zoom out"
          className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <span className="px-1 text-meta text-muted-foreground tabular-nums">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={onZoomIn}
          disabled={zoom >= 8}
          aria-label="Zoom in"
          className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Scroll (when zoomed) */}
      {zoom > 1 && (
        <input
          type="range"
          min={0}
          max={maxScrollPct}
          step={0.5}
          value={scrollPct}
          onChange={(e) => onScrollChange(Number(e.target.value))}
          className="w-full sm:w-24 accent-info-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info-400/50 rounded"
          aria-label="Scroll timeline position"
          aria-valuetext={`${Math.round(scrollPct)}% scrolled`}
        />
      )}
    </div>
  );
}
