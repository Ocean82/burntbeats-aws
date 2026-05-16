/** Mixer gain range in dB (channel fader). */
export const MIXER_GAIN_DB_MIN = -20;
export const MIXER_GAIN_DB_MAX = 6;

export function formatDb(value: number): string {
  if (value >= 0) return `+${value.toFixed(1)}`;
  return value.toFixed(1);
}

export function formatPan(value: number): string {
  if (value === 0) return "C";
  if (value < 0) return `L${Math.abs(value)}`;
  return `R${value}`;
}

export function clampMixerGainDb(value: number): number {
  return Math.max(MIXER_GAIN_DB_MIN, Math.min(MIXER_GAIN_DB_MAX, value));
}
