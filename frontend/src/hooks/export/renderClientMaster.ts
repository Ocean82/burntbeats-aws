/**
 * Client-side master WAV rendering via OfflineAudioContext.
 * Mixes audible stems with the **full DSP chain** (gain, EQ, compressor,
 * reverb, delay, pan, width, rate, trim) — matching real-time playback exactly.
 */
import type { StemResult } from "../../types";
import { audioBufferToWav, normalizeAudioBuffer, trimToSeconds, createStemDspChain, createFadeEnvelopeNode } from "../../utils/audio";
import { defaultStemState, getStemEffectiveRate, type StemEditorState } from "../../stem-editor-state";
import { filterStemsForAudibleMix } from "../../utils/stemAudibility";

/** Extra seconds appended to offline render to capture reverb/delay tails. */
const EFFECT_TAIL_SECONDS = 2.0;

export async function renderClientMasterWavBlob(
  options: { normalize?: boolean },
  stemBuffers: Record<string, AudioBuffer>,
  splitResultStems: StemResult[],
  stemStates: Record<string, StemEditorState>,
  _uploadName: string
): Promise<Blob> {
  const stemsToMix = filterStemsForAudibleMix(splitResultStems, stemStates);

  let maxDuration = 0;
  const stemData: { buffer: AudioBuffer; st: StemEditorState; rate: number; trimStart: number; trimEnd: number }[] = [];

  for (const stem of stemsToMix) {
    const buffer = stemBuffers[stem.id];
    if (!buffer) continue;
    const st = stemStates[stem.id] ?? defaultStemState();
    const { trimStart, trimEnd } = trimToSeconds(buffer, st.trim);
    const rate = getStemEffectiveRate(st);
    const wallDuration = (trimEnd - trimStart) / rate;
    maxDuration = Math.max(maxDuration, wallDuration);
    stemData.push({ buffer, st, rate, trimStart, trimEnd });
  }

  if (maxDuration === 0) throw new Error("No valid stems to export (missing buffers?).");

  // Determine if any stem uses reverb or delay — if so, extend render for tails
  const hasEffectTails = stemData.some(
    ({ st }) => st.mixer.reverbWet > 0 || st.mixer.delayWet > 0,
  );
  const renderDuration = hasEffectTails
    ? maxDuration + EFFECT_TAIL_SECONDS
    : maxDuration;

  // Use the native sample rate from the source buffers to avoid unnecessary
  // resampling. All stems from the same split share a sample rate, so we take
  // the first buffer's rate. This matches the live AudioContext behavior and
  // prevents subtle quality differences between playback and export.
  const sampleRate = stemData[0]?.buffer.sampleRate ?? 44100;
  const context = new OfflineAudioContext(2, Math.ceil(renderDuration * sampleRate), sampleRate);

  for (const { buffer, st, rate, trimStart, trimEnd } of stemData) {
    const gainLinear = Math.pow(10, st.mixer.gain / 20);
    const dsp = createStemDspChain(context, st.mixer, gainLinear, { metering: false });

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;

    // Apply fade envelope if configured
    const hasFade = (st.fadeIn ?? 0) > 0 || (st.fadeOut ?? 0) > 0;
    const wallDuration = (trimEnd - trimStart) / rate;
    if (hasFade && wallDuration > 0) {
      const fadeNode = createFadeEnvelopeNode(
        context,
        st.fadeIn ?? 0,
        st.fadeOut ?? 0,
        wallDuration,
        0, // startTime = 0 for offline context
        0, // elapsedWall = 0 (rendering from start)
      );
      source.connect(fadeNode);
      fadeNode.connect(dsp.input);
    } else {
      source.connect(dsp.input);
    }

    dsp.output.connect(context.destination);
    source.start(0, trimStart, trimEnd - trimStart);
  }

  let rendered = await context.startRendering();

  // If we added tail time, trim silence from the end to keep file size reasonable
  if (hasEffectTails) {
    rendered = trimTrailingSilence(rendered, maxDuration, sampleRate);
  }

  if (options.normalize) rendered = normalizeAudioBuffer(rendered);
  return audioBufferToWav(rendered);
}

/**
 * Trim trailing silence beyond the expected content duration.
 * Keeps at least `minDuration` seconds, then scans backward to find
 * where signal drops below a noise floor threshold.
 */
function trimTrailingSilence(
  buffer: AudioBuffer,
  minDuration: number,
  sampleRate: number,
): AudioBuffer {
  const minSamples = Math.ceil(minDuration * sampleRate);
  const { numberOfChannels, length } = buffer;
  const threshold = 1e-5; // ~ -100 dBFS

  let lastNonSilent = minSamples;
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = length - 1; i >= minSamples; i--) {
      if (Math.abs(data[i]) > threshold) {
        lastNonSilent = Math.max(lastNonSilent, i + 1);
        break;
      }
    }
  }

  // Add a tiny fade-out (10ms) to avoid clicks
  const fadeOutSamples = Math.min(Math.floor(sampleRate * 0.01), lastNonSilent);
  const trimLength = Math.min(length, lastNonSilent + fadeOutSamples);

  if (trimLength >= length) return buffer;

  const trimmed = new AudioBuffer({
    numberOfChannels,
    length: trimLength,
    sampleRate,
  });
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = trimmed.getChannelData(ch);
    dst.set(src.subarray(0, trimLength));
    // Apply fade-out on the tail
    for (let i = 0; i < fadeOutSamples; i++) {
      const idx = trimLength - fadeOutSamples + i;
      dst[idx] *= 1 - i / fadeOutSamples;
    }
  }
  return trimmed;
}
