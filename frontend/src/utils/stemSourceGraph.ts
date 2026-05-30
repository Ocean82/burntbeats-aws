import { getStemEffectiveRate, type StemEditorState } from "../stem-editor-state";
import { createFadeEnvelopeNode, timeStretchToTempoRatio } from "./audio";
import { stemNeedsPlugin } from "./stemPlaybackUtils";
import type { PitchTempoPlugin } from "pitch-plugin";

/**
 * Wire a trimmed buffer source through optional pitch/tempo plugin, fade, and DSP input.
 * Shared by live playback (useAudioPlayback) and offline export (renderClientMaster).
 */
export function buildStemSource(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  st: StemEditorState,
  trimStart: number,
  trimEnd: number,
  dspInput: AudioNode,
  plugin: PitchTempoPlugin | null,
  wallDuration?: number,
  elapsedWall?: number,
): { source: AudioBufferSourceNode; fadeNode: GainNode | null } {
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const usePlugin = plugin !== null && stemNeedsPlugin(st);

  const hasFade = (st.fadeIn ?? 0) > 0 || (st.fadeOut ?? 0) > 0;
  let fadeNode: GainNode | null = null;
  let targetNode: AudioNode = dspInput;

  if (hasFade && wallDuration && wallDuration > 0) {
    fadeNode = createFadeEnvelopeNode(
      ctx,
      st.fadeIn ?? 0,
      st.fadeOut ?? 0,
      wallDuration,
      ctx.currentTime,
      elapsedWall ?? 0,
    );
    fadeNode.connect(dspInput);
    targetNode = fadeNode;
  }

  if (usePlugin) {
    source.playbackRate.value = 1.0;
    source.connect(plugin.inputNode);
    plugin.outputNode.connect(targetNode);
    plugin.setPitchSemitones(st.pitchSemitones);
    plugin.setTempoRatio(timeStretchToTempoRatio(st.timeStretch));
  } else {
    source.playbackRate.value = getStemEffectiveRate(st);
    source.connect(targetNode);
  }

  source.start(0, trimStart, trimEnd - trimStart);
  return { source, fadeNode };
}
