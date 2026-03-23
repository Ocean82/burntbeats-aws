/**
 * MultiStemEditor — unified waveform editor showing all stems in one timeline.
 */
import { useCallback, useEffect, useMemo, useState, type SetStateAction } from "react";
import { Play, RotateCcw, Square, Terminal, ZoomIn, ZoomOut } from "lucide-react";
import type { StemDefinition, TrimState } from "../types";
import { cn } from "../utils/cn";
import { useTimelineViewport } from "../hooks/useTimelineViewport";
import { defaultStemState, type StemEditorState } from "../stem-editor-state";
import { StemControls } from "./multi-stem-editor/stem-controls.component";
import { TimelineRuler } from "./multi-stem-editor/timeline-ruler.component";
import { StemTabs } from "./multi-stem-editor/stem-tabs.component";
import { WaveformTimeline } from "./multi-stem-editor/waveform-timeline.component";
import { MixerConsole } from "./multi-stem-editor/mixer-console.component";
import {
  installTimelinePerformanceDebugHooks,
  isTimelinePerformanceEnabled,
  recordTimelinePerformanceSample,
} from "../utils/timelinePerformance";

export interface MultiStemEditorProps {
  stems: StemDefinition[];
  waveforms: Record<string, number[]>;
  durations: Record<string, number>;
  stemStates: Record<string, StemEditorState>;
  isPlaying: boolean;
  playheadPct: number;
  isLoadingStems: boolean;
  onStemStateChange: (stemId: string, next: Partial<StemEditorState>) => void;
  onSeek: (pct: number) => void;
  onPlayPause: () => void;
  onPreviewStem: (stemId: string) => void;
  playingStemId: string | null;
  activeStemId?: string;
  onActiveStemChange?: (stemId: string) => void;
  /** Optional: time-domain analyser getter for live waveform modulation. */
  getAnalyserData?: () => Uint8Array | null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function MultiStemEditor({
  stems,
  waveforms,
  durations,
  stemStates,
  isPlaying,
  playheadPct,
  isLoadingStems,
  onStemStateChange,
  onSeek,
  onPlayPause,
  onPreviewStem,
  playingStemId,
  activeStemId: controlledActiveStemId,
  onActiveStemChange,
  getAnalyserData,
}: MultiStemEditorProps) {
  const [mixerConsoleOpen, setMixerConsoleOpen] = useState(false);
  const [internalActiveStemId, setInternalActiveStemId] = useState<string>(stems[0]?.id ?? "");
  const activeStemId = controlledActiveStemId ?? internalActiveStemId;
  const setActiveStemId = useCallback((id: string) => {
    setInternalActiveStemId(id);
    onActiveStemChange?.(id);
  }, [onActiveStemChange]);
  const {
    zoom,
    setZoom: setZoomBase,
    scrollPct,
    setScrollPct: setScrollPctBase,
    maxScrollPct,
    visibleStart: visibleStartGlobal,
    visibleRange: visibleRangeGlobal,
  } = useTimelineViewport(1, 8, 1);

  const setZoom = useCallback(
    (value: SetStateAction<number>) => {
      const start = performance.now();
      setZoomBase(value);
      recordTimelinePerformanceSample("zoom", performance.now() - start);
    },
    [setZoomBase]
  );

  const setScrollPct = useCallback(
    (value: SetStateAction<number>) => {
      const start = performance.now();
      setScrollPctBase(value);
      recordTimelinePerformanceSample("scroll", performance.now() - start);
    },
    [setScrollPctBase]
  );

  useEffect(() => {
    if (!isTimelinePerformanceEnabled()) return undefined;
    return installTimelinePerformanceDebugHooks();
  }, []);

  // Keep activeStemId valid when stems change
  useEffect(() => {
    if (stems.length > 0 && !stems.find((s) => s.id === activeStemId)) {
      setActiveStemId(stems[0].id);
    }
  }, [stems, activeStemId]);

  const activeStem = stems.find((s) => s.id === activeStemId) ?? stems[0];
  const activeState = activeStem ? (stemStates[activeStem.id] ?? defaultStemState()) : defaultStemState();
  const activeDuration = activeStem ? (durations[activeStem.id] ?? 0) : 0;

  const maxDuration = Math.max(...stems.map((s) => durations[s.id] ?? 0), 0);

  // Ruler ticks — memoized so they don't recompute on playhead ticks
  const ticks = useMemo(() => {
    const tickCount = 8;
    return Array.from({ length: tickCount + 1 }, (_, i) => {
      const pct = i / tickCount;
      const visStart = scrollPct / 100;
      const visEnd = Math.min(1, visStart + 1 / zoom);
      const timePct = visStart + pct * (visEnd - visStart);
      return { pct: pct * 100, time: timePct * maxDuration };
    });
  }, [scrollPct, zoom, maxDuration]);

  // Global playhead overlay position — computed once, not per-lane
  // This prevents waveform bars from re-rendering on every playhead tick
  const playheadVisiblePct = clamp(
    (playheadPct / 100 - visibleStartGlobal) / visibleRangeGlobal,
    0, 1
  ) * 100;
  // Show playhead while paused too, so click/seek has visible feedback.
  const showPlayhead = playheadPct > 0;

  /** Gate waveform analyser modulation: master mix *or* single-stem preview (matches master VU row). */
  const isAnalyserOutputActive = isPlaying || playingStemId !== null;

  const handleTrimChange = useCallback(
    (stemId: string, t: TrimState) => onStemStateChange(stemId, { trim: t }),
    [onStemStateChange]
  );
  const handleActivate = useCallback((stemId: string) => setActiveStemId(stemId), [setActiveStemId]);

  const instrumentedOnSeek = useCallback(
    (pct: number) => {
      const start = performance.now();
      onSeek(pct);
      const category = isPlaying ? "seekDuringMix" : "seek";
      recordTimelinePerformanceSample(category, performance.now() - start);
    },
    [onSeek, isPlaying]
  );

  if (stems.length === 0) return null;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/25 p-4">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={onPlayPause}
          disabled={Object.keys(stemStates).length === 0}
          aria-label={isPlaying ? "Stop mix" : "Play mix"}
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition",
            isPlaying
              ? "border-amber-400/50 bg-amber-500/20 text-amber-100"
              : "border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
          )}
        >
          {isPlaying ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {isPlaying ? "Stop" : "Play mix"}
        </button>

        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/20">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1, z / 1.5))}
            disabled={zoom <= 1}
            aria-label="Zoom out"
            className="flex h-8 w-8 items-center justify-center text-white/60 hover:text-white disabled:opacity-30 transition"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="px-1 text-xs text-white/50" aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(8, z * 1.5))}
            disabled={zoom >= 8}
            aria-label="Zoom in"
            className="flex h-8 w-8 items-center justify-center text-white/60 hover:text-white disabled:opacity-30 transition"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>

        {zoom > 1 && (
          <input
            type="range"
            min={0}
            max={maxScrollPct}
            step={0.5}
            value={scrollPct}
            onChange={(e) => setScrollPct(Number(e.target.value))}
            className="w-32"
            aria-label="Scroll timeline"
          />
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMixerConsoleOpen((open) => !open)}
            aria-expanded={mixerConsoleOpen}
            aria-controls="mixer-console-panel"
            className={cn(
              "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition",
              mixerConsoleOpen
                ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
                : "border-white/10 bg-white/5 text-white/60 hover:text-white"
            )}
          >
            <Terminal className="h-3.5 w-3.5" aria-hidden />
            Console
          </button>
          <button
            type="button"
            onClick={() => { setZoom(1); setScrollPct(0); }}
            aria-label="Reset zoom and scroll"
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:text-white transition"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset view
          </button>
        </div>
      </div>

      <TimelineRuler ticks={ticks} formatTime={formatTime} />

      <WaveformTimeline
        stems={stems}
        waveforms={waveforms}
        stemStates={stemStates}
        isLoadingStems={isLoadingStems}
        zoom={zoom}
        scrollPct={scrollPct}
        activeStemId={activeStemId}
        playheadVisiblePct={playheadVisiblePct}
        showPlayhead={showPlayhead}
        isPlaying={isAnalyserOutputActive}
        getAnalyserData={getAnalyserData}
        onTrimChange={handleTrimChange}
        onSeek={instrumentedOnSeek}
        onActivate={handleActivate}
        onStemStateChange={onStemStateChange}
      />

      <StemTabs stems={stems} activeStemId={activeStemId} stemStates={stemStates} onSelectStem={setActiveStemId} />

      {mixerConsoleOpen && (
        <div id="mixer-console-panel">
          <MixerConsole
            stems={stems}
            stemStates={stemStates}
            playheadPct={playheadPct}
            isPlaying={isPlaying}
            playingStemId={playingStemId}
            activeStemId={activeStemId}
          />
        </div>
      )}

      {/* ── Active stem controls ── */}
      {activeStem && (
        <StemControls
          stem={activeStem}
          state={activeState}
          duration={activeDuration}
          isPreviewPlaying={playingStemId === activeStem.id}
          onStemStateChange={onStemStateChange}
          onPreviewStem={onPreviewStem}
        />
      )}
    </div>
  );
}

export { defaultStemState, getStemEffectiveRate, type StemEditorState } from "../stem-editor-state";
