import type { CSSProperties } from "react";

/** CSS variable for `.waveform-global-playhead-line` horizontal position (0–100). */
export type PlayheadPercentVar = CSSProperties & {
  "--playhead-pct"?: number;
};

export function playheadPercentStyle(visiblePercent: number): PlayheadPercentVar {
  return { "--playhead-pct": visiblePercent };
}
