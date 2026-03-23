import { useEffect, useRef } from "react";

export interface SpectrumAnalyzerProps {
  getFrequencyData: () => Uint8Array | null;
  isPlaying: boolean;
  height?: number;
  barCount?: number;
}

/** FFT spectrum bars from Web Audio `getByteFrequencyData`. */
export function SpectrumAnalyzer({
  getFrequencyData,
  isPlaying,
  height = 48,
  barCount = 64,
}: SpectrumAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef(0);
  const peakRef = useRef<number[]>(new Array(barCount).fill(0));

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const wCss = container.clientWidth;
    canvas.width = Math.max(1, Math.floor(wCss * dpr));
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${wCss}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const w = wCss;
    const h = height;
    const barW = w / barCount - 1;

    if (peakRef.current.length !== barCount) {
      peakRef.current = new Array(barCount).fill(0);
    }

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      let data: Uint8Array | null = null;
      if (isPlaying) data = getFrequencyData();

      for (let i = 0; i < barCount; i++) {
        let val = 0;
        if (data) {
          const start = Math.floor((i * data.length) / barCount);
          const end = Math.floor(((i + 1) * data.length) / barCount);
          let sum = 0;
          for (let j = start; j < end; j++) sum += data[j]!;
          const span = Math.max(1, end - start);
          val = sum / span / 255;
        } else {
          val = Math.abs(Math.sin(Date.now() / 1000 + i * 0.3)) * 0.08;
        }

        const barH = Math.max(2, val * h);
        const x = i * (barW + 1);
        const y = h - barH;

        const hue = 260 + (i / barCount) * 60;
        const alpha = 0.4 + val * 0.6;
        ctx.fillStyle = `hsla(${hue}, 80%, 65%, ${alpha})`;
        ctx.fillRect(x, y, barW, barH);

        const peak = peakRef.current[i]!;
        if (val > peak) {
          peakRef.current[i] = val;
        } else {
          peakRef.current[i] = Math.max(0, peak - 0.008);
        }
        if (peak > 0.05) {
          ctx.fillStyle = `hsla(${hue}, 90%, 80%, 0.8)`;
          ctx.fillRect(x, Math.max(0, h - peak * h - 1), barW, 1);
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [getFrequencyData, isPlaying, height, barCount]);

  return (
    <div ref={containerRef} className="w-full min-w-[120px]" style={{ height }}>
      <canvas ref={canvasRef} className="block w-full" />
    </div>
  );
}
