import { Play, Square, Download, Volume2, VolumeX, Repeat } from "lucide-react";
import { cn } from "../utils/cn";

export interface AppTransportBarProps {
  isPlaying: boolean;
  playbackReady: boolean;
  loopEnabled: boolean;
  playheadPct: number;
  maxDuration: number;
  masterVolume: number;
  masterMuted: boolean;
  masterLimiterEnabled: boolean;
  isExporting?: boolean;
  onPlayPause: () => void;
  onLoopToggle: () => void;
  onMasterVolumeChange: (value: number) => void;
  onMasterMuteToggle: () => void;
  onMasterLimiterToggle: () => void;
  onExport?: () => void;
  onSeek?: (pct: number) => void;
}

function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function AppTransportBar({
  isPlaying,
  playbackReady,
  loopEnabled,
  playheadPct,
  maxDuration,
  masterVolume,
  masterMuted,
  masterLimiterEnabled,
  isExporting = false,
  onPlayPause,
  onLoopToggle,
  onMasterVolumeChange,
  onMasterMuteToggle,
  onMasterLimiterToggle,
  onExport,
  onSeek,
}: AppTransportBarProps) {
  const currentTime = (playheadPct / 100) * maxDuration;

  return (
    <div
      className="flex items-center gap-2xs rounded-2xl border border-border/60 bg-chrome/90 px-md py-2 shadow-elevation-sm backdrop-blur-xl sm:gap-sm sm:px-lg"
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
          "flex h-9 w-9 items-center justify-center rounded-full border transition shrink-0",
          isPlaying
            ? "border-info-400/60 bg-info-500/20 text-info-200 shadow-[0_0_12px_rgba(0,220,255,0.3)]"
            : "border-border bg-muted text-secondary-foreground hover:bg-muted",
          !playbackReady && "opacity-40",
        )}
      >
        {isPlaying ? <Square className="h-3 w-3" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
      </button>

      {/* Loop */}
      <button
        type="button"
        onClick={onLoopToggle}
        disabled={!playbackReady}
        aria-label={loopEnabled ? "Disable loop" : "Enable loop"}
        aria-pressed={loopEnabled}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg border transition shrink-0",
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
        className="font-mono text-sm font-light tracking-wider text-info-300/90 tabular-nums min-w-[3.5rem] shrink-0"
        aria-label="Current playback time"
        aria-live="off"
      >
        {formatTimecode(currentTime)}
      </time>

      {/* Seek scrubber */}
      <input
        type="range"
        min={0}
        max={100}
        step={0.1}
        value={playheadPct}
        onChange={(e) => onSeek?.(Number(e.target.value))}
        disabled={!playbackReady}
        className={cn(
          "hidden sm:block h-1.5 w-full max-w-[200px] cursor-pointer appearance-none rounded-full bg-muted accent-info-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info-400/50",
          !playbackReady && "opacity-30",
        )}
        aria-label="Seek position"
      />

      {/* Spacer */}
      <div className="flex-1 min-w-[4px]" />

      {/* Master section */}
      <div className="flex items-center gap-2xs sm:gap-sm">
        {/* Master mute */}
        <button
          type="button"
          onClick={onMasterMuteToggle}
          disabled={!playbackReady}
          aria-label={masterMuted ? "Unmute master" : "Mute master"}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg border transition shrink-0",
            masterMuted
              ? "border-destructive-400/40 bg-destructive-500/15 text-destructive-300"
              : "border-border bg-muted text-muted-foreground hover:text-foreground",
            !playbackReady && "opacity-40",
          )}
        >
          {masterMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>

        {/* Master volume */}
        <div className="hidden sm:flex items-center gap-1 min-w-0">
          <input
            type="range"
            min={0}
            max={150}
            step={1}
            value={Math.round(masterVolume * 100)}
            onChange={(e) => onMasterVolumeChange(Number(e.target.value) / 100)}
            disabled={!playbackReady}
            className="h-1.5 w-20 cursor-pointer appearance-none rounded-full bg-muted accent-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
            aria-label="Master volume"
          />
          <span className="text-meta text-muted-foreground tabular-nums w-8 text-right shrink-0">
            {Math.round(masterVolume * 100)}%
          </span>
        </div>

        {/* Limiter toggle */}
        <button
          type="button"
          onClick={onMasterLimiterToggle}
          disabled={!playbackReady}
          aria-label={masterLimiterEnabled ? "Disable limiter" : "Enable limiter"}
          aria-pressed={masterLimiterEnabled}
          className={cn(
            "hidden sm:flex h-7 items-center rounded-md border px-2 text-meta font-medium uppercase tracking-wider transition shrink-0",
            masterLimiterEnabled
              ? "border-primary-400/40 bg-primary-500/15 text-primary-200"
              : "border-border bg-muted text-muted-foreground",
            !playbackReady && "opacity-40",
          )}
        >
          Lim
        </button>
      </div>

      {/* Export */}
      {onExport ? (
        <button
          type="button"
          onClick={onExport}
          disabled={!playbackReady || isExporting}
          className={cn(
            "flex items-center gap-1 rounded-lg border px-sm py-1 text-xs font-semibold transition shrink-0",
            playbackReady && !isExporting
              ? "border-primary-400/50 bg-primary-500/20 text-primary-100 hover:bg-primary-500/30"
              : "border-border bg-muted text-muted-foreground opacity-50",
          )}
          aria-label={isExporting ? "Exporting mix" : "Export mix"}
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          {isExporting ? "Exporting\u2026" : "Export"}
        </button>
      ) : null}
    </div>
  );
}
