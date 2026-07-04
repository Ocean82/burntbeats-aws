import { useCallback, useEffect, useState } from "react";
import {
  Download,
  Pause,
  Play,
  Repeat,
  Settings2,
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
  /** Whether the workspace is in advanced (full mixer/tools) mode. */
  advancedMode?: boolean;
  /** Toggle advanced mode on/off. */
  onToggleAdvanced?: () => void;
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
  advancedMode = false,
  onToggleAdvanced,
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

        <span className="min-w-[3rem] text-center text-xs font-mono text-neutral-300 tabular-nums">
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

      {/* Advanced mode toggle — reveals mixer, EQ, FX, and tool sidebar */}
      {onToggleAdvanced && (
        <MixerToggleWithHint
          advancedMode={advancedMode}
          onToggleAdvanced={onToggleAdvanced}
        />
      )}

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

/* ─── Mixer Toggle with First-Time Hint ─────────────────────────── */

function MixerToggleWithHint({
  advancedMode,
  onToggleAdvanced,
}: {
  advancedMode: boolean;
  onToggleAdvanced: () => void;
}) {
  const [showHint, setShowHint] = useState(() => {
    if (typeof window === "undefined") return false;
    return !localStorage.getItem("bb-mixer-hint-dismissed");
  });

  // Auto-dismiss hint after 6 seconds
  useEffect(() => {
    if (!showHint) return;
    const timer = setTimeout(() => {
      setShowHint(false);
      localStorage.setItem("bb-mixer-hint-dismissed", "1");
    }, 6000);
    return () => clearTimeout(timer);
  }, [showHint]);

  const handleClick = useCallback(() => {
    if (showHint) {
      setShowHint(false);
      localStorage.setItem("bb-mixer-hint-dismissed", "1");
    }
    onToggleAdvanced();
  }, [showHint, onToggleAdvanced]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        aria-label={advancedMode ? "Switch to simple view" : "Show mixer & tools"}
        aria-pressed={advancedMode}
        title={advancedMode ? "Simple view" : "Mixer & tools"}
        className={cn(
          "flex h-8 items-center gap-1 rounded-lg px-2 transition text-xs font-medium",
          advancedMode
            ? "bg-primary-500/20 text-primary-100 border border-primary-500/40"
            : "text-neutral-400 hover:text-white hover:bg-white/10 border border-transparent",
        )}
      >
        <Settings2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">
          {advancedMode ? "Simple" : "Mixer"}
        </span>
      </button>

      {/* First-time tooltip */}
      {showHint && !advancedMode && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-30 whitespace-nowrap rounded-lg border border-primary-400/30 bg-[hsl(220,15%,12%)] px-3 py-1.5 text-[11px] text-primary-100 shadow-lg animate-in fade-in slide-in-from-top-1"
          role="tooltip"
        >
          Tap for EQ, effects & mixer tools
          <span className="absolute -top-1 left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 border-l border-t border-primary-400/30 bg-[hsl(220,15%,12%)]" />
        </div>
      )}
    </div>
  );
}
