import { defaultStemState, type StemEditorState } from "../stem-editor-state";
import { defaultMixer, mergeMixerState } from "../types";

const EPS = 0.001;

function mixerModified(mixer: StemEditorState["mixer"]): boolean {
  const m = mergeMixerState(mixer);
  const d = defaultMixer;
  return (
    Math.abs(m.gain - d.gain) > EPS ||
    Math.abs(m.pan - d.pan) > EPS ||
    Math.abs(m.width - d.width) > EPS ||
    Math.abs(m.eqLow - d.eqLow) > EPS ||
    Math.abs(m.eqLowMid - d.eqLowMid) > EPS ||
    Math.abs(m.eqMid - d.eqMid) > EPS ||
    Math.abs(m.eqHigh - d.eqHigh) > EPS ||
    Math.abs(m.warmth - d.warmth) > EPS ||
    Math.abs(m.presence - d.presence) > EPS ||
    Math.abs(m.reverbWet - d.reverbWet) > EPS ||
    Math.abs(m.delayWet - d.delayWet) > EPS ||
    Math.abs(m.compThreshold - d.compThreshold) > EPS ||
    Math.abs(m.compRatio - d.compRatio) > EPS ||
    Math.abs(m.compAttackMs - d.compAttackMs) > EPS ||
    Math.abs(m.compReleaseMs - d.compReleaseMs) > EPS
  );
}

/** True when stem deviates from default trim, mixer, pitch, stretch, fades, mute, or solo. */
export function isStemModified(state: StemEditorState): boolean {
  const d = defaultStemState();
  const trim = state.trim ?? d.trim;
  return (
    Math.abs(trim.start - d.trim.start) > EPS ||
    Math.abs(trim.end - d.trim.end) > EPS ||
    mixerModified(state.mixer) ||
    Math.abs((state.rate ?? 1) - d.rate) > EPS ||
    Math.abs((state.pitchSemitones ?? 0) - d.pitchSemitones) > EPS ||
    Math.abs((state.timeStretch ?? 1) - d.timeStretch) > EPS ||
    (state.fadeIn ?? 0) > EPS ||
    (state.fadeOut ?? 0) > EPS ||
    Boolean(state.muted) ||
    Boolean(state.soloed)
  );
}
