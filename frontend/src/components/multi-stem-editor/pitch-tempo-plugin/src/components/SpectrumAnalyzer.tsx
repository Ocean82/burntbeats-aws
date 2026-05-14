import React, { useEffect, useRef } from 'react';

interface SpectrumAnalyzerProps {
  analyserNode: AnalyserNode | null;
  isPlaying: boolean;
  color?: string;
  height?: number;
}

export const SpectrumAnalyzer: React.FC<SpectrumAnalyzerProps> = ({
  analyserNode,
  isPlaying,
  color = '#8b5cf6',
  height = 80,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const BINS = analyserNode ? analyserNode.frequencyBinCount : 512;
    const dataArray = new Float32Array(BINS);

    const draw = () => {
      if (!isPlaying && !analyserNode) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, W, H);
        // Draw idle grid
        ctx.strokeStyle = 'rgba(139,92,246,0.08)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
          ctx.beginPath();
          ctx.moveTo(0, (i / 8) * H);
          ctx.lineTo(W, (i / 8) * H);
          ctx.stroke();
        }
        return;
      }

      rafRef.current = requestAnimationFrame(draw);

      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, 0, W, H);

      if (analyserNode) {
        analyserNode.getFloatFrequencyData(dataArray);
      } else {
        // Idle animation
        for (let i = 0; i < BINS; i++) {
          dataArray[i] = -100 + Math.random() * 5;
        }
      }

      // Draw spectrum bars
      const barW = W / BINS * 2;
      const hexToRgb = (hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b };
      };
      const rgb = hexToRgb(color.padEnd(7, '0'));

      for (let i = 0; i < BINS / 2; i++) {
        const db  = dataArray[i];
        const norm = Math.max(0, (db + 100) / 100); // -100..0 dBFS → 0..1
        const barH = norm * H;
        const x   = (i / (BINS / 2)) * W;

        const alpha = 0.3 + norm * 0.7;
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
        ctx.fillRect(x, H - barH, barW, barH);

        // Peak line
        if (norm > 0.8) {
          ctx.fillStyle = `rgba(255,255,255,${(norm - 0.8) * 3})`;
          ctx.fillRect(x, H - barH - 1, barW, 2);
        }
      }

      // Frequency labels
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      const freqs = [100, 500, 1000, 5000, 10000];
      const sr = analyserNode?.context.sampleRate ?? 44100;
      for (const f of freqs) {
        const x = (Math.log2(f / 20) / Math.log2(sr / 2 / 20)) * W;
        if (x > 0 && x < W) {
          ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, H - 4);
        }
      }
    };

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyserNode, isPlaying, color]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={height}
      className="w-full rounded-lg"
      style={{ height: `${height}px` }}
    />
  );
};
