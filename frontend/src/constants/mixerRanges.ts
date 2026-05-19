/** Shared UI/DSP ranges for stem pitch and time stretch — keep plugin + sliders in sync. */

export const PITCH_MIN = -12;
export const PITCH_MAX = 12;
export const PITCH_STEP = 0.1;

export const TIME_STRETCH_MIN = 0.5;
export const TIME_STRETCH_MAX = 1.5;
export const TIME_STRETCH_STEP = 0.01;

/** Plugin tempoRatio = 1 / timeStretch */
export const TEMPO_RATIO_MIN = 1 / TIME_STRETCH_MAX;
export const TEMPO_RATIO_MAX = 1 / TIME_STRETCH_MIN;

export function clampPitch(semitones: number): number {
  return Math.max(PITCH_MIN, Math.min(PITCH_MAX, semitones));
}

export function clampTimeStretch(stretch: number): number {
  return Math.max(TIME_STRETCH_MIN, Math.min(TIME_STRETCH_MAX, stretch));
}

/** Display tempo change as % relative to normal speed (inverse of timeStretch). */
export function timeStretchToDisplayPercent(timeStretch: number): number {
  if (timeStretch <= 0) return 0;
  return Math.round((1 / timeStretch - 1) * 100);
}
