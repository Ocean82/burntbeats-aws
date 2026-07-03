/**
 * StemFocusOverlay — Full-screen takeover for focused single-stem editing.
 *
 * Renders as a fixed overlay above the workspace when a user expands a stem.
 * Shows: transport, full-width waveform, tool drawers (EQ/FX/pitch/time), and
 * a bottom bar with S/M/volume and close button.
 *
 * Escape key or close button exits back to multi-stem overview.
 */
import { useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  X,
  Play,
  Pause,
  Square,
  SkipBack,
  Music,
  SlidersHorizontal,
  Timer,
  Volume2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/utils/cn";
import type { WaveformTimelineStem } from "./WaveformTimeline";
import { generateFakeWaveform, drawWaveformBars } from "@/utils/waveformCanvas";

/* ─── Types ─────────────────────────────────────────────────────── */

export interface StemFocusOverlayProps {
  stem: WaveformTimelineStem;
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Current playhead position 0-100 */
  playheadPct: number;
  onPlayPause: () => void;
  onStop: () => void;
  onRewind: () => void;
  onSeek: (pct: number) => void;
  onClose: () => void;
}

/* ─── Tool Drawer Tabs ──────────────────────────────────────────── */

type FocusTool = "pitch" | "eq" | "timeStretch" | "volume" | "fx";

const FOCUS_TOOLS: { id: FocusTool; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "pitch", label: "Pitch", icon: Music },
  { id: "eq", label: "EQ", icon: SlidersHorizontal },
  { id: "timeStretch", label: "Time", icon: Timer },
  { id: "volume", label: "Volume", icon: Volume2 },
  { id: "fx", label: "FX", icon: Sparkles },
];

/* ─── Main Component ────────────────────────────────────────────── */

export function StemFocusOverlay({
  stem,
  isPlaying,
  playheadPct,
  onPlayPause,
  onStop,
  onRewind,
  onSeek,
  onClose,
}: StemFocusOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Draw waveform on mount and resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);

      const waveform = generateFakeWaveform(stem.id, 1024);
      drawWaveformBars({
        canvas,
        values: waveform,
        color: stem.color,
        minimumBarHeightPx: 6,
        alphaEven: 0.92,
        alphaOdd: 0.65,
        gapPx: 1.5,
        heightScale: 0.92,
        centerGapPx: 3,
        playedFraction: playheadPct / 100,
      });
    };

    draw();

    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [stem.id, stem.color, playheadPct]);

  const handleSeekFromClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      onSeek(Math.max(0, Math.min(100, pct)));
    },
    [onSeek],
  );

  return (
    <motion.div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-[hsl(220,15%,6%)]"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      role="dialog"
      aria-label={`${stem.label} — focused editor`}
      aria-modal="true"
    >
      {/* ─── Header: stem name + close ─── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: stem.color, boxShadow: `0 0 8px ${stem.color}` }}
            aria-hidden
          />
          <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: stem.color }}>
            {stem.label}
          </h2>
          <span className="text-xs text-muted-foreground">Focus Mode</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Exit focus mode"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* ─── Transport controls ─── */}
      <div className="flex items-center justify-center gap-2 px-4 py-2 border-b border-white/[0.04]">
        <button
          type="button"
          onClick={onRewind}
          aria-label="Rewind"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 transition"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onPlayPause}
          aria-label={isPlaying ? "Pause" : "Play"}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl transition",
            isPlaying
              ? "bg-primary-500/20 text-primary-100 hover:bg-primary-500/30"
              : "text-neutral-200 hover:text-white hover:bg-white/10",
          )}
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 transition"
        >
          <Square className="h-4 w-4" />
        </button>
      </div>

      {/* ─── Main waveform area (takes remaining space) ─── */}
      <div className="flex-1 relative min-h-0 px-4 py-3">
        <div
          className="relative h-full w-full rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden cursor-crosshair"
          onClick={handleSeekFromClick}
          role="slider"
          aria-label="Seek position"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(playheadPct)}
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          />

          {/* Playhead */}
          <div
            className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-white/80 shadow-[0_0_8px_rgba(255,255,255,0.4)]"
            style={{ left: `${Math.min(Math.max(playheadPct, 0), 100)}%` }}
            aria-hidden
          />
        </div>
      </div>

      {/* ─── Tool drawer tabs (below waveform) ─── */}
      <div className="border-t border-white/[0.06] px-4 py-3">
        <div className="flex items-center justify-center gap-1">
          {FOCUS_TOOLS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition",
                "text-neutral-400 hover:text-white hover:bg-white/10 border border-transparent",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
        {/* Tool content area — placeholder for future per-tool controls */}
        <div className="mt-2 flex items-center justify-center text-xs text-muted-foreground min-h-[48px]">
          Tap a tool above to adjust this stem
        </div>
      </div>

      {/* ─── Bottom bar: volume + close ─── */}
      <div className="flex items-center gap-4 px-4 py-3 border-t border-white/[0.06] bg-[hsl(220,15%,8%)]/80">
        <Volume2 className="h-4 w-4 text-neutral-400 shrink-0" aria-hidden />
        <input
          type="range"
          min={-20}
          max={6}
          step={0.5}
          defaultValue={0}
          aria-label={`${stem.label} volume`}
          className="flex-1 h-1 appearance-none rounded-full bg-white/20 accent-primary-400 cursor-pointer"
        />
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/10 border border-white/10 transition"
        >
          <X className="h-3.5 w-3.5" />
          Close
        </button>
      </div>
    </motion.div>
  );
}
