import { useMemo } from "react";
import type { MixerState, TrimState } from "../types";
import type { StemEditorState } from "../stem-editor-state";

export interface StemStateMaps {
  trimMap: Record<string, TrimState>;
  mixerState: Record<string, MixerState>;
  mutedStems: Record<string, boolean>;
  pitchMap: Record<string, number>;
  timeStretchMap: Record<string, number>;
  fadeMap: Record<string, { fadeIn: number; fadeOut: number }>;
}

export type StemStatesRecord = Record<string, StemEditorState>;

/**
 * Derives flat maps from stemStates for modal/preset consumption.
 * Single-pass extraction to avoid multiple iterations over the same object.
 */
export function useStemStateMaps(stemStates: StemStatesRecord): StemStateMaps {
  return useMemo(() => {
    const trimMap: Record<string, TrimState> = {};
    const mixerState: Record<string, MixerState> = {};
    const mutedStems: Record<string, boolean> = {};
    const pitchMap: Record<string, number> = {};
    const timeStretchMap: Record<string, number> = {};
    const fadeMap: Record<string, { fadeIn: number; fadeOut: number }> = {};

    for (const [id, s] of Object.entries(stemStates)) {
      trimMap[id] = s.trim;
      mixerState[id] = s.mixer;
      mutedStems[id] = s.muted;
      pitchMap[id] = s.pitchSemitones ?? 0;
      timeStretchMap[id] = s.timeStretch ?? 1;
      fadeMap[id] = { fadeIn: s.fadeIn ?? 0, fadeOut: s.fadeOut ?? 0 };
    }

    return {
      trimMap,
      mixerState,
      mutedStems,
      pitchMap,
      timeStretchMap,
      fadeMap,
    };
  }, [stemStates]);
}
