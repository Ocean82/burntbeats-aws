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
    <div className="flex items-center gap-3 px-4 py-2.5 bg-black/70 border-b border-white/[0.06]" role="toolbar" aria-label="Transport controls">
      {/* Play / Stop */}
      <button
        type="button"
        onClick={onPlayPause}
        disabled={!playbackReady}
        aria-label={isPlaying ? "Stop" : "Play"}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full border transition",
          isPlaying
            ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-200 shadow-[0_0_12px_rgba(0,220,255,0.3)]"
            : "border-white/20 bg-white/5 text-white/80 hover:bg-white/10 hover:border-white/30",
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
            ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200"
            : "border-white/15 bg-white/5 text-white/50 hover:text-white",
          !playbackReady && "opacity-40",
        )}
      >
        <Repeat className="h-3.5 w-3.5" />
      </button>

      {/* Timecode */}
      <time
        className="font-mono text-lg font-light tracking-wider text-cyan-300/90 tabular-nums min-w-[7rem] text-center"
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
            "flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider transition",
            showBeatGrid
              ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
              : "border-white/10 bg-white/5 text-white/50 hover:text-white",
          )}
        >
          <Grid className="h-3 w-3" />
          Grid
        </button>
      )}

      {/* Zoom */}
      <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/30">
        <button
          type="button"
          onClick={onZoomOut}
          disabled={zoom <= 1}
          aria-label="Zoom out"
          className="flex h-7 w-7 items-center justify-center text-white/50 hover:text-white disabled:opacity-30 transition"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <span className="px-1 text-[10px] text-white/40 tabular-nums">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={onZoomIn}
          disabled={zoom >= 8}
          aria-label="Zoom in"
          className="flex h-7 w-7 items-center justify-center text-white/50 hover:text-white disabled:opacity-30 transition"
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
          className="w-24 accent-cyan-400"
          aria-label="Scroll timeline"
        />
      )}
    </div>
  );
}
