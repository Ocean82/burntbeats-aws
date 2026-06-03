/**
 * Vocal cleanup mixer preset — subtractive EQ + transparent compression + light spatial FX.
 * Tuned for hot / muddy sources (e.g. phone recordings with excess low-mid energy).
 * See audio-engineering-patterns skill: HPF → subtractive EQ → compression → additive → spatial.
 */
import type { MixerState } from "../types";
import { mergeMixerState } from "../types";
import type { MixerPreset } from "../components/MixerPresetsModal";

/** Lead vocal chain after stem separation (mix in mono first, then widen). */
export const vocalCleanupVocalsMixer: MixerState = mergeMixerState({
  gain: -8,
  pan: 0,
  width: 100,
  eqLow: -5,
  eqLowMid: -3.5,
  eqMid: 2,
  eqHigh: 1,
  warmth: 8,
  presence: 2,
  reverbWet: 18,
  delayWet: 12,
  compThreshold: -22,
  compRatio: 3,
  compAttackMs: 12,
  compReleaseMs: 120,
});

const duckMixer = (gainDb: number): MixerState =>
  mergeMixerState({ gain: gainDb, pan: 0, width: 100 });

export function createVocalCleanupPreset(createdAt = Date.now()): MixerPreset {
  return {
    id: "vocal-cleanup",
    name: "Vocal Cleanup",
    createdAt,
    mixerState: {
      vocals: vocalCleanupVocalsMixer,
      drums: duckMixer(-1.5),
      bass: duckMixer(-2),
      melody: duckMixer(-1),
      instrumental: duckMixer(-1.5),
      other: duckMixer(-1),
    },
    trimMap: {},
    mutedStems: {},
    pitchMap: {},
    timeStretchMap: {},
  };
}

export const VOCAL_CLEANUP_PRESET = createVocalCleanupPreset();
