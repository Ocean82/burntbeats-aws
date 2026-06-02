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

import type { StemDefinition, TrimState } from "../types";
import type { BeatGridMetadata } from "../api";
import { cn } from "../utils/cn";
import { useTimelineViewport } from "../hooks/useTimelineViewport";
import { usePinchZoom } from "../hooks/usePinchZoom";
import { useMultiStemEditorUiState } from "../hooks/editor/useMultiStemEditorUiState";
import { useTimelineMetrics } from "../hooks/editor/useTimelineMetrics";
import { defaultStemState, type StemEditorState } from "../stem-editor-state";
import { TimelineRuler } from "./multi-stem-editor/timeline-ruler.component";
import { WaveformTimeline } from "./multi-stem-editor/waveform-timeline.component";
import { StemTabs } from "./multi-stem-editor/stem-tabs.component";
import { StemControls } from "./multi-stem-editor/stem-controls.component";
import { MixerConsole } from "./multi-stem-editor/mixer-console.component";
import { MixerStrips } from "./multi-stem-editor/mixer-strips.component";
import {
  scrollPctToCenterPlayhead,
} from "./multi-stem-editor/TimelineScrollControl";
import { EditorTransportBar } from "./multi-stem-editor/editor-transport-bar.component";
import {
  installTimelinePerformanceDebugHooks,
  isTimelinePerformanceEnabled,
  recordTimelinePerformanceSample,
} from "../utils/timelinePerformance";
import type { SeekPhase } from "../types/playbackSeek";
import { StemProcessingPanel } from "./multi-stem-editor/stem-processing-panel.component";

const MIXER_STRIPS_KEY = "bb-prefer-mixer-strips";

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
  const {
    activePanel,
    setActivePanel,
    mixerConsoleOpen,
    setMixerConsoleOpen,
    showBeatGrid,
    setShowBeatGrid,
    userStripsPref,
    showMixerStrips,
    toggleMixerStrips,
  } = useMultiStemEditorUiState({
    stemCount: stems.length,
    playbackReady,
  });
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
    if (!playbackReady) setActivePanel(null);
  }, [playbackReady, setActivePanel]);

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

  const { ticks, beatGridPcts, playheadVisiblePct } = useTimelineMetrics({
    stems,
    durations,
    scrollPct,
    zoom,
    showBeatGrid,
    beatGrid,
    playheadPct,
    visibleStart: visibleStartGlobal,
    visibleRange: visibleRangeGlobal,
  });

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

  const centerPlayhead = useCallback(() => {
    setScrollPct(scrollPctToCenterPlayhead(playheadPct, zoom, maxScrollPct));
  }, [playheadPct, zoom, maxScrollPct, setScrollPct]);

  if (stems.length === 0) return null;

  return (
    <div className="flex flex-col gap-md rounded-2xl border border-border bg-muted p-md">
      <EditorTransportBar
        isPlaying={isPlaying}
        playbackReady={playbackReady}
        loopEnabled={loopEnabled}
        onLoopToggle={onLoopToggle}
        zoom={zoom}
        onZoomIn={() => setZoom((z) => Math.min(8, z * 1.5))}
        onZoomOut={() => setZoom((z) => Math.max(1, z / 1.5))}
        showBeatGrid={showBeatGrid}
        onToggleBeatGrid={() => setShowBeatGrid((v) => !v)}
        beatGrid={beatGrid}
        showMixerStrips={showMixerStrips}
        onToggleMixerStrips={toggleMixerStrips}
        maxScrollPct={maxScrollPct}
        scrollPct={scrollPct}
        playheadPct={playheadPct}
        onScrollChange={setScrollPct}
        onCenterPlayhead={centerPlayhead}
        activePanel={activePanel}
        onPanelChange={setActivePanel}
        mixerConsoleOpen={mixerConsoleOpen}
        onToggleMixerConsole={() => setMixerConsoleOpen((open) => !open)}
        onPlayPause={onPlayPause}
      />

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