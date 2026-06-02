/**
 * MultiStemEditor — unified waveform editor showing all stems in one timeline.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SetStateAction,
} from "react";
import { Grid, LayoutList, Play, Repeat, Square, ZoomIn, ZoomOut } from "lucide-react";

import type { StemDefinition, TrimState } from "../types";
import type { BeatGridMetadata } from "../api";
import { cn } from "../utils/cn";
import { useTimelineViewport } from "../hooks/useTimelineViewport";
import { usePinchZoom } from "../hooks/usePinchZoom";
import { defaultStemState, type StemEditorState } from "../stem-editor-state";
import { computeBeatGridPcts, shouldRenderBeatGrid } from "../utils/beatGrid";
import { TimelineRuler } from "./multi-stem-editor/timeline-ruler.component";
import { WaveformTimeline } from "./multi-stem-editor/waveform-timeline.component";
import { StemTabs } from "./multi-stem-editor/stem-tabs.component";
import { StemControls } from "./multi-stem-editor/stem-controls.component";
import { MixerConsole } from "./multi-stem-editor/mixer-console.component";
import { MixerStrips } from "./multi-stem-editor/mixer-strips.component";
import {
  TimelineScrollControl,
  scrollPctToCenterPlayhead,
} from "./multi-stem-editor/TimelineScrollControl";
import {
  installTimelinePerformanceDebugHooks,
  isTimelinePerformanceEnabled,
  recordTimelinePerformanceSample,
} from "../utils/timelinePerformance";
import type { SeekPhase } from "../types/playbackSeek";
import { StemProcessingPanel, StemProcessingToolbar } from "./multi-stem-editor/stem-processing-panel.component";

export interface MultiStemEditorProps {
  stems: StemDefinition[];
  /** 2 or 4 when split result is loaded (for mixer layout badge). */
  splitStemCount?: 2 | 4 | null;
  waveforms: Record<string, number[]>;
  durations: Record<string, number>;
  stemStates: Record<string, StemEditorState>;
  isPlaying: boolean;
  playheadPct: number;
  isLoadingStems: boolean;
  /** False until stem AudioBuffers are decoded — avoids play/mix tools that cannot output sound yet. */
  playbackReady?: boolean;
  /** Optional beat-grid metadata from backend BPM analysis. */
  beatGrid?: BeatGridMetadata | null;
  onStemStateChange: (
    stemId: string,
    next: Partial<StemEditorState>,
  ) => void;
  onSeek: (pct: number, opts?: { phase?: SeekPhase }) => void;
  onPlayPause: () => void;
  onPreviewStem: (stemId: string) => void;
  playingStemId: string | null;
  loadingPreviewStemId: string | null;
  activeStemId?: string;
  onActiveStemChange?: (stemId: string) => void;
  /** Optional: time-domain analyser getter for live waveform modulation (master bus). */
  getAnalyserData?: () => Uint8Array | null;
  /** Optional: per-stem time-domain analyser for lanes and channel meters. */
  getStemAnalyserTimeDomainData?: (stemId: string) => Uint8Array | null;
  /** Whether loop playback is enabled. */
  loopEnabled?: boolean;
  /** Callback to toggle loop playback. */
  onLoopToggle?: (enabled: boolean) => void;
  onResetSingleStem?: (stemId: string) => void;
}

const MIXER_STRIPS_KEY = "bb-prefer-mixer-strips";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function MultiStemEditor({
  stems,
  splitStemCount = null,
  waveforms,
  durations,
  stemStates,
  isPlaying,
  playheadPct,
  isLoadingStems,
  playbackReady = false,
  beatGrid,
  onStemStateChange,
  onSeek,
  onPlayPause,
  onPreviewStem,
  playingStemId,
  loadingPreviewStemId,
  activeStemId: controlledActiveStemId,
  onActiveStemChange,
  getAnalyserData: _getAnalyserData,
  getStemAnalyserTimeDomainData,
  loopEnabled = false,
  onLoopToggle,
  onResetSingleStem,
}: MultiStemEditorProps) {
  const [activePanel, setActivePanel] = useState<
    "pitch" | "eq" | "amplitude" | "time" | "fx" | null
  >(null);
  const [mixerConsoleOpen, setMixerConsoleOpen] = useState(false);
  const [showBeatGrid, setShowBeatGrid] = useState(false);
  const [userStripsPref, setUserStripsPref] = useState<boolean | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem(MIXER_STRIPS_KEY);
    if (stored === null) return null;
    return stored === "1";
  });
  const showMixerStrips =
    userStripsPref ?? (stems.length > 0 && playbackReady);
  const [internalActiveStemId, setInternalActiveStemId] = useState<string | null>(
    stems[0]?.id ?? null,
  );

  const activeStemId = controlledActiveStemId ?? internalActiveStemId;

  const setActiveStemId = useCallback(
    (id: string) => {
      setInternalActiveStemId(id);
      onActiveStemChange?.(id);
    },
    [onActiveStemChange],
  );

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
    [setZoomBase],
  );

  const setScrollPct = useCallback(
    (value: SetStateAction<number>) => {
      const start = performance.now();
      setScrollPctBase(value);
      recordTimelinePerformanceSample("scroll", performance.now() - start);
    },
    [setScrollPctBase],
  );

  // Pinch-to-zoom and two-finger pan for touch devices
  const pinchZoomRef = usePinchZoom({
    zoom,
    setZoom,
    scrollPct,
    setScrollPct,
    minZoom: 1,
    maxZoom: 8,
  });

  useEffect(() => {
    if (!isTimelinePerformanceEnabled()) return;
    return installTimelinePerformanceDebugHooks();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset panel when playback stops
    if (!playbackReady) setActivePanel(null);
  }, [playbackReady]);

  // Keep active stem valid when stems change
  useEffect(() => {
    if (
      stems.length > 0 &&
      activeStemId &&
      !stems.some((s) => s.id === activeStemId)
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync active stem with available stems
      setActiveStemId(stems[0].id);
    }
  }, [stems, activeStemId, setActiveStemId]);

  const activeStem = useMemo(
    () => stems.find((s) => s.id === activeStemId),
    [stems, activeStemId],
  );
  const resolvedActiveStemId = useMemo(
    () => activeStem?.id ?? stems[0]?.id ?? "",
    [activeStem, stems],
  );
  const activeState = activeStem
    ? stemStates[activeStem.id] ?? defaultStemState()
    : defaultStemState();
  const activeDuration = activeStem ? (durations[activeStem.id] ?? 0) : 0;

  const maxDuration = useMemo(
    () => Math.max(...stems.map((s) => durations[s.id] ?? 0), 0),
    [stems, durations],
  );

  const ticks = useMemo(() => {
    const count = 8;
    return Array.from({ length: count + 1 }, (_, i) => {
      const pct = i / count;
      const visStart = scrollPct / 100;
      const visEnd = Math.min(1, visStart + 1 / zoom);
      const timePct = visStart + pct * (visEnd - visStart);
      return { pct: pct * 100, time: timePct * maxDuration };
    });
  }, [scrollPct, zoom, maxDuration]);

  const beatGridPcts = useMemo(() => {
    if (!showBeatGrid || !shouldRenderBeatGrid(beatGrid)) return [];
    return computeBeatGridPcts({
      beatGrid: beatGrid as BeatGridMetadata,
      maxDuration,
      scrollPct,
      zoom,
    });
  }, [showBeatGrid, beatGrid, maxDuration, scrollPct, zoom]);

  const playheadVisiblePct =
    clamp(
      (playheadPct / 100 - visibleStartGlobal) / visibleRangeGlobal,
      0,
      1,
    ) * 100;

  const isAnalyserOutputActive =
    isPlaying || playingStemId !== null;

  const handleTrimChange = useCallback(
    (stemId: string, t: TrimState) =>
      onStemStateChange(stemId, { trim: t }),
    [onStemStateChange],
  );
  const handleActivate = useCallback(
    (stemId: string) => setActiveStemId(stemId),
    [setActiveStemId],
  );

  const instrumentedOnSeek = useCallback(
    (pct: number, opts?: { phase?: SeekPhase }) => {
      const start = performance.now();
      onSeek(pct, opts);
      recordTimelinePerformanceSample(
        isPlaying ? "seekDuringMix" : "seek",
        performance.now() - start,
      );
    },
    [onSeek, isPlaying],
  );

  useEffect(() => {
    if (userStripsPref !== null) return;
    if (stems.length === 0 || !playbackReady) return;
    localStorage.setItem(MIXER_STRIPS_KEY, "1");
  }, [userStripsPref, stems.length, playbackReady]);

  const toggleMixerStrips = useCallback(() => {
    const next = !showMixerStrips;
    localStorage.setItem(MIXER_STRIPS_KEY, next ? "1" : "0");
    setUserStripsPref(next);
  }, [showMixerStrips]);

  const centerPlayhead = useCallback(() => {
    setScrollPct(scrollPctToCenterPlayhead(playheadPct, zoom, maxScrollPct));
  }, [playheadPct, zoom, maxScrollPct, setScrollPct]);

  if (stems.length === 0) return null;

  return (
    <div className="flex flex-col gap-md rounded-2xl border border-border bg-muted p-md">
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
            onClick={() => setZoom((z) => Math.max(1, z / 1.5))}
            disabled={zoom <= 1}
            aria-label="Zoom out"
            className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="px-1 text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(8, z * 1.5))}
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
              onClick={() => setShowBeatGrid((v) => !v)}
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
          onClick={toggleMixerStrips}
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
            onScrollChange={setScrollPct}
            onCenterPlayhead={centerPlayhead}
          />
        )}

        <StemProcessingToolbar
          activePanel={activePanel}
          playbackReady={playbackReady}
          onPanelChange={(id) => setActivePanel(id)}
        />

        {!import.meta.env.PROD && (
          <button
            type="button"
            onClick={() => setMixerConsoleOpen((open) => !open)}
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

      <TimelineRuler ticks={ticks} formatTime={formatTime} />

      <div
        ref={pinchZoomRef}
        className="relative flex gap-0 overflow-x-hidden overflow-y-visible rounded-xl touch-none"
        style={{ minHeight: activePanel ? 320 : undefined }}
      >
        <div
          className={cn(
            "min-w-0 flex-1 transition-all duration-300",
            activePanel ? "md:mr-72" : "",
          )}
        >
          <WaveformTimeline
            stems={stems}
            waveforms={waveforms}
            durations={durations}
            stemStates={stemStates}
            isLoadingStems={isLoadingStems}
            zoom={zoom}
            scrollPct={scrollPct}
            activeStemId={resolvedActiveStemId}
            playheadVisiblePct={playheadVisiblePct}
            showPlayhead={playheadPct > 0}
            isPlaying={isAnalyserOutputActive}
            getStemAnalyserTimeDomainData={getStemAnalyserTimeDomainData}
            tickPcts={ticks.map((t) => t.pct)}
            beatGridPcts={beatGridPcts}
            beatGrid={beatGrid}
            onTrimChange={handleTrimChange}
            onSeek={instrumentedOnSeek}
            onActivate={handleActivate}
            onStemStateChange={onStemStateChange}
          />
        </div>

        {activePanel && activeStem && (
          <div className="absolute inset-x-0 top-0 z-20 md:inset-x-auto md:right-0 md:w-72 animate-in slide-in-from-right duration-300">
            <StemProcessingPanel
              activePanel={activePanel}
              stems={stems}
              activeStem={activeStem}
              activeState={activeState}
              activeStemId={resolvedActiveStemId}
              stemStates={stemStates}
              onStemStateChange={onStemStateChange}
              onActiveStemChange={setActiveStemId}
              onClose={() => setActivePanel(null)}
            />
          </div>
        )}
      </div>
      <StemTabs
        stems={stems}
        activeStemId={resolvedActiveStemId}
        stemStates={stemStates}
        onSelectStem={setActiveStemId}
      />

      {activeStem && !showMixerStrips && (
        <StemControls
          stem={activeStem}
          state={activeState}
          duration={activeDuration}
          audioReady={activeDuration > 0 || !isLoadingStems}
          isPreviewPlaying={playingStemId === activeStem.id}
          isLoadingPreview={loadingPreviewStemId === activeStem.id}
          onStemStateChange={onStemStateChange}
          onPreviewStem={onPreviewStem}
        />
      )}

      {/* ── Mixer Strips View ── */}
      {showMixerStrips && (
        <MixerStrips
          onResetSingleStem={onResetSingleStem}
          stems={stems}
          stemLayout={splitStemCount}
          stemStates={stemStates}
          activeStemId={resolvedActiveStemId}
          playbackReady={playbackReady}
          isLoadingStems={isLoadingStems}
          isPlayingMix={isPlaying}
          playingStemId={playingStemId}
          loadingPreviewStemId={loadingPreviewStemId}
          getStemAnalyserTimeDomainData={getStemAnalyserTimeDomainData}
          onStemStateChange={onStemStateChange}
          onPreviewStem={onPreviewStem}
          onActiveStemChange={setActiveStemId}
        />
      )}

      {!import.meta.env.PROD && mixerConsoleOpen && (
        <div id="mixer-console-panel">
          <MixerConsole
            stems={stems}
            stemStates={stemStates}
            playheadPct={playheadPct}
            isPlaying={isPlaying}
            playingStemId={playingStemId}
            activeStemId={resolvedActiveStemId}
          />
        </div>
      )}
    </div>
  );
}