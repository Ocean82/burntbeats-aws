import { useEffect, useRef, useState, useCallback } from "react";

export interface StereoVUMeterProps {
  getAnalyserData: () => Uint8Array | null;
  getAnalyserDataLeft?: () => Uint8Array | null;
  getAnalyserDataRight?: () => Uint8Array | null;
  isPlaying: boolean;
  height?: number;
  width?: number;
}

const PEAK_HOLD_MS = 1500;
const PEAK_DECAY_DB_PER_SEC = 6;
const CLIP_LATCH_MS = 1500;

/** Stereo VU meter with peak hold/decay, dB scale, and clip light. */
export function StereoVUMeter({
  getAnalyserData,
  getAnalyserDataLeft,
  getAnalyserDataRight,
  isPlaying,
  height = 120,
  width = 64,
}: StereoVUMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const peakLeftRef = useRef(0);
  const peakRightRef = useRef(0);
  const peakHoldLeftUntilRef = useRef(0);
  const peakHoldRightUntilRef = useRef(0);
  const clipUntilRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const [clipped, setClipped] = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const segCount = 20;
    const gap = 1;
    const totalGap = gap * (segCount - 1);
    const segH = (height - totalGap) / segCount;
    const meterWidth = 8;
    const leftX = width / 2 - meterWidth - 2;
    const rightX = width / 2 + 2;

    let levelLeft = 0;
    let levelRight = 0;

    if (isPlaying) {
      const fallback = getAnalyserData();
      const dataL = getAnalyserDataLeft?.() ?? fallback;
      const dataR = getAnalyserDataRight?.() ?? fallback;
      if (dataL && dataL.length > 0) {
        let sumL = 0;
        for (let i = 0; i < dataL.length; i++) {
          const vL = dataL[i]! / 128.0 - 1.0;
          sumL += vL * vL;
        }
        levelLeft = Math.min(1, Math.sqrt(sumL / dataL.length) * 3);
      }
      if (dataR && dataR.length > 0) {
        let sumR = 0;
        for (let i = 0; i < dataR.length; i++) {
          const vR = dataR[i]! / 128.0 - 1.0;
          sumR += vR * vR;
        }
        levelRight = Math.min(1, Math.sqrt(sumR / dataR.length) * 3);
      }
    }

    const now = performance.now();
    const deltaMs = Math.max(
      0,
      lastFrameTimeRef.current > 0 ? now - lastFrameTimeRef.current : 16.67,
    );
    lastFrameTimeRef.current = now;
    const decayPerSecond = Math.pow(10, -PEAK_DECAY_DB_PER_SEC / 20);
    const decayFactor = Math.pow(decayPerSecond, deltaMs / 1000);

    const clippedNow = levelLeft >= 0.99 || levelRight >= 0.99;
    if (clippedNow) {
      clipUntilRef.current = now + CLIP_LATCH_MS;
    }
    const shouldClipLight = isPlaying && clipUntilRef.current > now;
    setClipped((prev) => (prev === shouldClipLight ? prev : shouldClipLight));

    for (let ch = 0; ch < 2; ch++) {
      const level = ch === 0 ? levelLeft : levelRight;
      const x = ch === 0 ? leftX : rightX;

      for (let i = 0; i < segCount; i++) {
        const segY = height - (i + 1) * (segH + gap) + gap;
        const active = i < Math.round(level * segCount);
        const isHot = i >= segCount * 0.8;
        const isWarm = i >= segCount * 0.6;

        let segColor: string;
        if (active) {
          if (isHot) segColor = "#ef4444";
          else if (isWarm) segColor = "#f59e0b";
          else segColor = "#22c55e";
        } else {
          segColor = "rgba(255,255,255,0.06)";
        }

        ctx.fillStyle = segColor;
        ctx.fillRect(x, segY, meterWidth, segH);
      }

      const peakPx = level * height;
      const prevPeak = ch === 0 ? peakLeftRef.current : peakRightRef.current;
      const peakHoldUntilRef = ch === 0 ? peakHoldLeftUntilRef : peakHoldRightUntilRef;
      let newPeak = prevPeak;
      if (peakPx >= prevPeak) {
        newPeak = peakPx;
        peakHoldUntilRef.current = now + PEAK_HOLD_MS;
      } else if (peakHoldUntilRef.current <= now) {
        newPeak = prevPeak * decayFactor;
      }
      if (ch === 0) peakLeftRef.current = newPeak;
      else peakRightRef.current = newPeak;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, height - newPeak - 2, meterWidth, 2);
    }

    animRef.current = requestAnimationFrame(draw);
  }, [getAnalyserData, getAnalyserDataLeft, getAnalyserDataRight, isPlaying, height, width]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  const dbLabels = [0, -6, -12, -18, -24, -30, -36, -42, -48, -60];

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex items-end gap-0.5">
        <canvas
          ref={canvasRef}
          className="rounded-sm"
          style={{ width, height, imageRendering: "auto" }}
          aria-hidden
        />
        <div className="ml-0.5 flex h-full flex-col justify-between py-0.5">
          {dbLabels.map((db) => (
            <span
              key={db}
              className="font-mono text-[7px] text-white/30 tabular-nums leading-none"
            >
              {db === 0 ? "0" : db}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[8px] font-semibold uppercase tracking-wider text-white/35">L</span>
        <span className="text-[8px] font-semibold uppercase tracking-wider text-white/35">R</span>
        <div
          role="status"
          aria-label="Master clip indicator"
          className={
            "h-2 w-2 rounded-full transition-colors " +
            (clipped ? "bg-red-500 shadow-sm shadow-red-500/60" : "bg-white/10")
          }
          title={clipped ? "Clip" : "No clip"}
        />
        {clipped && (
          <span className="text-[8px] font-semibold uppercase tracking-wider text-red-400">
            Clip
          </span>
        )}
      </div>
    </div>
  );
}
