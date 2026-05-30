/**
 * Client-side master WAV rendering via OfflineAudioContext.
 * Mixes audible stems with the full DSP chain (gain, EQ, compressor,
 * reverb, delay, pan, width, trim) and PitchTempoPlugin when pitch/tempo
 * are adjusted — matching real-time playback.
 */
import type { StemResult } from "../../types";
import {
  audioBufferToWav,
  normalizeAudioBuffer,
  trimToSeconds,
  createStemDspChain,
  maxTrimWallDurationSeconds,
  getStemTrimWallDurationSeconds,
} from "../../utils/audio";
import { defaultStemState, type StemEditorState } from "../../stem-editor-state";
import { filterStemsForAudibleMix } from "../../utils/stemAudibility";
import {
  createStemPluginPool,
  destroyStemPluginPool,
  stemNeedsPlugin,
} from "../../utils/stemPlaybackUtils";
import { buildStemSource } from "../../utils/stemSourceGraph";

/** Extra seconds appended to offline render to capture reverb/delay tails. */
const EFFECT_TAIL_SECONDS = 2.0;

interface StemRenderData {
  stemId: string;
  buffer: AudioBuffer;
  st: StemEditorState;
  trimStart: number;
  trimEnd: number;
}

export async function renderClientMasterWavBlob(
  options: { normalize?: boolean },
  stemBuffers: Record<string, AudioBuffer>,
  splitResultStems: StemResult[],
  stemStates: Record<string, StemEditorState>,
  _uploadName: string,
): Promise<Blob> {
  const stemsToMix = filterStemsForAudibleMix(splitResultStems, stemStates);

  const stemData: StemRenderData[] = [];
  for (const stem of stemsToMix) {
    const buffer = stemBuffers[stem.id];
    if (!buffer) continue;
    const st = stemStates[stem.id] ?? defaultStemState();
    const { trimStart, trimEnd } = trimToSeconds(buffer, st.trim);
    if (trimEnd - trimStart <= 0) continue;
    stemData.push({ stemId: stem.id, buffer, st, trimStart, trimEnd });
  }

  if (stemData.length === 0) {
    throw new Error("No valid stems to export (missing buffers?).");
  }

  const sampleRate = stemData[0]?.buffer.sampleRate ?? 44100;
  const anyNeedsPlugin = stemData.some(({ st }) => stemNeedsPlugin(st));

  const legacyMaxDuration = maxTrimWallDurationSeconds(
    stemsToMix,
    stemBuffers,
    stemStates,
    false,
  );
  const pluginMaxDuration = anyNeedsPlugin
    ? maxTrimWallDurationSeconds(stemsToMix, stemBuffers, stemStates, true)
    : legacyMaxDuration;
  const maxDuration = Math.max(legacyMaxDuration, pluginMaxDuration);

  if (maxDuration <= 0) {
    throw new Error("No valid stems to export (empty trim regions?).");
  }

  const hasEffectTails = stemData.some(
    ({ st }) => st.mixer.reverbWet > 0 || st.mixer.delayWet > 0,
  );
  const renderDuration = hasEffectTails
    ? maxDuration + EFFECT_TAIL_SECONDS
    : maxDuration;

  const context = new OfflineAudioContext(
    2,
    Math.ceil(renderDuration * sampleRate),
    sampleRate,
  );

  const { plugins, available: pluginAvailable } = await createStemPluginPool(
    context,
    stemData.map(({ stemId, st }) => ({ id: stemId, st })),
  );

  try {
    for (const { stemId, buffer, st, trimStart, trimEnd } of stemData) {
      const gainLinear = Math.pow(10, st.mixer.gain / 20);
      const dsp = createStemDspChain(context, st.mixer, gainLinear, {
        metering: false,
      });

      const usePlugin = pluginAvailable && stemNeedsPlugin(st);
      const plugin = usePlugin ? plugins.get(stemId) ?? null : null;
      const wallDuration = getStemTrimWallDurationSeconds(buffer, st, usePlugin);

      buildStemSource(
        context,
        buffer,
        st,
        trimStart,
        trimEnd,
        dsp.input,
        plugin,
        wallDuration,
        0,
      );

      dsp.output.connect(context.destination);
    }

    let rendered = await context.startRendering();

    if (hasEffectTails) {
      rendered = trimTrailingSilence(rendered, maxDuration, sampleRate);
    }

    if (options.normalize) rendered = normalizeAudioBuffer(rendered);
    return audioBufferToWav(rendered);
  } finally {
    destroyStemPluginPool(plugins);
  }
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
  const threshold = 1e-5;

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
    for (let i = 0; i < fadeOutSamples; i++) {
      const idx = trimLength - fadeOutSamples + i;
      dst[idx] *= 1 - i / fadeOutSamples;
    }
  }
  return trimmed;
}
