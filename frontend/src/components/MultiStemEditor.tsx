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
import {
  Activity,
  Play,
  Sliders,
  Square,
  Timer,
  Waves,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import type { StemDefinition, TrimState } from "../types";
import { cn } from "../utils/cn";
import { useTimelineViewport } from "../hooks/useTimelineViewport";
import { defaultStemState, type StemEditorState } from "../stem-editor-state";
import { TimelineRuler } from "./multi-stem-editor/timeline-ruler.component";
import { WaveformTimeline } from "./multi-stem-editor/waveform-timeline.component";
import { StemTabs } from "./multi-stem-editor/stem-tabs.component";
import { StemControls } from "./multi-stem-editor/stem-controls.component";
import { MixerConsole } from "./multi-stem-editor/mixer-console.component";
import {
  installTimelinePerformanceDebugHooks,
  isTimelinePerformanceEnabled,
  recordTimelinePerformanceSample,
} from "../utils/timelinePerformance";
import type { SeekPhase } from "../types/playbackSeek";

export interface MultiStemEditorProps {
  stems: StemDefinition[];
  waveforms: Record<string, number[]>;
  durations: Record<string, number>;
  stemStates: Record<string, StemEditorState>;
  isPlaying: boolean;
  playheadPct: number;
  isLoadingStems: boolean;
  /** False until stem AudioBuffers are decoded — avoids play/mix tools that cannot output sound yet. */
  playbackReady?: boolean;
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
  /** Optional: time-domain analyser getter for live waveform modulation. */
  getAnalyserData?: () => Uint8Array | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
  playbackReady = false,
  onStemStateChange,
  onSeek,
  onPlayPause,
  onPreviewStem,
  playingStemId,
  loadingPreviewStemId,
  activeStemId: controlledActiveStemId,
  onActiveStemChange,
  getAnalyserData,
}: MultiStemEditorProps) {
  const [activePanel, setActivePanel] = useState<
    "pitch" | "eq" | "amplitude" | "time" | null
  >(null);
  const [mixerConsoleOpen, setMixerConsoleOpen] = useState(false);
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

  useEffect(() => {
    if (!isTimelinePerformanceEnabled()) return;
    return installTimelinePerformanceDebugHooks();
  }, []);

  useEffect(() => {
    if (!playbackReady) setActivePanel(null);
  }, [playbackReady]);

  // Keep active stem valid when stems change
  useEffect(() => {
    if (
      stems.length > 0 &&
      activeStemId &&
      !stems.some((s) => s.id === activeStemId)
    ) {
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

  if (stems.length === 0) return null;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onPlayPause}
          disabled={!playbackReady}
          aria-label={isPlaying ? "Stop mix" : "Play mix"}
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition",
            isPlaying
              ? "border-amber-400/50 bg-amber-500/20 text-amber-100"
              : "border-white/15 bg-white/5 text-white/80 hover:bg-white/10",
            !playbackReady && "opacity-40",
          )}
        >
          {isPlaying ? <Square /> : <Play />}
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
          <span className="px-1 text-xs text-white/50">{Math.round(zoom * 100)}%</span>
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

        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/20 p-0.5">
          {(
            [
              { id: "pitch" as const, icon: Waves, label: "Pitch" },
              { id: "eq" as const, icon: Sliders, label: "EQ" },
              { id: "amplitude" as const, icon: Activity, label: "Amplitude" },
              { id: "time" as const, icon: Timer, label: "Time" },
            ] as const
          ).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActivePanel((p) => (p === id ? null : id))}
              disabled={!playbackReady}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                activePanel === id
                  ? "bg-amber-500/20 text-amber-200"
                  : "text-white/60 hover:text-white",
                !playbackReady && "cursor-not-allowed opacity-40",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {!import.meta.env.PROD && (
          <button
            type="button"
            onClick={() => setMixerConsoleOpen((open) => !open)}
            aria-controls="mixer-console-panel"
            className={cn(
              "ml-auto flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition",
              mixerConsoleOpen
                ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
                : "border-white/10 bg-white/5 text-white/60 hover:text-white",
            )}
          >
            {mixerConsoleOpen ? "Hide Console" : "Show Console"}
          </button>
        )}
      </div>

      <TimelineRuler ticks={ticks} formatTime={formatTime} />

      <div
        className="relative flex gap-0 overflow-x-hidden overflow-y-visible rounded-xl"
        style={{ minHeight: activePanel ? 320 : undefined }}
      >
        <div
          className={cn(
            "min-w-0 flex-1 transition-all duration-300",
            activePanel ? "mr-72" : "",
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
            getAnalyserData={getAnalyserData}
            onTrimChange={handleTrimChange}
            onSeek={instrumentedOnSeek}
            onActivate={handleActivate}
            onStemStateChange={onStemStateChange}
          />
        </div>

        {activePanel && activeStem && (
          <div
            className="absolute right-0 top-0 z-20 w-72 flex flex-col rounded-xl border border-white/10 bg-black/80 backdrop-blur-md shadow-[-8px_0_24px_rgba(0,0,0,0.5)] overflow-y-auto animate-in slide-in-from-right duration-300"
            style={{ maxHeight: 320 }}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-black/40">
              <h3 className="text-sm font-bold uppercase tracking-wider text-amber-300">
                {activePanel === "pitch" && "Pitch Shift"}
                {activePanel === "eq" && "EQ & Filters"}
                {activePanel === "amplitude" && "Amplitude"}
                {activePanel === "time" && "Time Stretch"}
              </h3>
              <button
                type="button"
                onClick={() => setActivePanel(null)}
                className="text-white/40 hover:text-white transition"
                aria-label="Close panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-5 p-4">
              {activePanel === "pitch" && (
                <div className="space-y-4">
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={activeState.pitchSemitones}
                    onChange={(e) =>
                      onStemStateChange(activeStem.id, {
                        pitchSemitones: Number(e.target.value),
                      })
                    }
                    className="stem-accent-slider w-full"
                    aria-label={`${activeStem.label} pitch shift`}
                  />
                </div>
              )}
              {activePanel === "eq" && (
                <div className="space-y-2">
                  {(["eqLow", "eqMid", "eqHigh"] as const).map((key) => (
                    <input
                      key={key}
                      type="range"
                      min={-12}
                      max={12}
                      step={0.5}
                      value={activeState.mixer[key]}
                      onChange={(e) =>
                        onStemStateChange(activeStem.id, {
                          mixer: {
                            ...activeState.mixer,
                            [key]: Number(e.target.value),
                          },
                        })
                      }
                      className="stem-accent-slider w-full"
                      aria-label={`${activeStem.label} ${key}`}
                    />
                  ))}
                </div>
              )}
              {activePanel === "amplitude" && (
                <input
                  type="range"
                  min={-20}
                  max={6}
                  step={0.5}
                  value={activeState.mixer.gain}
                  onChange={(e) =>
                    onStemStateChange(activeStem.id, {
                      mixer: { ...activeState.mixer, gain: Number(e.target.value) },
                    })
                  }
                  className="stem-accent-slider w-full"
                  aria-label={`${activeStem.label} volume`}
                />
              )}
              {activePanel === "time" && (
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={activeState.timeStretch}
                  onChange={(e) =>
                    onStemStateChange(activeStem.id, {
                      timeStretch: Number(e.target.value),
                    })
                  }
                  className="stem-accent-slider w-full"
                  aria-label={`${activeStem.label} time stretch`}
                />
              )}
            </div>
          </div>
        )}
      </div>
      <StemTabs
        stems={stems}
        activeStemId={resolvedActiveStemId}
        stemStates={stemStates}
        onSelectStem={setActiveStemId}
      />

      {activeStem && (
        <StemControls
          stem={activeStem}
          state={activeState}
          duration={activeDuration}
          audioReady={activeDuration > 0}
          isPreviewPlaying={playingStemId === activeStem.id}
          isLoadingPreview={loadingPreviewStemId === activeStem.id}
          onStemStateChange={onStemStateChange}
          onPreviewStem={onPreviewStem}
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