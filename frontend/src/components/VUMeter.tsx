import { useCallback, useEffect, useRef, useState } from "react";
import {
  computeTimeDomainPeak,
  computeTimeDomainRms,
  METER_CLIP_LATCH_MS,
  METER_CLIP_PEAK_THRESHOLD,
  METER_PEAK_DECAY_DB_PER_SEC,
  METER_PEAK_HOLD_MS,
  rmsToMeterLevel,
} from "../utils/analyser-meter";

export type VUMeterColorMode = "stem" | "vu-gradient";

export interface VUMeterProps {
  getAnalyserData: () => Uint8Array | null;
  color: string;
  isPlaying: boolean;
  height?: number;
  width?: number;
  /** stem: use stem color for low segments; vu-gradient: green/amber/red hardware meter. */
  colorMode?: VUMeterColorMode;
  /** Draw white peak-hold line with decay (channel strips). */
  showPeakHold?: boolean;
  /** Latch clip LED when peak exceeds digital full scale. */
  showClipIndicator?: boolean;
}

/** Segmented level meter (time-domain RMS) with optional peak hold and clip LED. */
export function VUMeter({
  getAnalyserData,
  color,
  isPlaying,
  height = 80,
  width = 12,
  colorMode = "stem",
  showPeakHold = false,
  showClipIndicator = false,
}: VUMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const peakPxRef = useRef(0);
  const peakHoldUntilRef = useRef(0);
  const clipUntilRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const [clipped, setClipped] = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const segCount = 16;
    const gap = 2;
    const segH = (height - segCount * gap) / segCount;
    const w = canvas.width;

    ctx.clearRect(0, 0, w, height);

    let level = 0;
    let peakSample = 0;
    if (isPlaying) {
      const data = getAnalyserData();
      if (data && data.length > 0) {
        level = rmsToMeterLevel(computeTimeDomainRms(data));
        peakSample = computeTimeDomainPeak(data);
      }
    }

    const now = performance.now();
    const deltaMs = Math.max(
      0,
      lastFrameTimeRef.current > 0 ? now - lastFrameTimeRef.current : 16.67,
    );
    lastFrameTimeRef.current = now;

    if (showClipIndicator) {
      const clippedNow = peakSample >= METER_CLIP_PEAK_THRESHOLD;
      if (clippedNow) {
        clipUntilRef.current = now + METER_CLIP_LATCH_MS;
      }
      const shouldClipLight = isPlaying && clipUntilRef.current > now;
      setClipped((prev) => (prev === shouldClipLight ? prev : shouldClipLight));
    } else {
      setClipped((prev) => (prev ? false : prev));
    }

    const activeSeg = Math.round(level * segCount);

    for (let i = 0; i < segCount; i++) {
      const segY = height - (i + 1) * (segH + gap) + gap;
      const active = i < activeSeg;
      const isHot = i >= segCount * 0.75;
      const isWarm = i >= segCount * 0.5;

      let segColor: string;
      if (active) {
        if (colorMode === "vu-gradient") {
          if (isHot) segColor = "#ef4444";
          else if (isWarm) segColor = "#f59e0b";
          else segColor = "#22c55e";
        } else if (isHot) {
          segColor = "#ef4444";
        } else if (isWarm) {
          segColor = "#f59e0b";
        } else {
          segColor = color;
        }
      } else {
        segColor = "rgba(255,255,255,0.06)";
      }

      ctx.fillStyle = segColor;
      if (active) {
        ctx.shadowBlur = 4;
        ctx.shadowColor = segColor;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.fillRect(0, segY, w, segH);
    }
    ctx.shadowBlur = 0;

    if (showPeakHold && isPlaying) {
      const peakPx = level * height;
      const prevPeak = peakPxRef.current;
      const decayPerSecond = Math.pow(10, -METER_PEAK_DECAY_DB_PER_SEC / 20);
      const decayFactor = Math.pow(decayPerSecond, deltaMs / 1000);

      let newPeak = prevPeak;
      if (peakPx >= prevPeak) {
        newPeak = peakPx;
        peakHoldUntilRef.current = now + METER_PEAK_HOLD_MS;
      } else if (peakHoldUntilRef.current <= now) {
        newPeak = prevPeak * decayFactor;
      }
      peakPxRef.current = newPeak;

      if (newPeak > 0.5) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, Math.max(0, height - newPeak - 1), w, 2);
      }
    } else if (!isPlaying) {
      peakPxRef.current = 0;
      peakHoldUntilRef.current = 0;
    }

    // eslint-disable-next-line react-hooks/immutability -- recursive rAF pattern (draw schedules itself)
    animRef.current = requestAnimationFrame(draw);
  }, [
    getAnalyserData,
    color,
    colorMode,
    isPlaying,
    height,
    showPeakHold,
    showClipIndicator,
  ]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  const meter = (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="rounded-sm"
      style={{ imageRendering: "pixelated" }}
      aria-hidden
    />
  );

  if (!showClipIndicator) {
    return meter;
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        role="status"
        aria-label={clipped ? "Channel clipping" : "Channel level OK"}
        title={clipped ? "Clip" : "No clip"}
        className={
          "h-1.5 w-1.5 shrink-0 rounded-full transition-colors " +
          (clipped ? "bg-destructive-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]" : "bg-muted")
        }
      />
      {meter}
    </div>
  );
}
