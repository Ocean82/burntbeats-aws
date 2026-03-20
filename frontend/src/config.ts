// Global configuration constants: first step is always 2-stem (vocals + instrumental).
export const DEFAULT_STEM_COUNT = 2 as const;

export const MASTER_CHAIN = { compression: 2.4, limiter: -0.8, loudness: -9 } as const;

export const PIPELINE_ANIMATION_DELAYS_MS = { toStep1: 400, toStep2: 1200 } as const;

export const PIPELINE_PROGRESS_THRESHOLDS = { step2: 50, step3: 100 } as const;
