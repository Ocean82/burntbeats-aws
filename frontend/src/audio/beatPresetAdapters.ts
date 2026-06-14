/**
 * Adapters between genre preset catalog entries and beat maker load shapes.
 */
import type { BeatPreset } from "../hooks/useBeatMaker";
import type { GenrePresetPattern } from "./genrePresets";

export function genrePresetToBeatPreset(preset: GenrePresetPattern): BeatPreset {
  return {
    name: preset.name,
    pattern: preset.pattern,
    bpm: preset.tempo,
    swing: preset.swing,
    steps: preset.steps,
  };
}
