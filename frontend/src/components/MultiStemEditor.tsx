/**
 * MultiStemEditor — unified waveform editor showing all stems in one timeline.
 * Each stem gets a color-coded lane. Active stem is selected via tab strip.
 * Supports: interactive trim handles, playhead scrub, volume, pan, speed (rate), mute/solo.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Play, Square, Volume2, VolumeX, Headphones,
  ZoomIn, ZoomOut, RotateCcw,
} from "lucide-react";
import type { StemDefinition, TrimState, MixerState } from "../types";
import { defaultTrim, defaultMixer } from "../types";
import { cn } from "../utils/cn";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StemEditorState {
  trim: TrimState;
  mixer: MixerState;
  /** Playback rate: 0.5–2.0. 1.0 = normal. Affects pitch + tempo together. */
  rate: number;
  muted: boolean;
  soloed: boolean;
}

export interface MultiStemEditorProps {
  stems: StemDefinition[];
  waveforms: Record<string, number[]>;
  durations: Record<string, number>;
  stemStates: Record<string, StemEditorState>;
  isPlaying: boolean;
  playheadPct: number; // 0–100
  isLoadingStems: boolean;
  onStemStateChange: (stemId: string, next: Partial<StemEditorState>) => void;
  onSeek: (pct: number) => void;
  onPlayPause: () => void;
  onPreviewStem: (stemId: string) => void;
  playingStemId: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LANE_HEIGHT = 56;       // px per stem lane
const WAVEFORM_BINS = 512;
const BAR_BUDGET = 300;       // max bars rendered per lane (downsampling cap)
const HANDLE_HIT_PX = 12;     // pixel radius for trim handle hit detection
const MIN_TRIM_GAP_PCT = 2;   // minimum gap between trim handles (percent)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Downsample an array to at most `budget` bars by averaging buckets. */
function downsample(data: number[], budget: number): number[] {
  if (data.length <= budget) return data;
  const out: number[] = [];
  const step = data.length / budget;
  for (let i = 0; i < budget; i++) {
    const lo = Math.floor(i * step);
    const hi = Math.min(data.length, Math.ceil((i + 1) * step));
    let sum = 0;
    for (let j = lo; j < hi; j++) sum += data[j];
    out.push(sum / (hi - lo));
  }
  return out;
}

// ─── WaveformLane ─────────────────────────────────────────────────────────────

function WaveformLane({
  stem,
  waveform,
  trim,
  isActive,
  isMuted,
  zoom,
  scrollPct,
  onTrimChange,
  onSeek,
  onActivate,
}: {
  stem: StemDefinition;
  waveform: number[];
  trim: TrimState;
  isActive: boolean;
  isMuted: boolean;
  zoom: number;
  scrollPct: number;
  onTrimChange: (stemId: string, t: TrimState) => void;
  onSeek: (pct: number) => void;
  onActivate: (stemId: string) => void;
}) {
  const laneRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"start" | "end" | "seek" | null>(null);
  const didDragRef = useRef(false);
  const trimRef = useRef(trim);
  const stemIdRef = useRef(stem.id);
  const onTrimChangeRef = useRef(onTrimChange);
  const onSeekRef = useRef(onSeek);
  trimRef.current = trim;
  stemIdRef.current = stem.id;
  onTrimChangeRef.current = onTrimChange;
  onSeekRef.current = onSeek;

  const visibleStart = scrollPct / 100;
  const visibleEnd = Math.min(1, visibleStart + 1 / zoom);
  const visibleRange = Math.max(visibleEnd - visibleStart, 1e-6);

  const pctFromEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    const rect = laneRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    const raw = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    return clamp(visibleStart + raw * visibleRange, 0, 1) * 100;
  }, [visibleStart, visibleRange]);

  const hitTestHandle = useCallback((e: React.MouseEvent): "start" | "end" | "seek" => {
    const rect = laneRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return "seek";
    const toPixel = (pct: number) => {
      const frac = clamp((pct / 100 - visibleStart) / visibleRange, 0, 1);
      return frac * rect.width;
    };
    const mouseX = e.clientX - rect.left;
    const distStart = Math.abs(mouseX - toPixel(trim.start));
    const distEnd = Math.abs(mouseX - toPixel(trim.end));
    if (distStart <= HANDLE_HIT_PX) return "start";
    if (distEnd <= HANDLE_HIT_PX) return "end";
    return "seek";
  }, [trim.start, trim.end, visibleStart, visibleRange]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragging.current = hitTestHandle(e);
  }, [hitTestHandle]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      didDragRef.current = true;
      const t = trimRef.current;
      const pct = pctFromEvent(e);
      if (dragging.current === "start") {
        onTrimChangeRef.current(stemIdRef.current, { start: clamp(pct, 0, t.end - MIN_TRIM_GAP_PCT), end: t.end });
      } else if (dragging.current === "end") {
        onTrimChangeRef.current(stemIdRef.current, { start: t.start, end: clamp(pct, t.start + MIN_TRIM_GAP_PCT, 100) });
      } else {
        onSeekRef.current(pct);
      }
    };
    const onUp = () => { dragging.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [pctFromEvent]);

  const startBin = clamp(Math.floor(visibleStart * waveform.length), 0, waveform.length);
  const endBin = clamp(Math.ceil(visibleEnd * waveform.length), startBin, waveform.length);

  const slice = useMemo(
    () => downsample(waveform.slice(startBin, endBin), BAR_BUDGET),
    [waveform, startBin, endBin]
  );

  const toVisible = (pct: number) =>
    clamp((pct / 100 - visibleStart) / visibleRange, 0, 1) * 100;

  const trimStartVis = toVisible(trim.start);
  const trimEndVis = toVisible(trim.end);

  return (
    <div
      ref={laneRef}
      className={cn(
        "relative w-full select-none overflow-hidden rounded-lg border transition-all cursor-crosshair",
        isActive ? "border-white/20" : "border-white/8",
        isMuted && "opacity-40",
      )}
      style={{ height: LANE_HEIGHT, background: `${stem.glow}08` }}
      onMouseDown={onMouseDown}
      onClick={() => {
        if (didDragRef.current) {
          didDragRef.current = false;
          return;
        }
        onActivate(stem.id);
      }}
    >
      {/* Waveform bars */}
      <div className="absolute inset-0 flex items-center gap-px px-0.5">
        {slice.map((v, i) => (
          <span
            // Fix #5A (TODO): stable key based on bin position, not slice index
            key={startBin + i}
            className="flex-1 rounded-full"
            style={{
              // Fix #5B (TODO): clamp bar height to 100%
              height: `${Math.max(8, clamp(v, 0, 1) * 90)}%`,
              background: `linear-gradient(180deg, ${stem.glow}cc 0%, ${stem.glow}44 100%)`,
              opacity: isMuted ? 0.3 : isActive ? 0.9 : 0.5,
            }}
          />
        ))}
      </div>

      {/* Trim region overlay */}
      <div
        className="pointer-events-none absolute inset-y-0 border-x border-white/30"
        style={{
          left: `${trimStartVis}%`,
          right: `${100 - trimEndVis}%`,
          background: `${stem.glow}18`,
        }}
      />
      {/* Trim handles */}
      <div
        className="absolute inset-y-0 w-1.5 cursor-ew-resize rounded-l"
        style={{ left: `${trimStartVis}%`, background: stem.glow, opacity: 0.9 }}
      />
      <div
        className="absolute inset-y-0 w-1.5 cursor-ew-resize rounded-r"
        style={{ left: `calc(${trimEndVis}% - 6px)`, background: stem.glow, opacity: 0.9 }}
      />

      {/* Stem label */}
      <span
        className="pointer-events-none absolute left-2 top-1 text-[9px] font-bold uppercase tracking-wider"
        style={{ color: stem.glow, textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
      >
        {stem.label}
      </span>
    </div>
  );
}

const WaveformLaneMemo = memo(WaveformLane);

// ─── StemControls ─────────────────────────────────────────────────────────────

const StemControls = memo(function StemControls({
  stem,
  state,
  duration,
  isPreviewPlaying,
  onStemStateChange,
  onPreviewStem,
}: {
  stem: StemDefinition;
  state: StemEditorState;
  duration: number;
  isPreviewPlaying: boolean;
  onStemStateChange: (stemId: string, next: Partial<StemEditorState>) => void;
  onPreviewStem: (stemId: string) => void;
}) {
  const { mixer, trim, rate, muted, soloed } = state;

  const trimStartSec = duration * (trim.start / 100);
  const trimEndSec = duration * (trim.end / 100);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: stem.glow, boxShadow: `0 0 8px ${stem.glowSoft}` }}
        />
        <span className="font-semibold text-sm text-white">{stem.label}</span>
        <span className="text-xs text-white/50">{stem.subtitle}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPreviewStem(stem.id)}
            aria-label={isPreviewPlaying ? `Stop ${stem.label} preview` : `Preview ${stem.label}`}
            className={cn(
              "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition",
              isPreviewPlaying
                ? "border-amber-400/40 bg-amber-500/20 text-amber-200"
                : "border-white/10 bg-white/5 text-white/70 hover:text-white"
            )}
          >
            {isPreviewPlaying ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {isPreviewPlaying ? "Stop" : "Hear"}
          </button>
          <button
            type="button"
            onClick={() => onStemStateChange(stem.id, { soloed: !soloed })}
            aria-label={soloed ? `Unsolo ${stem.label}` : `Solo ${stem.label}`}
            aria-pressed={soloed ? "true" : "false"}
            className={cn(
              "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition",
              soloed
                ? "border-amber-400/40 bg-amber-500/20 text-amber-200"
                : "border-white/10 bg-white/5 text-white/70 hover:text-white"
            )}
          >
            <Headphones className="h-3 w-3" />
            Solo
          </button>
          <button
            type="button"
            onClick={() => onStemStateChange(stem.id, { muted: !muted })}
            aria-label={muted ? `Unmute ${stem.label}` : `Mute ${stem.label}`}
            aria-pressed={muted ? "true" : "false"}
            className={cn(
              "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition",
              muted
                ? "border-red-400/40 bg-red-500/20 text-red-200"
                : "border-white/10 bg-white/5 text-white/70 hover:text-white"
            )}
          >
            {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
            {muted ? "Unmute" : "Mute"}
          </button>
        </div>
      </div>

      {/* Trim row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-white/50">
            <span>Trim in</span>
            <span>{formatTime(trimStartSec)}</span>
          </div>
          <input
            type="range" min={0} max={trim.end - MIN_TRIM_GAP_PCT} step={0.1}
            value={trim.start}
            aria-label={`${stem.label} trim in`}
            onChange={(e) => onStemStateChange(stem.id, { trim: { ...trim, start: Number(e.target.value) } })}
            className="w-full"
            style={{ accentColor: stem.glow }}
          />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-white/50">
            <span>Trim out</span>
            <span>{formatTime(trimEndSec)}</span>
          </div>
          <input
            type="range" min={trim.start + MIN_TRIM_GAP_PCT} max={100} step={0.1}
            value={trim.end}
            aria-label={`${stem.label} trim out`}
            onChange={(e) => onStemStateChange(stem.id, { trim: { ...trim, end: Number(e.target.value) } })}
            className="w-full"
            style={{ accentColor: stem.glow }}
          />
        </div>
      </div>

      {/* Volume / Pan / Rate row */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-white/50">
            <span>Volume</span>
            <span>{mixer.gain > 0 ? "+" : ""}{mixer.gain.toFixed(1)} dB</span>
          </div>
          <input
            type="range" min={-24} max={12} step={0.5}
            value={mixer.gain}
            aria-label={`${stem.label} volume`}
            onChange={(e) => onStemStateChange(stem.id, { mixer: { ...mixer, gain: Number(e.target.value) } })}
            className="w-full"
            style={{ accentColor: stem.glow }}
          />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-white/50">
            <span>Pan</span>
            <span>{mixer.pan === 0 ? "C" : mixer.pan > 0 ? `R${mixer.pan}` : `L${Math.abs(mixer.pan)}`}</span>
          </div>
          <input
            type="range" min={-100} max={100} step={1}
            value={mixer.pan}
            aria-label={`${stem.label} pan`}
            onChange={(e) => onStemStateChange(stem.id, { mixer: { ...mixer, pan: Number(e.target.value) } })}
            className="w-full"
            style={{ accentColor: stem.glow }}
          />
        </div>
        <div>
          {/* Fix #6 (TODO): label clarifies pitch+tempo coupling */}
          <div className="mb-1 flex justify-between text-[10px] text-white/50">
            <span title="Changes both speed and pitch together">Speed (+ pitch)</span>
            <span>{rate.toFixed(2)}×</span>
          </div>
          <input
            type="range" min={0.5} max={2.0} step={0.01}
            value={rate}
            aria-label={`${stem.label} speed and pitch`}
            onChange={(e) => onStemStateChange(stem.id, { rate: Number(e.target.value) })}
            className="w-full"
            style={{ accentColor: stem.glow }}
          />
        </div>
      </div>
    </div>
  );
});

// ─── MultiStemEditor (main export) ───────────────────────────────────────────

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
}: MultiStemEditorProps) {
  const [activeStemId, setActiveStemId] = useState<string>(stems[0]?.id ?? "");
  const [zoom, setZoom] = useState(1);
  const [scrollPct, setScrollPct] = useState(0);

  // Keep activeStemId valid when stems change
  useEffect(() => {
    if (stems.length > 0 && !stems.find((s) => s.id === activeStemId)) {
      setActiveStemId(stems[0].id);
    }
  }, [stems, activeStemId]);

  // Fix #3 (TODO): clamp scrollPct when zoom changes so it stays in valid range
  useEffect(() => {
    const maxScroll = Math.max(0, 100 - 100 / zoom);
    setScrollPct((s) => clamp(s, 0, maxScroll));
  }, [zoom]);

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

  // Fix #1 (TODO, Option A): global playhead overlay position — computed once, not per-lane
  // This prevents waveform bars from re-rendering on every playhead tick
  const visibleStartGlobal = scrollPct / 100;
  const visibleEndGlobal = Math.min(1, visibleStartGlobal + 1 / zoom);
  const visibleRangeGlobal = Math.max(visibleEndGlobal - visibleStartGlobal, 1e-6);
  const playheadVisiblePct = clamp(
    (playheadPct / 100 - visibleStartGlobal) / visibleRangeGlobal,
    0, 1
  ) * 100;
  const showPlayhead = isPlaying && playheadPct > 0;

  const handleTrimChange = useCallback(
    (stemId: string, t: TrimState) => onStemStateChange(stemId, { trim: t }),
    [onStemStateChange]
  );
  const handleActivate = useCallback((stemId: string) => setActiveStemId(stemId), []);

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
            max={Math.max(0, 100 - 100 / zoom)}
            step={0.5}
            value={scrollPct}
            onChange={(e) => setScrollPct(Number(e.target.value))}
            className="w-32"
            aria-label="Scroll timeline"
          />
        )}

        <button
          type="button"
          onClick={() => { setZoom(1); setScrollPct(0); }}
          aria-label="Reset zoom and scroll"
          className="ml-auto flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:text-white transition"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset view
        </button>
      </div>

      {/* ── Timeline ruler ── */}
      <div className="relative h-5 border-b border-white/10">
        {ticks.map(({ pct, time }) => (
          <div
            key={pct}
            className="absolute top-0 flex flex-col items-center"
            style={{ left: `${pct}%` }}
          >
            <div className="h-2 w-px bg-white/20" />
            <span className="text-[9px] text-white/40">{formatTime(time)}</span>
          </div>
        ))}
      </div>

      {/* ── Waveform lanes + global playhead overlay ── */}
      <div className="relative flex flex-col gap-1.5">
        {isLoadingStems ? (
          stems.map((s) => (
            <div key={s.id} className="h-14 animate-pulse rounded-lg bg-white/10" />
          ))
        ) : (
          stems.map((s) => {
            // Fix #7C (TODO): use zero-fill instead of 0.15 flat line for missing waveform
            const wf = waveforms[s.id] ?? Array(WAVEFORM_BINS).fill(0);
            const st = stemStates[s.id] ?? defaultStemState();
            return (
              <WaveformLaneMemo
                key={s.id}
                stem={s}
                waveform={wf}
                trim={st.trim}
                isActive={s.id === activeStemId}
                isMuted={st.muted}
                zoom={zoom}
                scrollPct={scrollPct}
                onTrimChange={handleTrimChange}
                onSeek={onSeek}
                onActivate={handleActivate}
              />
            );
          })
        )}

        {/* Fix #1 (TODO, Option A): single global playhead overlay — no per-lane rerender on tick */}
        {showPlayhead && (
          <div
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90"
            style={{
              left: `${playheadVisiblePct}%`,
              boxShadow: "0 0 6px rgba(255,255,255,0.7)",
            }}
          />
        )}
      </div>

      {/* ── Stem selector tabs ── */}
      <div className="flex gap-1.5 flex-wrap border-t border-white/10 pt-3">
        {stems.map((s) => {
          const st = stemStates[s.id] ?? defaultStemState();
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveStemId(s.id)}
              aria-pressed={s.id === activeStemId ? "true" : "false"}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                s.id === activeStemId
                  ? "border-current text-white"
                  : "border-white/10 bg-white/5 text-white/60 hover:text-white/80",
                st.muted && "opacity-50",
              )}
              style={s.id === activeStemId ? { borderColor: s.glow, background: `${s.glow}18`, color: s.glow } : {}}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: s.glow, boxShadow: s.id === activeStemId ? `0 0 6px ${s.glow}` : "none" }}
              />
              {s.label}
              {st.muted && <span className="text-[9px] opacity-60">M</span>}
              {st.soloed && <span className="text-[9px] text-amber-300">S</span>}
            </button>
          );
        })}
      </div>

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

// ─── Default state factory ────────────────────────────────────────────────────

export function defaultStemState(): StemEditorState {
  return {
    trim: { ...defaultTrim },
    mixer: { ...defaultMixer },
    rate: 1.0,
    muted: false,
    soloed: false,
  };
}
