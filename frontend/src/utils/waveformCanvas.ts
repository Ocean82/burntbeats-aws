export interface DrawWaveformBarsParams {
  canvas: HTMLCanvasElement;
  values: number[];
  color: string;
  minimumBarHeightPx: number;
  alphaEven?: number;
  alphaOdd?: number;
  gapPx?: number;
  heightScale?: number;
  /** 0–1 fraction of bars considered "played" (left of playhead). Played bars render brighter. */
  playedFraction?: number;
  /** Optional live analyser modulation values (0–255 bytes). Blended into bar heights during playback. */
  analyserData?: Uint8Array;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function drawWaveformBars({
  canvas,
  values,
  color,
  minimumBarHeightPx,
  alphaEven = 0.9,
  alphaOdd = 0.58,
  gapPx = 1,
  heightScale = 1,
  playedFraction,
  analyserData,
}: DrawWaveformBarsParams): void {
  const context = canvas.getContext("2d");
  if (!context) return;

  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width <= 0 || height <= 0) return;

  const renderWidth = Math.max(1, Math.floor(width * ratio));
  const renderHeight = Math.max(1, Math.floor(height * ratio));
  if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
    canvas.width = renderWidth;
    canvas.height = renderHeight;
  }

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  if (values.length === 0) return;

  const gap = Math.max(0, gapPx);
  const barWidth = Math.max(1, (width - gap * (values.length - 1)) / values.length);
  const playedX = playedFraction != null ? playedFraction * width : -1;

  for (let index = 0; index < values.length; index++) {
    let value = clamp(values[index], 0, 1);

    // Blend in live analyser modulation (±15% of bar height)
    if (analyserData && analyserData.length > 0) {
      const bin = Math.floor((index / values.length) * analyserData.length);
      const mod = (analyserData[bin] ?? 128) / 255; // 0–1
      value = clamp(value * (0.85 + mod * 0.3), 0, 1);
    }

    const barHeight = Math.max(minimumBarHeightPx, value * height * heightScale);
    const x = index * (barWidth + gap);
    const y = (height - barHeight) / 2;

    const isPlayed = playedX >= 0 && x < playedX;
    const baseAlpha = index % 2 === 0 ? alphaEven : alphaOdd;
    context.globalAlpha = isPlayed ? Math.min(1, baseAlpha + 0.25) : baseAlpha;
    context.fillStyle = color;

    if (typeof context.roundRect === "function") {
      context.beginPath();
      context.roundRect(x, y, barWidth, barHeight, barWidth / 2);
      context.fill();
    } else {
      (context as CanvasRenderingContext2D).fillRect(x, y, barWidth, barHeight);
    }
  }
  context.globalAlpha = 1;
}

/**
 * Generate a stem-type-aware fake waveform for loading skeletons.
 * Each stem type has a characteristic shape so the skeleton looks intentional.
 */
export function generateFakeWaveform(stemId: string, bins = 200): number[] {
  const result: number[] = new Array(bins);
  switch (stemId) {
    case "drums": {
      // Spiky transients — sharp peaks at regular intervals
      for (let i = 0; i < bins; i++) {
        const beat = (i % Math.floor(bins / 16)) / Math.floor(bins / 16);
        result[i] = beat < 0.08 ? 0.7 + Math.random() * 0.3 : 0.1 + Math.random() * 0.15;
      }
      break;
    }
    case "bass": {
      // Slow undulation — low-frequency body
      for (let i = 0; i < bins; i++) {
        result[i] = clamp(0.45 + 0.35 * Math.sin((i / bins) * Math.PI * 6) + Math.random() * 0.1, 0.1, 1);
      }
      break;
    }
    case "vocals": {
      // Phrase-like bursts with gaps (breath between phrases)
      for (let i = 0; i < bins; i++) {
        const phrase = Math.sin((i / bins) * Math.PI * 5);
        result[i] = clamp(Math.abs(phrase) * 0.7 + Math.random() * 0.15, 0.08, 1);
      }
      break;
    }
    case "melody": {
      // Mid-range with gentle variation
      for (let i = 0; i < bins; i++) {
        const wave = Math.sin((i / bins) * Math.PI * 10) * 0.3;
        result[i] = clamp(0.4 + wave + Math.random() * 0.12, 0.12, 0.85);
      }
      break;
    }
    default: {
      // Generic smooth noise for instrumental/other
      for (let i = 0; i < bins; i++) {
        result[i] = clamp(0.35 + Math.sin((i / bins) * Math.PI * 8) * 0.2 + Math.random() * 0.15, 0.1, 0.9);
      }
    }
  }
  return result;
}
