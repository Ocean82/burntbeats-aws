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
import type { StemEditorState } from "../../stem-editor-state";
import { computeBeatGridPcts, shouldRenderBeatGrid } from "../../utils/beatGrid";
import { TimelineRuler } from "../multi-stem-editor/timeline-ruler.component";
import { WaveformTimeline } from "../multi-stem-editor/waveform-timeline.component";
import { DjMixerConsole } from "./DjMixerConsole";
import { DjTransportBar } from "./DjTransportBar";
import { DjToolbarSettings } from "./DjToolbarSettings";
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
  loopEnabled?: boolean;
  onLoopToggle?: (enabled: boolean) => void;
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
  // onPreviewStem — reserved for future DJ console preview buttons
  playingStemId,
  // loadingPreviewStemId — reserved for future DJ console preview buttons
  activeStemId: controlledActiveStemId,
  onActiveStemChange,
  getAnalyserData,
  loopEnabled = false,
  onLoopToggle,
}: DjModeEditorProps) {
  const [consoleCollapsed, setConsoleCollapsed] = useState(false);
  const [showBeatGrid, setShowBeatGrid] = useState(false);
  const [showToolbarSettings, setShowToolbarSettings] = useState(false);
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
    <div className="dj-mode-editor flex flex-col gap-0 rounded-2xl border border-white/[0.08] bg-black/60 overflow-hidden">
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
      />

      {/* ── Waveform Section (full width, taller lanes, dark bg) ── */}
      <div
        ref={pinchZoomRef}
        className="dj-waveform-section relative flex-1 bg-black/80 px-3 py-2 touch-none"
      >
        <TimelineRuler ticks={ticks} formatTime={formatTime} />
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
          getAnalyserData={getAnalyserData}
          tickPcts={ticks.map((t) => t.pct)}
          beatGridPcts={beatGridPcts}
          beatGrid={beatGrid}
          onTrimChange={handleTrimChange}
          onSeek={instrumentedOnSeek}
          onActivate={handleActivate}
          onStemStateChange={onStemStateChange}
        />
      </div>

      {/* ── Collapsible Mixer Console ── */}
      <div className="dj-console-section border-t border-white/[0.08]">
        {/* Console header — always visible */}
        <div className="flex items-center justify-between px-4 py-2 bg-black/50">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setConsoleCollapsed((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/50 hover:text-white transition"
              aria-label={consoleCollapsed ? "Expand mixer console" : "Collapse mixer console"}
            >
              {consoleCollapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Mixer Console
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowToolbarSettings((v) => !v)}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-white/40 hover:text-white transition",
              showToolbarSettings && "bg-white/10 text-white/70",
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
            onReorder={toolbarConfig.reorderSlots}
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
            visibleTools={toolbarConfig.visibleSlots}
            onStemStateChange={onStemStateChange}
            onActiveStemChange={setActiveStemId}
          />
        )}
      </div>
    </div>
  );
}
