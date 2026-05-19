import type { MixerState } from "../types";
import { defaultMixer, mergeMixerState } from "../types";
import type { StemEditorState } from "../stem-editor-state";

export type CopySettingsScope = "all" | "eq" | "fx" | "pitchTime";

export interface CopyStemSettingsOptions {
  scope: CopySettingsScope;
}

const EQ_KEYS: (keyof MixerState)[] = ["eqLow", "eqLowMid", "eqMid", "eqHigh"];
const FX_KEYS: (keyof MixerState)[] = [
  "warmth",
  "presence",
  "reverbWet",
  "delayWet",
  "compThreshold",
  "compRatio",
  "compAttackMs",
  "compReleaseMs",
];

function pickMixerKeys(mixer: MixerState, keys: (keyof MixerState)[]): Partial<MixerState> {
  const out: Partial<MixerState> = {};
  for (const k of keys) {
    out[k] = mixer[k];
  }
  return out;
}

/** Copy processing from source onto target according to scope. */
export function copyStemSettings(
  source: StemEditorState,
  target: StemEditorState,
  options: CopyStemSettingsOptions,
): StemEditorState {
  const srcMixer = mergeMixerState(source.mixer);
  const next: StemEditorState = { ...target };

  switch (options.scope) {
    case "all":
      next.trim = { ...source.trim };
      next.mixer = { ...srcMixer };
      next.rate = source.rate;
      next.pitchSemitones = source.pitchSemitones;
      next.timeStretch = source.timeStretch;
      break;
    case "eq":
      next.mixer = { ...mergeMixerState(target.mixer), ...pickMixerKeys(srcMixer, EQ_KEYS) };
      break;
    case "fx":
      next.mixer = { ...mergeMixerState(target.mixer), ...pickMixerKeys(srcMixer, FX_KEYS) };
      break;
    case "pitchTime":
      next.pitchSemitones = source.pitchSemitones;
      next.timeStretch = source.timeStretch;
      next.rate = source.rate;
      break;
    default:
      break;
  }

  return next;
}

/** Apply source stem settings to all stem ids (excluding source optional). */
export function applyMixerToAllStems(
  sourceId: string,
  stemStates: Record<string, StemEditorState>,
  stemIds: string[],
  options: CopyStemSettingsOptions,
): Record<string, StemEditorState> {
  const source = stemStates[sourceId];
  if (!source) return stemStates;

  const next = { ...stemStates };
  for (const id of stemIds) {
    if (id === sourceId && options.scope !== "all") continue;
    const target = next[id];
    if (!target) continue;
    next[id] = copyStemSettings(source, target, options);
  }
  return next;
}

export function countModifiedStems(
  stemStates: Record<string, StemEditorState>,
  stemIds: string[],
  isModified: (s: StemEditorState) => boolean,
): number {
  return stemIds.filter((id) => isModified(stemStates[id] ?? { mixer: { ...defaultMixer } } as StemEditorState)).length;
}
