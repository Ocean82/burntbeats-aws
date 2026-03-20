import type { StemEditorState } from "../stem-editor-state";

/** Minimal stem identity for mix routing (playback + export). */
export interface StemMixEntry {
  readonly id: string;
}

/**
 * Which stems are heard in the mix: if any stem is soloed, only soloed stems;
 * otherwise all non-muted stems. Matches `useAudioPlayback` and export behavior.
 */
export function filterStemsForAudibleMix<T extends StemMixEntry>(
  stems: readonly T[],
  stemStates: Record<string, StemEditorState>
): T[] {
  const hasSolo = stems.some((stem) => stemStates[stem.id]?.soloed);
  if (hasSolo) return stems.filter((stem) => stemStates[stem.id]?.soloed);
  return stems.filter((stem) => !stemStates[stem.id]?.muted);
}
