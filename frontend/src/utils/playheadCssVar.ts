/** CSS variable for `.waveform-global-playhead-line` horizontal position (0–100). */
export interface PlayheadPercentVar {
  readonly "--playhead-pct": number;
}

export function playheadPercentStyle(visiblePercent: number): PlayheadPercentVar {
  return { "--playhead-pct": visiblePercent };
}
