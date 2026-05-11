/**
 * Client-side master WAV rendering via OfflineAudioContext.
 * Mixes audible stems with gain, pan, width, rate, and trim applied.
 */
import type { StemResult } from "../../types";
import { audioBufferToWav, normalizeAudioBuffer, trimToSeconds, createStereoWidthNode } from "../../utils/audio";
import { defaultStemState, getStemEffectiveRate, type StemEditorState } from "../../stem-editor-state";
import { filterStemsForAudibleMix } from "../../utils/stemAudibility";

export async function renderClientMasterWavBlob(
  options: { normalize?: boolean },
  stemBuffers: Record<string, AudioBuffer>,
  splitResultStems: StemResult[],
  stemStates: Record<string, StemEditorState>,
  _uploadName: string
): Promise<Blob> {
  const stemsToMix = filterStemsForAudibleMix(splitResultStems, stemStates);

  let maxDuration = 0;
  const sources: { buffer: AudioBuffer; gain: number; pan: number; width: number; rate: number; trimStart: number; trimEnd: number }[] = [];

  for (const stem of stemsToMix) {
    const buffer = stemBuffers[stem.id];
    if (!buffer) continue;
    const st = stemStates[stem.id] ?? defaultStemState();
    const { trimStart, trimEnd } = trimToSeconds(buffer, st.trim);
    const rate = getStemEffectiveRate(st);
    const wallDuration = (trimEnd - trimStart) / rate;
    maxDuration = Math.max(maxDuration, wallDuration);
    sources.push({
      buffer,
      gain: Math.pow(10, st.mixer.gain / 20),
      pan: st.mixer.pan / 100,
      width: st.mixer.width,
      rate,
      trimStart,
      trimEnd,
    });
  }

  if (maxDuration === 0) throw new Error("No valid stems to export (missing buffers?).");

  const context = new OfflineAudioContext(2, Math.ceil(maxDuration * 44100), 44100);
  for (const { buffer, gain, pan, width, rate, trimStart, trimEnd } of sources) {
    const source = context.createBufferSource();
    const gainNode = context.createGain();
    const panNode = context.createStereoPanner();
    const widthNode = createStereoWidthNode(context);
    source.buffer = buffer;
    source.playbackRate.value = rate;
    gainNode.gain.value = gain;
    panNode.pan.value = pan;
    widthNode.setWidth(width);
    source.connect(gainNode);
    gainNode.connect(panNode);
    panNode.connect(widthNode.input);
    widthNode.output.connect(context.destination);
    source.start(0, trimStart, trimEnd - trimStart);
  }

  let rendered = await context.startRendering();
  if (options.normalize) rendered = normalizeAudioBuffer(rendered);
  return audioBufferToWav(rendered);
}
