/**
 * MultiStemEditor — unified waveform editor showing all stems in one timeline.
 * Each stem gets a color-coded lane. Active stem is selected via tab strip.
 * Supports: interactive trim handles, playhead scrub, volume, pan, pitch (rate), mute/solo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
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

const LANE_HEIGHT = 56; // px per stem lane
const WAVEFORM_BINS = 512;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// ─── WaveformLane ─────────────────────────────────────────────────────────────

function WaveformLane({
  stem,
  waveform,
  trim,
  playheadPct,
  isActive,
  isMuted,
  zoom,
  scrollPct,
  onTrimChange,
  onSeek,
}: {
  stem: StemDefinition;
  waveform: number[];
  trim: TrimState;
  playheadPct: number;
  isActive: boolean;
  isMuted: boolean;
  zoom: number;
  scrollPct: number;
  onTrimChange: (t: TrimState) => void;
  onSeek: (pct: number) => void;
}) {
  const laneRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"start" | "end" | "seek" | null>(null);

  const pctFromEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    const rect = laneRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const raw = (e.clientX - rect.left) / rect.width;
    // Map visible area back to full timeline pct
    const visibleStart = scrollPct / 100;
    const visibleEnd = visibleStart + 1 / zoom;
    return clamp(visibleStart + raw * (visibleEnd - visibleStart), 0, 1) * 100;
  }, [zoom, scrollPct]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const pct = pctFromEvent(e);
    const distStart = Math.abs(pct - trim.start);
    const distEnd = Math.abs(pct - trim.end);
    if (distStart < 4) dragging.current = "start";
    else if (distEnd < 4) dragging.current = "end";
    else dragging.current = "seek";
    e.preventDefault();
  }, [pctFromEvent, trim]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const pct = pctFromEvent(e);
      if (dragging.current === "start") {
        onTrimChange({ start: clamp(pct, 0, trim.end - 2), end: trim.end });
      } else if (dragging.current === "end") {
        onTrimChange({ start: trim.start, end: clamp(pct, trim.start + 2, 100) });
      } else {
        onSeek(pct);
      }
    };
    const onUp = () => { dragging.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [pctFromEvent, trim, onTrimChange, onSeek]);

  // Visible slice of waveform
  const visibleStart = scrollPct / 100;
  const visibleEnd = visibleStart + 1 / zoom;
  const startBin = Math.floor(visibleStart * waveform.length);
  const endBin = Math.ceil(visibleEnd * waveform.length);
  const slice = waveform.slice(startBin, endBin);

  // Convert trim pcts to visible-area pcts for rendering
  const toVisible = (pct: number) => {
    const frac = pct / 100;
    return clamp((frac - visibleStart) / (visibleEnd - visibleStart), 0, 1) * 100;
  };
  const trimStartVis = toVisible(trim.start);
  const trimEndVis = toVisible(trim.end);
  const playheadVis = toVisible(playheadPct);

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
    >
      {/* Waveform bars */}
      <div className="absolute inset-0 flex items-center gap-px px-0.5">
        {slice.map((v, i) => (
          <span
            key={i}
            className="flex-1 rounded-full"
            style={{
              height: `${Math.max(8, v * 90)}%`,
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

      {/* Playhead */}
      {playheadPct > 0 && (
        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90"
          style={{ left: `${playheadVis}%`, boxShadow: "0 0 6px rgba(255,255,255,0.7)" }}
        />
      )}

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

// ─── StemControls ─────────────────────────────────────────────────────────────

function StemControls({
  stem,
  state,
  duration,
  isPreviewPlaying,
  onChange,
  onPreview,
}: {
  stem: StemDefinition;
  state: StemEditorState;
  duration: number;
  isPreviewPlaying: boolean;
  onChange: (next: Partial<StemEditorState>) => void;
  onPreview: () => void;
}) {
  const { mixer, trim, rate, muted, soloed } = state;

  const setMixer = (patch: Partial<MixerState>) =>
    onChange({ mixer: { ...mixer, ...patch } });

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
            onClick={onPreview}
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
            onClick={() => onChange({ soloed: !soloed })}
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
            onClick={() => onChange({ muted: !muted })}
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
            type="range" min={0} max={trim.end - 2} step={0.1}
            value={trim.start}
            onChange={(e) => onChange({ trim: { ...trim, start: Number(e.target.value) } })}
            className="w-full accent-amber-400"
            style={{ accentColor: stem.glow }}
          />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-white/50">
            <span>Trim out</span>
            <span>{formatTime(trimEndSec)}</span>
          </div>
          <input
            type="range" min={trim.start + 2} max={100} step={0.1}
            value={trim.end}
            onChange={(e) => onChange({ trim: { ...trim, end: Number(e.target.value) } })}
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
            onChange={(e) => setMixer({ gain: Number(e.target.value) })}
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
            onChange={(e) => setMixer({ pan: Number(e.target.value) })}
            className="w-full"
            style={{ accentColor: stem.glow }}
          />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-white/50">
            <span>Speed / Pitch</span>
            <span>{rate.toFixed(2)}×</span>
          </div>
          <input
            type="range" min={0.5} max={2.0} step={0.01}
            value={rate}
            onChange={(e) => onChange({ rate: Number(e.target.value) })}
            className="w-full"
            style={{ accentColor: stem.glow }}
          />
        </div>
      </div>
    </div>
  );
}

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

  const activeStem = stems.find((s) => s.id === activeStemId) ?? stems[0];
  const activeState = activeStem ? (stemStates[activeStem.id] ?? defaultStemState()) : defaultStemState();
  const activeDuration = activeStem ? (durations[activeStem.id] ?? 0) : 0;

  const maxDuration = Math.max(...stems.map((s) => durations[s.id] ?? 0), 0);

  // Ruler ticks
  const tickCount = 8;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const pct = i / tickCount;
    const visStart = scrollPct / 100;
    const visEnd = visStart + 1 / zoom;
    const timePct = visStart + pct * (visEnd - visStart);
    return { pct: pct * 100, time: timePct * maxDuration };
  });

  if (stems.length === 0) return null;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/25 p-4">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={onPlayPause}
          disabled={Object.keys(stemStates).length === 0}
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
            className="flex h-8 w-8 items-center justify-center text-white/60 hover:text-white disabled:opacity-30 transition"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="px-1 text-xs text-white/50">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(8, z * 1.5))}
            disabled={zoom >= 8}
            className="flex h-8 w-8 items-center justify-center text-white/60 hover:text-white disabled:opacity-30 transition"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>

        {zoom > 1 && (
          <input
            type="range" min={0} max={100 - 100 / zoom} step={0.5}
            value={scrollPct}
            onChange={(e) => setScrollPct(Number(e.target.value))}
            className="w-32"
            title="Scroll timeline"
          />
        )}

        <button
          type="button"
          onClick={() => { setZoom(1); setScrollPct(0); }}
          className="ml-auto flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:text-white transition"
          title="Reset zoom"
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

      {/* ── Waveform lanes (all stems) ── */}
      <div className="flex flex-col gap-1.5">
        {isLoadingStems ? (
          stems.map((s) => (
            <div key={s.id} className="h-14 animate-pulse rounded-lg bg-white/10" />
          ))
        ) : (
          stems.map((s) => {
            const wf = waveforms[s.id] ?? Array(WAVEFORM_BINS).fill(0.15);
            const st = stemStates[s.id] ?? defaultStemState();
            return (
              <div
                key={s.id}
                onClick={() => setActiveStemId(s.id)}
                className="cursor-pointer"
              >
                <WaveformLane
                  stem={s}
                  waveform={wf}
                  trim={st.trim}
                  playheadPct={playheadPct}
                  isActive={s.id === activeStemId}
                  isMuted={st.muted}
                  zoom={zoom}
                  scrollPct={scrollPct}
                  onTrimChange={(t) => onStemStateChange(s.id, { trim: t })}
                  onSeek={onSeek}
                />
              </div>
            );
          })
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
          onChange={(patch) => onStemStateChange(activeStem.id, patch)}
          onPreview={() => onPreviewStem(activeStem.id)}
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
