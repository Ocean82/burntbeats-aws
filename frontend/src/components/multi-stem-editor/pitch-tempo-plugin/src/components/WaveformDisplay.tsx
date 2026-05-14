import React, { useEffect, useRef } from 'react';

interface WaveformDisplayProps {
  buffer: AudioBuffer | null;
  color: string;
  currentTime?: number;
  duration?: number;
  isPlaying?: boolean;
}

export const WaveformDisplay: React.FC<WaveformDisplayProps> = ({
  buffer,
  color,
  currentTime = 0,
  duration = 0,
  isPlaying = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;
    const ctx  = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / W);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.beginPath();

    for (let x = 0; x < W; x++) {
      let min = 1, max = -1;
      for (let j = 0; j < step; j++) {
        const sample = data[x * step + j] || 0;
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }
      const yMin = ((1 + min) / 2) * H;
      const yMax = ((1 + max) / 2) * H;
      if (x === 0) ctx.moveTo(x, yMin);
      ctx.lineTo(x, yMax);
      ctx.lineTo(x, yMin);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Center line
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
  }, [buffer, color]);

  // Animate playhead
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;

      // Re-draw waveform (simplified — draw only playhead overlay)
      const data = buffer.getChannelData(0);
      const step = Math.ceil(data.length / W);

      ctx2d.clearRect(0, 0, W, H);
      ctx2d.fillStyle = 'rgba(0,0,0,0.4)';
      ctx2d.fillRect(0, 0, W, H);

      // Waveform
      ctx2d.strokeStyle = color;
      ctx2d.lineWidth = 1.5;
      ctx2d.shadowColor = color;
      ctx2d.shadowBlur = 3;
      ctx2d.beginPath();
      for (let x = 0; x < W; x++) {
        let min = 1, max = -1;
        for (let j = 0; j < step; j++) {
          const sample = data[x * step + j] || 0;
          if (sample < min) min = sample;
          if (sample > max) max = sample;
        }
        const yMin = ((1 + min) / 2) * H;
        const yMax = ((1 + max) / 2) * H;
        if (x === 0) ctx2d.moveTo(x, yMin);
        ctx2d.lineTo(x, yMax);
        ctx2d.lineTo(x, yMin);
      }
      ctx2d.stroke();
      ctx2d.shadowBlur = 0;

      // Center line
      ctx2d.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx2d.lineWidth = 1;
      ctx2d.beginPath();
      ctx2d.moveTo(0, H / 2);
      ctx2d.lineTo(W, H / 2);
      ctx2d.stroke();

      // Progress fill
      if (duration > 0) {
        const progress = Math.min(currentTime / duration, 1);
        const x = progress * W;

        ctx2d.fillStyle = 'rgba(255,255,255,0.07)';
        ctx2d.fillRect(0, 0, x, H);

        // Playhead line
        ctx2d.strokeStyle = '#ffffff';
        ctx2d.lineWidth = 2;
        ctx2d.shadowColor = '#ffffff';
        ctx2d.shadowBlur = 8;
        ctx2d.beginPath();
        ctx2d.moveTo(x, 0);
        ctx2d.lineTo(x, H);
        ctx2d.stroke();
        ctx2d.shadowBlur = 0;
      }

      if (isPlaying) animRef.current = requestAnimationFrame(draw);
    };

    if (isPlaying) {
      animRef.current = requestAnimationFrame(draw);
    } else {
      draw();
    }

    return () => cancelAnimationFrame(animRef.current);
  }, [buffer, color, currentTime, duration, isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={64}
      className="w-full h-16 rounded-lg"
      style={{ imageRendering: 'pixelated' }}
    />
  );
};
