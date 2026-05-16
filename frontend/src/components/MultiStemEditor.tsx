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
  Grid,
  LayoutList,
  Play,
  Repeat,
  Sliders,
  Sparkles,
  Square,
  Timer,
  Waves,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

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
  /** Optional: time-domain analyser getter for live waveform modulation. */
  getAnalyserData?: () => Uint8Array | null;
  /** Whether loop playback is enabled. */
  loopEnabled?: boolean;
  /** Callback to toggle loop playback. */
  onLoopToggle?: (enabled: boolean) => void;
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
  loopEnabled = false,
  onLoopToggle,
}: MultiStemEditorProps) {
  const [activePanel, setActivePanel] = useState<
    "pitch" | "eq" | "amplitude" | "time" | "fx" | null
  >(null);
  const [mixerConsoleOpen, setMixerConsoleOpen] = useState(false);
  const [showBeatGrid, setShowBeatGrid] = useState(false);
  const [showMixerStrips, setShowMixerStrips] = useState(false);
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

        <button
          type="button"
          onClick={() => onLoopToggle?.(!loopEnabled)}
          disabled={!playbackReady}
          aria-label={loopEnabled ? "Disable loop playback" : "Enable loop playback"}
          aria-pressed={loopEnabled}
          className={cn(
            "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition",
            loopEnabled
              ? "border-amber-400/50 bg-amber-500/20 text-amber-100"
              : "border-white/15 bg-white/5 text-white/60 hover:text-white hover:bg-white/10",
            !playbackReady && "opacity-40",
          )}
        >
          <Repeat className="h-4 w-4" />
          Loop
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

        {shouldRenderBeatGrid(beatGrid) && (
          <button
            type="button"
            onClick={() => setShowBeatGrid((v) => !v)}
            aria-label="Toggle beat grid"
            className={cn(
              "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition",
              showBeatGrid
                ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
                : "border-white/10 bg-white/5 text-white/60 hover:text-white",
            )}
          >
            <Grid className="h-3.5 w-3.5" />
            Beat Grid
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowMixerStrips((v) => !v)}
          aria-label="Toggle mixer strips view"
          className={cn(
            "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition",
            showMixerStrips
              ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
              : "border-white/10 bg-white/5 text-white/60 hover:text-white",
          )}
        >
          <LayoutList className="h-3.5 w-3.5" />
          Mixer
        </button>

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

        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-black/20 p-0.5">
          {(
            [
              { id: "pitch" as const, icon: Waves, label: "Pitch" },
              { id: "eq" as const, icon: Sliders, label: "EQ" },
              { id: "amplitude" as const, icon: Activity, label: "Amplitude" },
              { id: "time" as const, icon: Timer, label: "Time" },
              { id: "fx" as const, icon: Sparkles, label: "FX" },
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

        {activePanel && activeStem && (
          <div
            className="absolute inset-x-0 top-0 z-20 flex max-h-[320px] flex-col overflow-y-auto rounded-xl border border-white/10 bg-black/90 backdrop-blur-md shadow-[-8px_0_24px_rgba(0,0,0,0.5)] animate-in slide-in-from-right duration-300 md:inset-x-auto md:right-0 md:w-72 md:bg-black/80"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-black/40">
              <h3 className="text-sm font-bold uppercase tracking-wider text-amber-300">
                {activePanel === "pitch" && "Pitch Shift"}
                {activePanel === "eq" && "EQ & Filters"}
                {activePanel === "amplitude" && "Amplitude"}
                {activePanel === "time" && "Time Stretch"}
                {activePanel === "fx" && "Effects"}
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
                    min={-3}
                    max={3}
                    step={0.1}
                    value={activeState.pitchSemitones}
                    onChange={(e) =>
                      onStemStateChange(activeStem.id, {
                        pitchSemitones: Number(e.target.value),
                      })
                    }
                    onDoubleClick={() =>
                      onStemStateChange(activeStem.id, { pitchSemitones: 0 })
                    }
                    className="stem-accent-slider w-full"
                    aria-label={`${activeStem.label} pitch shift`}
                  />
                  <p className="text-center text-xs text-white/60">
                    {activeState.pitchSemitones > 0 ? "+" : ""}
                    {activeState.pitchSemitones.toFixed(1)} st
                  </p>
                  <p className="text-center text-[9px] text-white/30">
                    Double-click to reset
                  </p>
                </div>
              )}
              {activePanel === "eq" && (
                <div className="space-y-3">
                  {([
                    { key: "eqLow" as const, label: "Low", freq: "200 Hz" },
                    { key: "eqMid" as const, label: "Mid", freq: "1 kHz" },
                    { key: "eqHigh" as const, label: "High", freq: "6 kHz" },
                  ]).map(({ key, label, freq }) => (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-white/50">
                          {label} <span className="text-white/30">{freq}</span>
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-white/50">
                          {activeState.mixer[key] > 0 ? "+" : ""}
                          {activeState.mixer[key].toFixed(1)} dB
                        </span>
                      </div>
                      <input
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
                        onDoubleClick={() =>
                          onStemStateChange(activeStem.id, {
                            mixer: { ...activeState.mixer, [key]: 0 },
                          })
                        }
                        className="stem-accent-slider w-full"
                        aria-label={`${activeStem.label} ${label} EQ (${freq})`}
                      />
                    </div>
                  ))}
                  <p className="text-center text-[9px] text-white/30 pt-1">
                    Double-click to reset
                  </p>
                </div>
              )}
              {activePanel === "amplitude" && (
                <div className="space-y-4">
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
                    onDoubleClick={() =>
                      onStemStateChange(activeStem.id, {
                        mixer: { ...activeState.mixer, gain: 0 },
                      })
                    }
                    className="stem-accent-slider w-full"
                    aria-label={`${activeStem.label} volume`}
                  />
                  <p className="text-center text-xs text-white/60">
                    {activeState.mixer.gain > 0 ? "+" : ""}
                    {activeState.mixer.gain.toFixed(1)} dB
                  </p>
                  <p className="text-center text-[9px] text-white/30">
                    Double-click to reset
                  </p>
                </div>
              )}
              {activePanel === "time" && (
                <div className="space-y-4">
                  <input
                    type="range"
                    min={0.85}
                    max={1.15}
                    step={0.01}
                    value={activeState.timeStretch}
                    onChange={(e) =>
                      onStemStateChange(activeStem.id, {
                        timeStretch: Number(e.target.value),
                      })
                    }
                    onDoubleClick={() =>
                      onStemStateChange(activeStem.id, { timeStretch: 1.0 })
                    }
                    className="stem-accent-slider w-full"
                    aria-label={`${activeStem.label} tempo`}
                  />
                  <p className="text-center text-xs text-white/60">
                    {Math.round((1 / activeState.timeStretch - 1) * 100) >= 0 ? "+" : ""}
                    {Math.round((1 / activeState.timeStretch - 1) * 100)}%
                  </p>
                  <p className="text-center text-[9px] text-white/30">
                    Double-click to reset
                  </p>
                </div>
              )}
              {activePanel === "fx" && (
                <div className="space-y-4">
                  {/* Reverb */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-white/50">
                        Reverb
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-white/50">
                        {activeState.mixer.reverbWet}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={activeState.mixer.reverbWet}
                      onChange={(e) =>
                        onStemStateChange(activeStem.id, {
                          mixer: { ...activeState.mixer, reverbWet: Number(e.target.value) },
                        })
                      }
                      onDoubleClick={() =>
                        onStemStateChange(activeStem.id, {
                          mixer: { ...activeState.mixer, reverbWet: 0 },
                        })
                      }
                      className="stem-accent-slider w-full"
                      aria-label={`${activeStem.label} reverb wet`}
                    />
                  </div>

                  {/* Delay */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-white/50">
                        Delay
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-white/50">
                        {activeState.mixer.delayWet}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={activeState.mixer.delayWet}
                      onChange={(e) =>
                        onStemStateChange(activeStem.id, {
                          mixer: { ...activeState.mixer, delayWet: Number(e.target.value) },
                        })
                      }
                      onDoubleClick={() =>
                        onStemStateChange(activeStem.id, {
                          mixer: { ...activeState.mixer, delayWet: 0 },
                        })
                      }
                      className="stem-accent-slider w-full"
                      aria-label={`${activeStem.label} delay wet`}
                    />
                  </div>

                  {/* Compressor Threshold */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-white/50">
                        Comp Threshold
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-white/50">
                        {activeState.mixer.compThreshold} dB
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-60}
                      max={0}
                      step={1}
                      value={activeState.mixer.compThreshold}
                      onChange={(e) =>
                        onStemStateChange(activeStem.id, {
                          mixer: { ...activeState.mixer, compThreshold: Number(e.target.value) },
                        })
                      }
                      onDoubleClick={() =>
                        onStemStateChange(activeStem.id, {
                          mixer: { ...activeState.mixer, compThreshold: 0 },
                        })
                      }
                      className="stem-accent-slider w-full"
                      aria-label={`${activeStem.label} compressor threshold`}
                    />
                  </div>

                  {/* Compressor Ratio */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-white/50">
                        Comp Ratio
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-white/50">
                        {activeState.mixer.compRatio.toFixed(1)}:1
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      step={0.5}
                      value={activeState.mixer.compRatio}
                      onChange={(e) =>
                        onStemStateChange(activeStem.id, {
                          mixer: { ...activeState.mixer, compRatio: Number(e.target.value) },
                        })
                      }
                      onDoubleClick={() =>
                        onStemStateChange(activeStem.id, {
                          mixer: { ...activeState.mixer, compRatio: 1 },
                        })
                      }
                      className="stem-accent-slider w-full"
                      aria-label={`${activeStem.label} compressor ratio`}
                    />
                  </div>

                  <p className="text-center text-[9px] text-white/30 pt-1">
                    Double-click to reset
                  </p>
                </div>
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
          stems={stems}
          stemStates={stemStates}
          activeStemId={resolvedActiveStemId}
          playbackReady={playbackReady}
          isLoadingStems={isLoadingStems}
          playingStemId={playingStemId}
          loadingPreviewStemId={loadingPreviewStemId}
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