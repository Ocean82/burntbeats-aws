import {
  Download,
  Pause,
  Play,
  Repeat,
  SkipBack,
  Square,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { LAYOUT } from "@/constants/layout";
import { cn } from "@/utils/cn";

export interface TransportBarProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onStop: () => void;
  onRewind: () => void;
  onSeek?: (position: number) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  loopEnabled: boolean;
  onLoopToggle: () => void;
  onExport?: () => void;
  disabled?: boolean;
}

export function TransportBar({
  isPlaying,
  onPlayPause,
  onStop,
  onRewind,
  onSeek,
  zoom,
  onZoomIn,
  onZoomOut,
  loopEnabled,
  onLoopToggle,
  onExport,
  disabled = false,
}: TransportBarProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex items-center gap-2 px-3",
        "rounded-2xl backdrop-blur-md",
        "bg-neutral-900/75 border border-white/10",
        disabled && "pointer-events-none opacity-50",
      )}
      style={{
        height: `${LAYOUT.TRANSPORT_HEIGHT}px`,
        borderRadius: `${LAYOUT.PANEL_BORDER_RADIUS}px`,
      }}
      role="toolbar"
      aria-label="Transport controls"
    >
      {/* Playback controls */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onRewind}
          disabled={disabled}
          aria-label="Rewind"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            "text-neutral-300 hover:text-white hover:bg-white/10",
            "transition disabled:opacity-30",
          )}
        >
          <SkipBack className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onPlayPause}
          disabled={disabled}
          aria-label={isPlaying ? "Pause" : "Play"}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            "transition",
            isPlaying
              ? "bg-primary-500/20 text-primary-100 hover:bg-primary-500/30"
              : "text-neutral-300 hover:text-white hover:bg-white/10",
            "disabled:opacity-30",
          )}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </button>

        <button
          type="button"
          onClick={onStop}
          disabled={disabled}
          aria-label="Stop"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            "text-neutral-300 hover:text-white hover:bg-white/10",
            "transition disabled:opacity-30",
          )}
        >
          <Square className="h-4 w-4" />
        </button>
      </div>

      {/* Seek scrubber */}
      {onSeek && (
        <div className="flex-1 mx-2">
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            defaultValue={0}
            onChange={(e) => onSeek(Number(e.target.value))}
            disabled={disabled}
            aria-label="Seek position"
            className="w-full h-1 appearance-none rounded-full bg-white/20 accent-primary-400 cursor-pointer"
          />
        </div>
      )}

      {/* Zoom controls */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onZoomOut}
          disabled={disabled || zoom <= 1}
          aria-label="Zoom out"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            "text-neutral-300 hover:text-white hover:bg-white/10",
            "transition disabled:opacity-30",
          )}
        >
          <ZoomOut className="h-4 w-4" />
        </button>

        <span className="min-w-[3rem] text-center text-xs text-neutral-300 tabular-nums">
          {Math.round(zoom * 100)}%
        </span>

        <button
          type="button"
          onClick={onZoomIn}
          disabled={disabled || zoom >= 8}
          aria-label="Zoom in"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            "text-neutral-300 hover:text-white hover:bg-white/10",
            "transition disabled:opacity-30",
          )}
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>

      {/* Loop toggle */}
      <button
        type="button"
        onClick={onLoopToggle}
        disabled={disabled}
        aria-label={loopEnabled ? "Disable loop" : "Enable loop"}
        aria-pressed={loopEnabled}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg transition",
          loopEnabled
            ? "bg-primary-500/20 text-primary-100"
            : "text-neutral-300 hover:text-white hover:bg-white/10",
          "disabled:opacity-30",
        )}
      >
        <Repeat className="h-4 w-4" />
      </button>

      {/* Export */}
      {onExport && (
        <button
          type="button"
          onClick={onExport}
          disabled={disabled}
          aria-label="Export"
          className={cn(
            "ml-auto flex h-8 w-8 items-center justify-center rounded-lg",
            "text-neutral-300 hover:text-white hover:bg-white/10",
            "transition disabled:opacity-30",
          )}
        >
          <Download className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
