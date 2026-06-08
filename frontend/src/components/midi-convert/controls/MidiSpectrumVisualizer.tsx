/**
 * MidiSpectrumVisualizer — real-time FFT frequency spectrum display.
 * Adapted from pitch-tempo-plugin SpectrumAnalyzer, themed to midi-gold.
 *
 * Shows animated frequency bars during playback, idle grid when inactive.
 */
import { useEffect, useRef } from "react";
import { cn } from "../../../utils/cn";
import "../midi-tokens.css";

export interface MidiSpectrumVisualizerProps {
  /** Connected AnalyserNode from the audio graph. */
  analyserNode: AnalyserNode | null;
  /** Whether the visualizer should animate (typically tied to playback state). */
  isActive: boolean;
  /** Canvas height in pixels. Default 56. */
  height?: number;
  className?: string;
}

// Midi-gold palette
const BAR_COLOR_R = 205;
const BAR_COLOR_G = 165;
const BAR_COLOR_B = 60;
const BG_COLOR = "#131210"; // --midi-surface-inset
const GRID_COLOR = "rgba(205, 165, 60, 0.06)";
const LABEL_COLOR = "rgba(255, 245, 220, 0.25)";
const PEAK_COLOR = "rgba(255, 245, 220, 0.6)";

export function MidiSpectrumVisualizer({
  analyserNode,
  isActive,
  height = 56,
  className,
}: MidiSpectrumVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const reducedMotion = useRef(false);

  // Detect reduced motion preference
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => {
      reducedMotion.current = e.matches;
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const BINS = analyserNode ? analyserNode.frequencyBinCount : 512;
    const dataArray = new Float32Array(BINS);

    const drawIdle = () => {
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, W, H);

      // Subtle grid lines
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(0, (i / 6) * H);
        ctx.lineTo(W, (i / 6) * H);
        ctx.stroke();
      }
    };

    const drawSpectrum = () => {
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, W, H);

      if (analyserNode) {
        analyserNode.getFloatFrequencyData(dataArray);
      }

      const displayBins = Math.min(BINS / 2, 128);
      const barW = W / displayBins;

      for (let i = 0; i < displayBins; i++) {
        const db = dataArray[i] ?? -100;
        const norm = Math.max(0, (db + 100) / 100); // -100..0 dBFS → 0..1
        const barH = norm * H;
        const x = (i / displayBins) * W;

        // Bar color with velocity-based alpha
        const alpha = 0.3 + norm * 0.6;
        ctx.fillStyle = `rgba(${BAR_COLOR_R},${BAR_COLOR_G},${BAR_COLOR_B},${alpha})`;
        ctx.fillRect(x, H - barH, barW - 0.5, barH);

        // Peak highlight
        if (norm > 0.75) {
          ctx.fillStyle = PEAK_COLOR;
          ctx.fillRect(x, H - barH - 1, barW - 0.5, 2);
        }
      }

      // Frequency labels
      ctx.fillStyle = LABEL_COLOR;
      ctx.font = "9px ui-monospace, monospace";
      ctx.textAlign = "center";
      const sampleRate = analyserNode?.context.sampleRate ?? 44100;
      const freqs = [100, 500, 1000, 5000, 10000];
      for (const f of freqs) {
        const x = (Math.log2(f / 20) / Math.log2(sampleRate / 2 / 20)) * W;
        if (x > 20 && x < W - 20) {
          ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, H - 3);
        }
      }
    };

    if (!isActive || !analyserNode) {
      drawIdle();
      return;
    }

    // Reduced motion: draw once, don't animate
    if (reducedMotion.current) {
      drawSpectrum();
      return;
    }

    const animate = () => {
      drawSpectrum();
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(rafRef.current);
  }, [analyserNode, isActive]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={height}
      className={cn(
        "w-full rounded-lg border border-[var(--midi-border)]",
        className,
      )}
      style={{ height: `${height}px` }}
      role="img"
      aria-label="Audio frequency spectrum"
    />
  );
}
