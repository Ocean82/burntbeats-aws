import { Grid, LayoutList, Play, Repeat, Square, ZoomIn, ZoomOut } from "lucide-react"

import type { BeatGridMetadata } from "../../api"
import { cn } from "../../utils/cn"
import { shouldRenderBeatGrid } from "../../utils/beatGrid"
import { StemProcessingToolbar } from "./stem-processing-panel.component"
import { TimelineScrollControl } from "./TimelineScrollControl"

export interface EditorTransportBarProps {
  isPlaying: boolean
  playbackReady: boolean
  loopEnabled: boolean
  onLoopToggle?: (enabled: boolean) => void
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  showBeatGrid: boolean
  onToggleBeatGrid: () => void
  beatGrid?: BeatGridMetadata | null
  showMixerStrips: boolean
  onToggleMixerStrips: () => void
  maxScrollPct: number
  scrollPct: number
  playheadPct: number
  onScrollChange: (next: number) => void
  onCenterPlayhead: () => void
  activePanel: "pitch" | "eq" | "amplitude" | "time" | "fx" | null
  onPanelChange: (next: "pitch" | "eq" | "amplitude" | "time" | "fx" | null) => void
  mixerConsoleOpen: boolean
  onToggleMixerConsole: () => void
  onPlayPause: () => void
}

export function EditorTransportBar({
  isPlaying,
  playbackReady,
  loopEnabled,
  onLoopToggle,
  zoom,
  onZoomIn,
  onZoomOut,
  showBeatGrid,
  onToggleBeatGrid,
  beatGrid,
  showMixerStrips,
  onToggleMixerStrips,
  maxScrollPct,
  scrollPct,
  playheadPct,
  onScrollChange,
  onCenterPlayhead,
  activePanel,
  onPanelChange,
  mixerConsoleOpen,
  onToggleMixerConsole,
  onPlayPause,
}: EditorTransportBarProps) {
  return (
    <div className="flex items-center gap-xs flex-wrap">
      <button
        type="button"
        onClick={onPlayPause}
        disabled={!playbackReady}
        aria-label={isPlaying ? "Stop mix" : "Play mix"}
        className={cn(
          "flex items-center gap-xs rounded-xl border px-md py-xs text-sm font-medium transition",
          isPlaying
            ? "border-primary-400/50 bg-primary-500/20 text-primary-100"
            : "border-border bg-muted text-secondary-foreground hover:bg-muted",
          !playbackReady && "opacity-40",
        )}
      >
        {isPlaying ? <Square /> : <Play />}
        {isPlaying ? "Stop" : "Play mix"}
      </button>

      <button
        type="button"
        onClick={() => onLoopToggle?.(!loopEnabled)}
        disabled={!playbackReady}
        aria-label={loopEnabled ? "Disable loop playback" : "Enable loop playback"}
        aria-pressed={loopEnabled}
        className={cn(
          "flex items-center gap-xs rounded-xl border px-sm py-xs text-sm font-medium transition",
          loopEnabled
            ? "border-primary-400/50 bg-primary-500/20 text-primary-100"
            : "border-border bg-muted text-muted-foreground hover:text-foreground hover:bg-muted",
          !playbackReady && "opacity-40",
        )}
      >
        <Repeat className="h-4 w-4" />
        Loop
      </button>

      <div className="flex items-center gap-2xs rounded-xl border border-border bg-muted">
        <button
          type="button"
          onClick={onZoomOut}
          disabled={zoom <= 1}
          aria-label="Zoom out"
          className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="px-1 text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={onZoomIn}
          disabled={zoom >= 8}
          aria-label="Zoom in"
          className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>

      {shouldRenderBeatGrid(beatGrid) && (
        <>
          <button
            type="button"
            onClick={onToggleBeatGrid}
            aria-label="Toggle beat grid"
            className={cn(
              "flex items-center gap-xs rounded-xl border px-sm py-1.5 text-xs transition",
              showBeatGrid
                ? "border-primary-400/40 bg-primary-500/15 text-primary-100"
                : "border-border bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            <Grid className="h-3.5 w-3.5" />
            Beat Grid
          </button>
          <span
            className="rounded-lg border border-border bg-muted px-xs py-1 font-mono text-meta tabular-nums text-muted-foreground"
            title={
              beatGrid && beatGrid.confidence < 0.7
                ? `BPM confidence ${Math.round(beatGrid.confidence * 100)}%`
                : undefined
            }
          >
            ♩ {Math.round(beatGrid!.bpm)} BPM
            {beatGrid && beatGrid.confidence < 0.7 && (
              <span className="ml-1 text-muted-foreground">~</span>
            )}
          </span>
        </>
      )}

      <button
        type="button"
        onClick={onToggleMixerStrips}
        aria-label="Toggle mixer strips view"
        className={cn(
          "flex items-center gap-xs rounded-xl border px-sm py-1.5 text-xs transition",
          showMixerStrips
            ? "border-primary-400/40 bg-primary-500/15 text-primary-100"
            : "border-border bg-muted text-muted-foreground hover:text-foreground",
          playbackReady && !showMixerStrips && "animate-pulse",
        )}
      >
        <LayoutList className="h-3.5 w-3.5" />
        Mixer
      </button>

      {zoom > 1 && (
        <TimelineScrollControl
          scrollPct={scrollPct}
          maxScrollPct={maxScrollPct}
          zoom={zoom}
          playheadPct={playheadPct}
          onScrollChange={onScrollChange}
          onCenterPlayhead={onCenterPlayhead}
        />
      )}

      <StemProcessingToolbar
        activePanel={activePanel}
        playbackReady={playbackReady}
        onPanelChange={(next) => onPanelChange(next)}
      />

      {!import.meta.env.PROD && (
        <button
          type="button"
          onClick={onToggleMixerConsole}
          aria-controls="mixer-console-panel"
          className={cn(
            "ml-auto flex items-center gap-xs rounded-xl border px-sm py-1.5 text-xs transition",
            mixerConsoleOpen
              ? "border-primary-400/40 bg-primary-500/15 text-primary-100"
              : "border-border bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          {mixerConsoleOpen ? "Hide Console" : "Show Console"}
        </button>
      )}
    </div>
  )
}
