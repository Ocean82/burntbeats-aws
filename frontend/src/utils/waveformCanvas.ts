export interface DrawWaveformBarsParams {
  canvas: HTMLCanvasElement;
  values: number[];
  color: string;
  minimumBarHeightPx: number;
  alphaEven?: number;
  alphaOdd?: number;
  gapPx?: number;
  heightScale?: number;
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
  context.fillStyle = color;

  for (let index = 0; index < values.length; index++) {
    const value = clamp(values[index], 0, 1);
    const barHeight = Math.max(minimumBarHeightPx, value * height * heightScale);
    const x = index * (barWidth + gap);
    const y = (height - barHeight) / 2;
    context.globalAlpha = index % 2 === 0 ? alphaEven : alphaOdd;
    if (typeof context.roundRect === "function") {
      context.beginPath();
      context.roundRect(x, y, barWidth, barHeight, barWidth / 2);
      context.fill();
    } else {
      (context as any).fillRect(x, y, barWidth, barHeight);
    }
  }
  context.globalAlpha = 1;
}
