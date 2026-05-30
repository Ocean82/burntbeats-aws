/**
 * DjModeEditor — DJ-style layout with full-width vibrant waveforms on top
 * and a collapsible mixer console at the bottom.
 *
 * This component wraps the same underlying components (WaveformTimeline,
 * ChannelStrip, etc.) but arranges them in a professional DJ controller layout.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SetStateAction,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  Settings,
} from "lucide-react";

import type { StemDefinition, TrimState } from "../../types";
import type { BeatGridMetadata } from "../../api";
import { cn } from "../../utils/cn";
import { useTimelineViewport } from "../../hooks/useTimelineViewport";
import { usePinchZoom } from "../../hooks/usePinchZoom";
import { defaultStemState, type StemEditorState } from "../../stem-editor-state";
import {
  StemProcessingPanel,
  StemProcessingToolbar,
  type StemProcessingPanelId,
} from "../multi-stem-editor/stem-processing-panel.component";
import { computeBeatGridPcts, shouldRenderBeatGrid } from "../../utils/beatGrid";
import { TimelineRuler } from "../multi-stem-editor/timeline-ruler.component";
import { WaveformTimeline } from "../multi-stem-editor/waveform-timeline.component";
import { DjMixerConsole } from "./DjMixerConsole";
import { DjTransportBar } from "./DjTransportBar";
import { DjToolbarSettings } from "./DjToolbarSettings";
import { SpectrumAnalyzer } from "../SpectrumAnalyzer";
import { MixerGenreQuickApply } from "../MixerGenreQuickApply";
import type { MixerPreset } from "../MixerPresetsModal";
import {
  recordTimelinePerformanceSample,
} from "../../utils/timelinePerformance";
import type { SeekPhase } from "../../types/playbackSeek";
import { useDjToolbarConfig } from "../../hooks/useDjToolbarConfig";

export interface DjModeEditorProps {
  stems: StemDefinition[];
  waveforms: Record<string, number[]>;
  durations: Record<string, number>;
  stemStates: Record<string, StemEditorState>;
  isPlaying: boolean;
  playheadPct: number;
  isLoadingStems: boolean;
  playbackReady?: boolean;
  beatGrid?: BeatGridMetadata | null;
  onStemStateChange: (stemId: string, next: Partial<StemEditorState>) => void;
  onSeek: (pct: number, opts?: { phase?: SeekPhase }) => void;
  onPlayPause: () => void;
  onPreviewStem: (stemId: string) => void;
  playingStemId: string | null;
  loadingPreviewStemId: string | null;
  activeStemId?: string;
  onActiveStemChange?: (stemId: string) => void;
  getAnalyserData?: () => Uint8Array | null;
  getStemAnalyserTimeDomainData?: (stemId: string) => Uint8Array | null;
  loopEnabled?: boolean;
  onLoopToggle?: (enabled: boolean) => void;
  masterVolume: number;
  masterMuted: boolean;
  masterLimiterEnabled: boolean;
  onMasterVolumeChange: (value: number) => void;
  onMasterMuteToggle: () => void;
  onMasterReset: () => void;
  onMasterLimiterEnabledChange: (enabled: boolean) => void;
  getMasterAnalyserTimeDomainData: () => Uint8Array | null;
  getMasterAnalyserTimeDomainDataLeft: () => Uint8Array | null;
  getMasterAnalyserTimeDomainDataRight: () => Uint8Array | null;
  getMasterAnalyserFrequencyData?: () => Uint8Array | null;
  onLoadGenrePreset?: (preset: MixerPreset) => void;
  isExporting?: boolean;
  onExport?: () => void;
  onCompareExport?: () => void;
  isComparingExport?: boolean;
  /** Recording state and callbacks. */
  isRecording?: boolean;
  recordingDuration?: number;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  onResetSingleStem?: (stemId: string) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function DjModeEditor({
  stems,
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
  getAnalyserData,
  getStemAnalyserTimeDomainData,
  loopEnabled = false,
  onLoopToggle,
  masterVolume,
  masterMuted,
  masterLimiterEnabled,
  onMasterVolumeChange,
  onMasterMuteToggle,
  onMasterReset,
  onMasterLimiterEnabledChange,
  getMasterAnalyserTimeDomainData,
  getMasterAnalyserTimeDomainDataLeft,
  getMasterAnalyserTimeDomainDataRight,
  getMasterAnalyserFrequencyData,
  onLoadGenrePreset,
  isExporting = false,
  onExport,
  onCompareExport,
  isComparingExport = false,
  isRecording = false,
  recordingDuration = 0,
  onStartRecording,
  onStopRecording,
  onResetSingleStem,
}: DjModeEditorProps) {
  const [consoleCollapsed, setConsoleCollapsed] = useState(false);
  const [showBeatGrid, setShowBeatGrid] = useState(false);
  const [showToolbarSettings, setShowToolbarSettings] = useState(false);
  const [activePanel, setActivePanel] = useState<StemProcessingPanelId | null>(null);
  const [internalActiveStemId, setInternalActiveStemId] = useState<string | null>(
    stems[0]?.id ?? null,
  );

  const toolbarConfig = useDjToolbarConfig();

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

  const pinchZoomRef = usePinchZoom({
    zoom,
    setZoom,
    scrollPct,
    setScrollPct,
    minZoom: 1,
    maxZoom: 8,
  });

  useEffect(() => {
    if (stems.length > 0 && activeStemId && !stems.some((s) => s.id === activeStemId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync active stem with available stems
      setActiveStemId(stems[0].id);
    }
  }, [stems, activeStemId, setActiveStemId]);

  const resolvedActiveStemId = useMemo(
    () => (activeStemId && stems.some((s) => s.id === activeStemId) ? activeStemId : stems[0]?.id ?? ""),
    [activeStemId, stems],
  );

  const activeStem = useMemo(
    () => stems.find((s) => s.id === resolvedActiveStemId),
    [stems, resolvedActiveStemId],
  );
  const activeState = activeStem
    ? stemStates[activeStem.id] ?? defaultStemState()
    : defaultStemState();

  useEffect(() => {
    if (!playbackReady) setActivePanel(null);
  }, [playbackReady]);

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
    clamp((playheadPct / 100 - visibleStartGlobal) / visibleRangeGlobal, 0, 1) * 100;

  const isAnalyserOutputActive = isPlaying || playingStemId !== null;

  const handleTrimChange = useCallback(
    (stemId: string, t: TrimState) => onStemStateChange(stemId, { trim: t }),
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
      recordTimelinePerformanceSample(isPlaying ? "seekDuringMix" : "seek", performance.now() - start);
    },
    [onSeek, isPlaying],
  );

  if (stems.length === 0) return null;

  return (
    <div className="dj-mode-editor flex flex-col gap-0 overflow-x-hidden rounded-2xl border border-border/[0.08] bg-secondary">
      {/* ── Transport Bar ── */}
      <DjTransportBar
        isPlaying={isPlaying}
        playbackReady={playbackReady}
        loopEnabled={loopEnabled}
        playheadPct={playheadPct}
        maxDuration={maxDuration}
        zoom={zoom}
        maxScrollPct={maxScrollPct}
        scrollPct={scrollPct}
        showBeatGrid={showBeatGrid}
        hasBeatGrid={shouldRenderBeatGrid(beatGrid)}
        onPlayPause={onPlayPause}
        onLoopToggle={onLoopToggle}
        onZoomIn={() => setZoom((z) => Math.min(8, z * 1.5))}
        onZoomOut={() => setZoom((z) => Math.max(1, z / 1.5))}
        onScrollChange={(v) => setScrollPct(v)}
        onBeatGridToggle={() => setShowBeatGrid((v) => !v)}
        isExporting={isExporting}
        exportReady={playbackReady}
        onExport={onExport}
        onCompareExport={onCompareExport}
        isComparingExport={isComparingExport}
        isRecording={isRecording}
        recordingDuration={recordingDuration}
        onStartRecording={onStartRecording}
        onStopRecording={onStopRecording}
      />

      {/* ── Stem processing tools (pitch / EQ / time / FX) ── */}
      <div className="flex flex-wrap items-center gap-xs border-b border-border/[0.06] bg-chrome px-sm py-xs">
        <StemProcessingToolbar
          activePanel={activePanel}
          playbackReady={playbackReady}
          onPanelChange={setActivePanel}
        />
      </div>

      {/* ── Waveform Section (full width, taller lanes, dark bg) ── */}
      <div
        ref={pinchZoomRef}
        className="dj-waveform-section relative flex min-h-0 flex-1 flex-col overflow-hidden bg-chrome px-sm py-xs touch-none"
      >
        <TimelineRuler ticks={ticks} formatTime={formatTime} />
        {activePanel && activeStem ? (
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
            className="z-20 max-h-[min(40vh,20rem)] w-full shrink-0 overflow-y-auto border-b border-border/60 bg-chrome md:hidden"
          />
        ) : null}
        <div
          className={cn(
            "relative min-h-[12rem] flex-1 transition-[margin] duration-300",
            activePanel ? "md:me-72" : "",
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
            getStemAnalyserTimeDomainData={
              getStemAnalyserTimeDomainData ??
              (getAnalyserData
                ? (_stemId: string) => getAnalyserData()
                : undefined)
            }
            tickPcts={ticks.map((t) => t.pct)}
            beatGridPcts={beatGridPcts}
            beatGrid={beatGrid}
            onTrimChange={handleTrimChange}
            onSeek={instrumentedOnSeek}
            onActivate={handleActivate}
            onStemStateChange={onStemStateChange}
          />
          {activePanel && activeStem ? (
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
              className="absolute inset-y-0 right-0 z-20 hidden w-72 overflow-y-auto border-l border-border/60 bg-chrome shadow-[-8px_0_24px_rgba(0,0,0,0.45)] md:block"
            />
          ) : null}
        </div>
      </div>

      {/* ── Collapsible Mixer Console ── */}
      <div className="dj-console-section overflow-visible border-t border-border/[0.08]">
        {/* Console header — always visible */}
        <div className="flex flex-wrap items-center justify-between gap-sm px-md py-xs bg-secondary">
          <div className="flex items-center gap-sm">
            <button
              type="button"
              onClick={() => setConsoleCollapsed((v) => !v)}
              className="flex items-center gap-xs text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
              aria-label={consoleCollapsed ? "Expand mixer console" : "Collapse mixer console"}
            >
              {consoleCollapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Mixer Console
            </button>
          </div>
          {onLoadGenrePreset && (
            <MixerGenreQuickApply onApply={onLoadGenrePreset} />
          )}
          {getMasterAnalyserFrequencyData && (
            <div className="hidden min-w-[140px] flex-1 sm:block lg:max-w-xs">
              <SpectrumAnalyzer
                getFrequencyData={getMasterAnalyserFrequencyData}
                isPlaying={isAnalyserOutputActive}
                height={36}
                barCount={48}
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowToolbarSettings((v) => !v)}
            className={cn(
              "flex items-center gap-2xs rounded-md px-xs py-1 text-[10px] text-muted-foreground hover:text-foreground transition",
              showToolbarSettings && "bg-muted text-secondary-foreground",
            )}
            aria-label="Configure mixer tools"
          >
            <Settings className="h-3 w-3" />
            Configure
          </button>
        </div>

        {/* Toolbar settings panel */}
        {showToolbarSettings && (
          <DjToolbarSettings
            slots={toolbarConfig.slots}
            onToggle={toolbarConfig.toggleSlot}
            onReset={toolbarConfig.resetSlots}
            onClose={() => setShowToolbarSettings(false)}
          />
        )}

        {/* Console content */}
        {!consoleCollapsed && (
          <DjMixerConsole
            stems={stems}
            stemStates={stemStates}
            activeStemId={resolvedActiveStemId}
            playbackReady={playbackReady}
            isPlaying={isPlaying}
            playingStemId={playingStemId}
            loadingPreviewStemId={loadingPreviewStemId}
            visibleTools={toolbarConfig.visibleSlots}
            getStemAnalyserTimeDomainData={getStemAnalyserTimeDomainData}
            onStemStateChange={onStemStateChange}
            onActiveStemChange={setActiveStemId}
            onPreviewStem={onPreviewStem}
            onResetSingleStem={onResetSingleStem}
            masterVolume={masterVolume}
            masterMuted={masterMuted}
            masterLimiterEnabled={masterLimiterEnabled}
            onMasterVolumeChange={onMasterVolumeChange}
            onMasterMuteToggle={onMasterMuteToggle}
            onMasterReset={onMasterReset}
            onMasterLimiterEnabledChange={onMasterLimiterEnabledChange}
            getMasterAnalyserTimeDomainData={getMasterAnalyserTimeDomainData}
            getMasterAnalyserTimeDomainDataLeft={getMasterAnalyserTimeDomainDataLeft}
            getMasterAnalyserTimeDomainDataRight={getMasterAnalyserTimeDomainDataRight}
          />
        )}
      </div>
    </div>
  );
}
