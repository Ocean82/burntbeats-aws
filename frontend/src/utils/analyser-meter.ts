/** RMS level 0–1 from Web Audio byte time-domain data (center = 128). */
export function computeTimeDomainRms(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i]! / 128.0 - 1.0;
    sum += v * v;
  }
  return Math.sqrt(sum / data.length);
}

/** Peak sample level 0–1 (max absolute deviation from center). */
export function computeTimeDomainPeak(data: Uint8Array): number {
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i]! / 128.0 - 1.0);
    if (v > peak) peak = v;
  }
  return peak;
}

/** Visual gain applied to RMS for segmented meters (matches master stereo meter). */
export function rmsToMeterLevel(rms: number): number {
  return Math.min(1, rms * 3);
}

export const METER_PEAK_HOLD_MS = 1500;
export const METER_PEAK_DECAY_DB_PER_SEC = 6;
export const METER_CLIP_LATCH_MS = 1500;
/** True-digital-clip threshold on normalized peak (|sample| near full scale). */
export const METER_CLIP_PEAK_THRESHOLD = 0.98;
