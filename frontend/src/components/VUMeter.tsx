import { useEffect, useRef } from "react";

export interface VUMeterProps {
  getAnalyserData: () => Uint8Array | null;
  color: string;
  isPlaying: boolean;
  height?: number;
}

/** Segmented master output level meter (time-domain RMS from Web Audio Analyser). */
export function VUMeter({ getAnalyserData, color, isPlaying, height = 80 }: VUMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const segCount = 16;
    const segH = (height - segCount * 2) / segCount;
    const w = canvas.width;

    const draw = () => {
      ctx.clearRect(0, 0, w, height);

      let level = 0;
      if (isPlaying) {
        const data = getAnalyserData();
        if (data) {
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = data[i]! / 128.0 - 1.0;
            sum += v * v;
          }
          level = Math.sqrt(sum / data.length);
        }
      }

      const activeSeg = Math.round(level * segCount * 3);

      for (let i = 0; i < segCount; i++) {
        const segY = height - (i + 1) * (segH + 2);
        const active = i < activeSeg;
        const isHot = i >= segCount * 0.75;
        const isWarm = i >= segCount * 0.5;

        let segColor: string;
        if (active) {
          if (isHot) segColor = "#ef4444";
          else if (isWarm) segColor = "#f59e0b";
          else segColor = color;
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

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [getAnalyserData, color, isPlaying, height]);

  return (
    <canvas
      ref={canvasRef}
      width={12}
      height={height}
      className="rounded-sm"
      style={{ imageRendering: "pixelated" }}
      aria-hidden
    />
  );
}
