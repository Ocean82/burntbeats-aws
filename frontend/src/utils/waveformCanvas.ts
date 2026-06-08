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
  /** Draw a faint horizontal zero-amplitude axis line through the center. Defaults to true. */
  centerLine?: boolean;
  /** Gap in px between the top and bottom mirrored halves at the center baseline. Defaults to 2. */
  centerGapPx?: number;
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
  centerLine = true,
  centerGapPx = 2,
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

  const centerY = height / 2;
  const centerGap = Math.max(0, centerGapPx) / 2;
  // Maximum half-height available for each mirrored side (above/below center).
  const maxHalf = Math.max(1, centerY - centerGap);
  const radius = Math.min(barWidth / 2, 2);

  // Faint zero-amplitude axis line through the vertical center.
  if (centerLine) {
    context.globalAlpha = 0.18;
    context.fillStyle = color;
    context.fillRect(0, Math.round(centerY) - 0.5, width, 1);
  }

  for (let index = 0; index < values.length; index++) {
    let value = clamp(values[index], 0, 1);

    // Blend in live analyser modulation (±15% of bar height)
    if (analyserData && analyserData.length > 0) {
      const bin = Math.floor((index / values.length) * analyserData.length);
      const mod = (analyserData[bin] ?? 128) / 255; // 0–1
      value = clamp(value * (0.85 + mod * 0.3), 0, 1);
    }

    // Half-height for each mirrored side; minimum keeps quiet sections visible.
    const half = Math.max(minimumBarHeightPx / 2, value * maxHalf * heightScale);
    const x = index * (barWidth + gap);

    const isPlayed = playedX >= 0 && x < playedX;
    const baseAlpha = index % 2 === 0 ? alphaEven : alphaOdd;
    context.globalAlpha = isPlayed ? Math.min(1, baseAlpha + 0.25) : baseAlpha;
    context.fillStyle = color;

    // Top half (rounded outer cap) + mirrored bottom half (rounded outer cap).
    const topY = centerY - centerGap - half;
    const bottomY = centerY + centerGap;
    if (typeof context.roundRect === "function") {
      context.beginPath();
      context.roundRect(x, topY, barWidth, half, [radius, radius, 0, 0]);
      context.roundRect(x, bottomY, barWidth, half, [0, 0, radius, radius]);
      context.fill();
    } else {
      const ctx2d = context as CanvasRenderingContext2D;
      ctx2d.fillRect(x, topY, barWidth, half);
      ctx2d.fillRect(x, bottomY, barWidth, half);
    }
  }
  context.globalAlpha = 1;
}

/**
 * Simple seeded PRNG (mulberry32) for deterministic fake waveforms.
 * Ensures the same stemId + bins always produces the same shape,
 * preventing memoization busting and visual flicker.
 */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stemIdToSeed(stemId: string): number {
  let hash = 0;
  for (let i = 0; i < stemId.length; i++) {
    hash = ((hash << 5) - hash + stemId.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Generate a stem-type-aware fake waveform for loading skeletons.
 * Each stem type has a characteristic shape so the skeleton looks intentional.
 * Uses a seeded PRNG so the output is deterministic for a given stemId + bins.
 */
export function generateFakeWaveform(stemId: string, bins = 200): number[] {
  const rand = seededRandom(stemIdToSeed(stemId) + bins);
  const result: number[] = new Array(bins);
  switch (stemId) {
    case "drums": {
      // Spiky transients — sharp peaks at regular intervals
      for (let i = 0; i < bins; i++) {
        const beat = (i % Math.floor(bins / 16)) / Math.floor(bins / 16);
        result[i] = beat < 0.08 ? 0.7 + rand() * 0.3 : 0.1 + rand() * 0.15;
      }
      break;
    }
    case "bass": {
      // Slow undulation — low-frequency body
      for (let i = 0; i < bins; i++) {
        result[i] = clamp(0.45 + 0.35 * Math.sin((i / bins) * Math.PI * 6) + rand() * 0.1, 0.1, 1);
      }
      break;
    }
    case "vocals": {
      // Phrase-like bursts with gaps (breath between phrases)
      for (let i = 0; i < bins; i++) {
        const phrase = Math.sin((i / bins) * Math.PI * 5);
        result[i] = clamp(Math.abs(phrase) * 0.7 + rand() * 0.15, 0.08, 1);
      }
      break;
    }
    case "melody": {
      // Mid-range with gentle variation
      for (let i = 0; i < bins; i++) {
        const wave = Math.sin((i / bins) * Math.PI * 10) * 0.3;
        result[i] = clamp(0.4 + wave + rand() * 0.12, 0.12, 0.85);
      }
      break;
    }
    default: {
      // Generic smooth noise for instrumental/other
      for (let i = 0; i < bins; i++) {
        result[i] = clamp(0.35 + Math.sin((i / bins) * Math.PI * 8) * 0.2 + rand() * 0.15, 0.1, 0.9);
      }
    }
  }
  return result;
}
