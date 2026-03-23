/**
 * MultiStemEditor — unified waveform editor showing all stems in one timeline.
 */
import { useCallback, useEffect, useMemo, useState, type SetStateAction } from "react";
import { Activity, Play, RotateCcw, Square, Terminal, Timer, Waves, ZoomIn, ZoomOut, X, Sliders } from "lucide-react";
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
  const [activePanel, setActivePanel] = useState<'pitch' | 'eq' | 'amplitude' | 'time' | null>(null);
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

        {/* ── Effect tool buttons ── */}
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/20 p-0.5">
          {(
            [
              { id: 'pitch' as const, icon: Waves, label: 'Pitch' },
              { id: 'eq' as const, icon: Sliders, label: 'EQ' },
              { id: 'amplitude' as const, icon: Activity, label: 'Amplitude' },
              { id: 'time' as const, icon: Timer, label: 'Time' },
            ] as const
          ).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActivePanel((p) => (p === id ? null : id))}
              aria-pressed={activePanel === id}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                activePanel === id
                  ? "bg-amber-500/20 text-amber-200"
                  : "text-white/60 hover:text-white"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

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
            style={import.meta.env.PROD ? { display: 'none' } : undefined}
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

      {/* ── Timeline + slide-out effects panel ── */}
      <div className="relative flex gap-0 overflow-hidden rounded-xl">
        <div className={cn("min-w-0 flex-1 transition-all duration-300", activePanel ? "mr-72" : "")}>
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
        </div>

        {/* Slide-out effects panel */}
        {activePanel && activeStem && (
          <div className="absolute right-0 top-0 bottom-0 w-72 flex flex-col rounded-xl border border-white/10 bg-black/80 backdrop-blur-md shadow-[-8px_0_24px_rgba(0,0,0,0.5)] overflow-y-auto animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-black/40">
              <h3 className="text-sm font-bold uppercase tracking-wider text-amber-300">
                {activePanel === 'pitch' && 'Pitch Shift'}
                {activePanel === 'eq' && 'EQ & Filters'}
                {activePanel === 'amplitude' && 'Amplitude'}
                {activePanel === 'time' && 'Time Stretch'}
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
              {/* Target stem label */}
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: activeStem.color }} />
                <span className="text-xs font-semibold text-white/80">{activeStem.label}</span>
              </div>

              {/* ── Pitch panel ── */}
              {activePanel === 'pitch' && (
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 flex justify-between text-[10px] font-semibold uppercase tracking-wider text-white/50">
                      <span>Pitch Shift</span>
                      <span className="text-amber-300 font-mono">
                        {activeState.pitchSemitones > 0 ? `+${activeState.pitchSemitones}` : activeState.pitchSemitones} st
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={1}
                      value={activeState.pitchSemitones}
                      onChange={(e) => onStemStateChange(activeStem.id, { pitchSemitones: Number(e.target.value) })}
                      className="stem-accent-slider w-full"
                      aria-label={`${activeStem.label} pitch shift`}
                    />
                    <div className="mt-1 flex justify-between text-[10px] text-white/35 font-mono">
                      <span>-12</span><span>0</span><span>+12</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onStemStateChange(activeStem.id, { pitchSemitones: 0 })}
                    className="ghost-button w-full rounded-xl border border-white/10 py-2 text-xs text-white/60 hover:text-white"
                  >
                    Reset pitch
                  </button>
                </div>
              )}

              {/* ── EQ panel ── */}
              {activePanel === 'eq' && (
                <div className="space-y-4">
                  <div className="flex justify-around items-end h-36 px-2">
                    {(
                      [
                        { key: 'eqLow' as const, label: 'Low' },
                        { key: 'eqMid' as const, label: 'Mid' },
                        { key: 'eqHigh' as const, label: 'High' },
                      ]
                    ).map(({ key, label }) => (
                      <div key={key} className="flex flex-col items-center gap-2">
                        <span className="text-[10px] font-mono text-amber-300">
                          {activeState.mixer[key] > 0 ? `+${activeState.mixer[key]}` : activeState.mixer[key]}
                        </span>
                        <input
                          type="range"
                          min={-12}
                          max={12}
                          step={0.5}
                          value={activeState.mixer[key]}
                          onChange={(e) => onStemStateChange(activeStem.id, { mixer: { ...activeState.mixer, [key]: Number(e.target.value) } })}
                          className="h-24 accent-amber-500"
                          style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                          aria-label={`${activeStem.label} EQ ${label}`}
                        />
                        <span className="text-[10px] text-white/50">{label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
                    <span className="col-span-2 text-[10px] font-semibold uppercase tracking-wider text-white/50">Quick filters</span>
                    {[
                      { label: 'Bass Boost', vals: { eqLow: 8, eqMid: 0, eqHigh: 0 } },
                      { label: 'Presence', vals: { eqLow: 0, eqMid: 4, eqHigh: 3 } },
                      { label: 'Air', vals: { eqLow: -2, eqMid: 0, eqHigh: 6 } },
                      { label: 'Reset', vals: { eqLow: 0, eqMid: 0, eqHigh: 0 } },
                    ].map(({ label, vals }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => onStemStateChange(activeStem.id, { mixer: { ...activeState.mixer, ...vals } })}
                        className="ghost-button rounded-lg border border-white/10 py-1.5 text-xs text-white/70 hover:text-white"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Amplitude panel ── */}
              {activePanel === 'amplitude' && (
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 flex justify-between text-[10px] font-semibold uppercase tracking-wider text-white/50">
                      <span>Volume</span>
                      <span className="text-amber-300 font-mono">{activeState.mixer.volume > 0 ? `+${activeState.mixer.volume}` : activeState.mixer.volume} dB</span>
                    </div>
                    <input
                      type="range"
                      min={-20}
                      max={6}
                      step={0.5}
                      value={activeState.mixer.volume}
                      onChange={(e) => onStemStateChange(activeStem.id, { mixer: { ...activeState.mixer, volume: Number(e.target.value) } })}
                      className="stem-accent-slider w-full"
                      aria-label={`${activeStem.label} volume`}
                    />
                    <div className="mt-1 flex justify-between text-[10px] text-white/35 font-mono">
                      <span>-20</span><span>0</span><span>+6</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onStemStateChange(activeStem.id, { mixer: { ...activeState.mixer, volume: 0 } })}
                      className="ghost-button rounded-lg border border-white/10 py-1.5 text-xs text-white/70 hover:text-white"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => onStemStateChange(activeStem.id, { mixer: { ...activeState.mixer, volume: 6 } })}
                      className="ghost-button rounded-lg border border-white/10 py-1.5 text-xs text-white/70 hover:text-white"
                    >
                      Boost +6
                    </button>
                  </div>
                </div>
              )}

              {/* ── Time panel ── */}
              {activePanel === 'time' && (
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 flex justify-between text-[10px] font-semibold uppercase tracking-wider text-white/50">
                      <span>Time Stretch</span>
                      <span className="text-amber-300 font-mono">{activeState.timeStretch.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={2}
                      step={0.05}
                      value={activeState.timeStretch}
                      onChange={(e) => onStemStateChange(activeStem.id, { timeStretch: Number(e.target.value) })}
                      className="stem-accent-slider w-full"
                      aria-label={`${activeStem.label} time stretch`}
                    />
                    <div className="mt-1 flex justify-between text-[10px] text-white/35 font-mono">
                      <span>0.5x</span><span>1x</span><span>2x</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onStemStateChange(activeStem.id, { timeStretch: 1 })}
                    className="ghost-button w-full rounded-xl border border-white/10 py-2 text-xs text-white/60 hover:text-white"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

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
