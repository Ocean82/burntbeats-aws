/**
 * DjTransportBar — Compact transport controls for DJ mode.
 * Play/Stop, Loop, Zoom, Beat Grid, Timecode display.
 */
import { Grid, Play, Repeat, Square, ZoomIn, ZoomOut } from "lucide-react";
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
}: DjTransportBarProps) {
  const currentTime = (playheadPct / 100) * maxDuration;

  return (
    <div className="flex items-center gap-sm px-md py-sm bg-chrome border-b border-border/[0.06]" role="toolbar" aria-label="Transport controls">
      {/* Play / Stop */}
      <button
        type="button"
        onClick={onPlayPause}
        disabled={!playbackReady}
        aria-label={isPlaying ? "Stop" : "Play"}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full border transition",
          isPlaying
            ? "border-info-400/60 bg-info-500/20 text-info-200 shadow-[0_0_12px_rgba(0,220,255,0.3)]"
            : "border-border bg-muted text-secondary-foreground hover:bg-muted hover:border-border",
          !playbackReady && "opacity-40",
        )}
      >
        {isPlaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>

      {/* Loop */}
      <button
        type="button"
        onClick={() => onLoopToggle?.(!loopEnabled)}
        disabled={!playbackReady}
        aria-label={loopEnabled ? "Disable loop" : "Enable loop"}
        aria-pressed={loopEnabled}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg border transition",
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
        className="font-mono text-lg font-light tracking-wider text-info-300/90 tabular-nums min-w-[7rem] text-center"
        aria-label="Current playback time"
        aria-live="off"
      >
        {formatTimecode(currentTime)}
      </time>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Beat Grid */}
      {hasBeatGrid && (
        <button
          type="button"
          onClick={onBeatGridToggle}
          aria-label="Toggle beat grid"
          className={cn(
            "flex items-center gap-2xs rounded-lg border px-sm py-1.5 text-[10px] font-medium uppercase tracking-wider transition",
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
      <div className="flex items-center gap-2xs rounded-lg border border-border bg-muted">
        <button
          type="button"
          onClick={onZoomOut}
          disabled={zoom <= 1}
          aria-label="Zoom out"
          className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <span className="px-1 text-[10px] text-muted-foreground tabular-nums">{Math.round(zoom * 100)}%</span>
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
          className="w-24 accent-info-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info-400/50 rounded"
          aria-label="Scroll timeline position"
          aria-valuetext={`${Math.round(scrollPct)}% scrolled`}
        />
      )}
    </div>
  );
}
