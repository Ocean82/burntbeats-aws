import type { TrimState } from "../types";
import type { StemId } from "../types";
import { defaultStemState, getStemEffectiveRate, type StemEditorState } from "../stem-editor-state";

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, bufferLength - 8, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  const offset = 44;
  const channels: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let pos = offset;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(pos, int16, true);
      pos += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

export const NORMALIZE_PEAK_DB = -1;
export const NORMALIZE_PEAK_LINEAR = Math.pow(10, NORMALIZE_PEAK_DB / 20);

export function normalizeAudioBuffer(buffer: AudioBuffer): AudioBuffer {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;
  let peak = 0;
  for (let ch = 0; ch < numChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }
  if (peak <= 0) return buffer;
  const scale = NORMALIZE_PEAK_LINEAR / peak;
  const out = new AudioBuffer({ numberOfChannels: numChannels, length, sampleRate: buffer.sampleRate });
  for (let ch = 0; ch < numChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < length; i++) dst[i] = src[i] * scale;
  }
  return out;
}

export function trimToSeconds(
  buffer: AudioBuffer,
  trim: TrimState
): { trimStart: number; trimEnd: number } {
  const length = buffer.length;
  const sr = buffer.sampleRate;
  const startSample = Math.floor((trim.start / 100) * length);
  const endSample = Math.min(Math.ceil((trim.end / 100) * length), length);
  const trimStart = Math.max(0, startSample / sr);
  const trimEnd = Math.min(buffer.duration, endSample / sr);
  return {
    trimStart,
    trimEnd: trimEnd > trimStart ? trimEnd : trimStart,
  };
}

/**
 * Convert StemEditorState.timeStretch to plugin tempoRatio.
 *
 * timeStretch semantics: 1.0 = normal, 0.85 = 85% of original duration (faster), 1.15 = 115% (slower)
 * tempoRatio semantics: 1.0 = normal, 1.15 = 15% faster, 0.85 = 15% slower
 *
 * Mapping: tempoRatio = 1 / timeStretch
 * - timeStretch 0.85 → tempoRatio 1/0.85 ≈ 1.176 (faster playback)
 * - timeStretch 1.15 → tempoRatio 1/1.15 ≈ 0.870 (slower playback)
 *
 * The plugin clamps to [0.85, 1.15] internally.
 */
export function timeStretchToTempoRatio(timeStretch: number): number {
  if (timeStretch <= 0) return 1.0;
  return 1.0 / timeStretch;
}

/**
 * Wall-clock duration of the trimmed region.
 * When plugin is active: duration = trimmedLength * timeStretch
 *   (timeStretch > 1 means slower, so longer wall time)
 * When plugin is inactive (legacy): duration = trimmedLength / effectiveRate
 */
export function getStemTrimWallDurationSeconds(
  buffer: AudioBuffer,
  st: StemEditorState,
  usePlugin: boolean = false,
): number {
  const { trimStart, trimEnd } = trimToSeconds(buffer, st.trim);
  const len = trimEnd - trimStart;
  if (len <= 0) return 0;

  if (usePlugin) {
    // Plugin mode: source runs at 1.0, plugin handles tempo
    // Wall duration = buffer duration * timeStretch
    // (timeStretch=1.15 means 15% slower → 15% longer wall time)
    return len * (st.timeStretch ?? 1.0);
  }

  // Legacy mode: playbackRate = effectiveRate
  return len / getStemEffectiveRate(st);
}

/** Longest stem trim in wall-clock seconds — master timeline length for the mix playhead. */
export function maxTrimWallDurationSeconds(
  stems: readonly { id: string }[],
  stemBuffers: Record<string, AudioBuffer>,
  stemStates: Record<string, StemEditorState>,
  usePlugin: boolean = false,
): number {
  let max = 0;
  for (const s of stems) {
    const buf = stemBuffers[s.id];
    if (!buf) continue;
    const st = stemStates[s.id] ?? defaultStemState();
    max = Math.max(max, getStemTrimWallDurationSeconds(buf, st, usePlugin));
  }
  return max;
}

/**
 * Where to start playback in the source buffer after `elapsedWallSeconds` on the master timeline.
 * buffer time = wall time × effective rate (capped to the trim window).
 *
 * When plugin is active (usePlugin=true): source runs at playbackRate=1.0,
 * so buffer time = wall time / timeStretch.
 */
export function trimStartOffsetAtElapsedWall(
  buffer: AudioBuffer,
  st: StemEditorState,
  elapsedWallSeconds: number,
  usePlugin: boolean = false,
): { trimStart: number; trimEnd: number; startOffset: number } {
  const { trimStart, trimEnd } = trimToSeconds(buffer, st.trim);
  const trimLen = trimEnd - trimStart;
  if (trimLen <= 0) return { trimStart, trimEnd, startOffset: trimStart };

  if (usePlugin) {
    // Plugin mode: buffer advances at 1/timeStretch rate relative to wall clock
    // bufferElapsed = wallElapsed / timeStretch
    const stretch = st.timeStretch ?? 1.0;
    const delta = Math.min(trimLen, elapsedWallSeconds / stretch);
    return { trimStart, trimEnd, startOffset: trimStart + delta };
  }

  // Legacy mode
  const rate = getStemEffectiveRate(st);
  const delta = Math.min(trimLen, elapsedWallSeconds * rate);
  return { trimStart, trimEnd, startOffset: trimStart + delta };
}

export function computeWaveformFromBuffer(buffer: AudioBuffer, bins: number): number[] {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;
  if (length === 0) return Array(bins).fill(0.12);
  const binSize = length / bins;
  const values: number[] = [];
  let peak = 0;
  for (let i = 0; i < bins; i++) {
    const start = Math.floor(i * binSize);
    const end = Math.min(length, Math.floor((i + 1) * binSize));
    let max = 0;
    for (let j = start; j < end; j++) {
      for (let c = 0; c < numChannels; c++) {
        const v = Math.abs(buffer.getChannelData(c)[j] ?? 0);
        if (v > max) max = v;
      }
    }
    values.push(max);
    if (max > peak) peak = max;
  }
  const scale = peak > 0 ? 1 / peak : 1;
  const minBar = 0.12;
  return values.map((v) => Math.max(minBar, Math.min(1, v * scale * 0.95 + minBar * 0.2)));
}

export interface StereoWidthNode {
  input: AudioNode;
  output: AudioNode;
  setWidth: (width: number) => void;
  disconnect: () => void;
}

/**
 * Create a stereo width matrix using L/R gain nodes.
 * width=100: original stereo (no processing), width=0: mono, width=-100: inverted stereo.
 * Formula: L_out = L * (1+g)/2 + R * (1-g)/2, R_out = R * (1+g)/2 + L * (1-g)/2
 * where g = width / 100, clipped to [-1, 1].
 *
 * At g=1 (width=100): L_out = L, R_out = R (pass-through).
 * At g=0 (width=0):   L_out = R_out = (L+R)/2 (mono).
 * At g=-1 (width=-100): L_out = R, R_out = L (swapped).
 */
export function createStereoWidthNode(context: BaseAudioContext): StereoWidthNode {
  const splitter = context.createChannelSplitter(2);
  const merger = context.createChannelMerger(2);
  const gainLL = context.createGain();
  const gainLR = context.createGain();
  const gainRL = context.createGain();
  const gainRR = context.createGain();

  // Ensure stereo processing throughout the width matrix by setting explicit
  // channel configuration on each gain node. Without this, mono sources that
  // were only just upmixed by the panner could be silently downmixed back to
  // mono by the default "max" channelCountMode before the matrix processes them.
  for (const node of [gainLL, gainLR, gainRL, gainRR]) {
    node.channelCount = 1;
    node.channelCountMode = "explicit";
  }

  splitter.connect(gainLL, 0, 0);
  splitter.connect(gainLR, 0, 0);
  splitter.connect(gainRL, 1, 0);
  splitter.connect(gainRR, 1, 0);
  gainLL.connect(merger, 0, 0);
  gainLR.connect(merger, 0, 1);
  gainRL.connect(merger, 0, 0);
  gainRR.connect(merger, 0, 1);

  const setWidth = (width: number) => {
    const g = Math.max(-1, Math.min(1, width / 100));
    gainLL.gain.value = (1 + g) / 2;
    gainLR.gain.value = (1 - g) / 2;
    gainRL.gain.value = (1 - g) / 2;
    gainRR.gain.value = (1 + g) / 2;
  };
  // Initialize to full stereo pass-through (width=100) so the node is never
  // in an incorrect state. The caller (createStemDspChain) immediately applies
  // the actual mixer.width value, but this avoids any transient mono collapse
  // if audio flows through before the caller's setWidth() executes.
  setWidth(100);

  return {
    input: splitter,
    output: merger,
    setWidth,
    disconnect: () => {
      splitter.disconnect();
      gainLL.disconnect();
      gainLR.disconnect();
      gainRL.disconnect();
      gainRR.disconnect();
      merger.disconnect();
    },
  };
}

// Shared stem preview buffer generator (migrated from App.tsx)
export function createStemPreviewBuffer(context: AudioContext, stemId: StemId): AudioBuffer {
  const duration = 3.8;
  const frameCount = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(2, frameCount, context.sampleRate);

  const renderChannel = (channelData: Float32Array, stereoOffset: number) => {
    for (let sampleIndex = 0; sampleIndex < frameCount; sampleIndex += 1) {
      const time = sampleIndex / context.sampleRate;
      let value = 0;

      if (stemId === "vocals") {
        const progression = [220, 247, 262, 294];
        const note = progression[Math.floor(time / 0.95) % progression.length];
        const vibrato = 5 * Math.sin(2 * Math.PI * 5.4 * time);
        const airy = Math.sin(2 * Math.PI * (note + vibrato) * time);
        const overtone =
          0.38 * Math.sin(2 * Math.PI * (note * 2.02) * time + stereoOffset);
        const breath = 0.08 * Math.sin(2 * Math.PI * 28 * time);
        value = (airy + overtone + breath) * 0.22;
      }

      if (stemId === "drums") {
        const kickPhase = time % 0.6;
        const kick =
          Math.exp(-kickPhase * 14) *
          Math.sin(2 * Math.PI * (56 - kickPhase * 18) * time);
        const snareGate = Math.max(
          0,
          1 - Math.abs(((time + 0.3) % 0.6) - 0.3) * 18,
        );
        const snareNoise = (Math.random() * 2 - 1) * snareGate * 0.2;
        const hatGate =
          Math.max(0, 1 - ((time * 8.5 + stereoOffset) % 1)) * 0.05;
        const hat = Math.sin(2 * Math.PI * 4000 * time) * hatGate;
        value = kick * 0.82 + snareNoise + hat;
      }

      if (stemId === "bass") {
        const progression = [55, 55, 65.4, 49];
        const note = progression[Math.floor(time / 0.95) % progression.length];
        const envelope = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.5 * time + 0.4);
        const sub = Math.sin(2 * Math.PI * note * time);
        const harmonic =
          0.24 * Math.sin(2 * Math.PI * note * 2 * time + 0.3 + stereoOffset);
        value = (sub + harmonic) * 0.28 * envelope;
      }

      if (stemId === "melody") {
        const progression = [440, 523.3, 659.2, 587.3, 784, 659.2, 523.3];
        const note = progression[Math.floor(time / 0.27) % progression.length];
        const triangle =
          (2 / Math.PI) *
          Math.asin(Math.sin(2 * Math.PI * note * time + stereoOffset));
        const shimmer = 0.2 * Math.sin(2 * Math.PI * note * 1.5 * time);
        value = (triangle + shimmer) * 0.21;
      }

      const fadeIn = Math.min(1, time / 0.08);
      const fadeOut = Math.min(1, (duration - time) / 0.16);
      channelData[sampleIndex] = value * fadeIn * fadeOut;
    }
  };

  renderChannel(buffer.getChannelData(0), 0);
  renderChannel(buffer.getChannelData(1), 0.22);

  return buffer;
}

import type { MixerState } from "../types";

export interface CreateStemDspChainOptions {
  /** When false, skips AnalyserNode (e.g. offline export). Default true. */
  metering?: boolean;
}

export interface StemDspChain {
  /** Connect a source node here. */
  input: AudioNode;
  /** Connect this to the master bus (analyser when metering is enabled). */
  output: AudioNode;
  analyser?: AnalyserNode;
  /** Time-domain bytes for per-stem VU metering; null when metering is disabled. */
  getTimeDomainData: () => Uint8Array | null;
  /** Update all node params from a MixerState without rebuilding the graph. */
  update: (mixer: MixerState, gain: number) => void;
  disconnect: () => void;
}

/**
 * Build a per-stem DSP chain:
 *   gainNode → lowEQ → midEQ → highEQ → [compressor] → panNode → widthNode → outputGain
 *                                                                              ↗ [reverb send] → outputGain
 *                                                                              ↗ [delay send]  → outputGain
 *
 * Reverb and delay sends are tapped post-pan/width so wet signals inherit the
 * stem's spatial position. This prevents the "floating center" artifact where
 * effects sound disconnected from a panned source.
 *
 * Compressor, reverb, and delay are only instantiated when their values are
 * non-default, avoiding unnecessary CPU usage for inactive effects.
 */
export function createStemDspChain(
  ctx: BaseAudioContext,
  mixer: MixerState,
  gainLinear: number,
  options: CreateStemDspChainOptions = {},
): StemDspChain {
  const metering = options.metering !== false;
  // --- Core nodes (always created) ---
  const gainNode = ctx.createGain();
  gainNode.gain.value = gainLinear;

  const lowEQ = ctx.createBiquadFilter();
  lowEQ.type = "lowshelf";
  lowEQ.frequency.value = 200;
  lowEQ.gain.value = mixer.eqLow;

  const midEQ = ctx.createBiquadFilter();
  midEQ.type = "peaking";
  midEQ.frequency.value = 1000;
  midEQ.Q.value = 1.0;
  midEQ.gain.value = mixer.eqMid;

  const highEQ = ctx.createBiquadFilter();
  highEQ.type = "highshelf";
  highEQ.frequency.value = 6000;
  highEQ.gain.value = mixer.eqHigh;

  // --- Warmth (harmonic saturation via waveshaper) ---
  const warmthActive = mixer.warmth > 0;
  let warmthShaper: WaveShaperNode | null = null;
  let warmthDryGain: GainNode | null = null;
  let warmthWetGain: GainNode | null = null;
  let warmthMerge: GainNode | null = null;
  if (warmthActive) {
    warmthShaper = ctx.createWaveShaper();
    warmthShaper.curve = _buildWarmthCurve(mixer.warmth / 100) as Float32Array<ArrayBuffer>;
    warmthShaper.oversample = "2x"; // reduce aliasing from nonlinear distortion
    // Parallel dry/wet blend so warmth=50 is 50% saturated + 50% clean
    warmthDryGain = ctx.createGain();
    warmthDryGain.gain.value = 1 - mixer.warmth / 100;
    warmthWetGain = ctx.createGain();
    warmthWetGain.gain.value = mixer.warmth / 100;
    warmthMerge = ctx.createGain();
    warmthMerge.gain.value = 1;
  }

  // --- Presence / Air (high-shelf at 10kHz) ---
  const presenceActive = Math.abs(mixer.presence) > 0.01;
  let presenceFilter: BiquadFilterNode | null = null;
  if (presenceActive) {
    presenceFilter = ctx.createBiquadFilter();
    presenceFilter.type = "highshelf";
    presenceFilter.frequency.value = 10000;
    presenceFilter.gain.value = mixer.presence;
  }

  const panNode = ctx.createStereoPanner();
  panNode.pan.value = mixer.pan / 100;

  const widthNode = createStereoWidthNode(ctx);
  widthNode.setWidth(mixer.width);

  // --- Output merger ---
  const outputGain = ctx.createGain();
  outputGain.gain.value = 1;

  // --- Conditionally create compressor ---
  const compActive = mixer.compThreshold < 0 || mixer.compRatio > 1;
  let compressor: DynamicsCompressorNode | null = null;
  if (compActive) {
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = mixer.compThreshold;
    compressor.ratio.value = Math.max(1, mixer.compRatio);
    compressor.knee.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
  }

  // --- Conditionally create reverb ---
  const reverbActive = mixer.reverbWet > 0;
  let reverbConvolver: ConvolverNode | null = null;
  let reverbWetGain: GainNode | null = null;
  if (reverbActive) {
    reverbConvolver = ctx.createConvolver();
    reverbConvolver.buffer = _buildReverbIR(ctx, 1.8);
    reverbWetGain = ctx.createGain();
    reverbWetGain.gain.value = mixer.reverbWet / 100;
  }

  // --- Conditionally create delay ---
  const delayActive = mixer.delayWet > 0;
  let delayNode: DelayNode | null = null;
  let delayFeedback: GainNode | null = null;
  let delayWetGain: GainNode | null = null;
  if (delayActive) {
    delayNode = ctx.createDelay(1.0);
    delayNode.delayTime.value = 0.375; // 8th note at ~80bpm
    delayFeedback = ctx.createGain();
    delayFeedback.gain.value = 0.35;
    delayWetGain = ctx.createGain();
    delayWetGain.gain.value = mixer.delayWet / 100;
  }

  // --- Wire dry path ---
  // gainNode → lowEQ → midEQ → highEQ → [warmth] → [presence] → [compressor] → panNode → widthNode → outputGain
  gainNode.connect(lowEQ);
  lowEQ.connect(midEQ);
  midEQ.connect(highEQ);

  // Post-EQ: warmth (parallel dry/wet saturation) → presence → compressor → pan
  let postEqOutput: AudioNode = highEQ;

  if (warmthActive && warmthShaper && warmthDryGain && warmthWetGain && warmthMerge) {
    // Parallel blend: highEQ → dry gain → merge, highEQ → shaper → wet gain → merge
    highEQ.connect(warmthDryGain);
    warmthDryGain.connect(warmthMerge);
    highEQ.connect(warmthShaper);
    warmthShaper.connect(warmthWetGain);
    warmthWetGain.connect(warmthMerge);
    postEqOutput = warmthMerge;
  }

  if (presenceActive && presenceFilter) {
    postEqOutput.connect(presenceFilter);
    postEqOutput = presenceFilter;
  }

  const postEqNode: AudioNode = compressor ?? panNode;
  postEqOutput.connect(postEqNode);
  if (compressor) {
    compressor.connect(panNode);
  }
  panNode.connect(widthNode.input);
  widthNode.output.connect(outputGain);

  // Send point for reverb/delay is post-pan/width so wet signals inherit the
  // stem's spatial position (pan + stereo width). This ensures effects don't
  // collapse to center when a stem is panned or width-adjusted.
  const sendNode: AudioNode = widthNode.output;

  // --- Wire reverb send ---
  if (reverbActive && reverbConvolver && reverbWetGain) {
    sendNode.connect(reverbConvolver);
    reverbConvolver.connect(reverbWetGain);
    reverbWetGain.connect(outputGain);
  }

  // --- Wire delay send ---
  if (delayActive && delayNode && delayFeedback && delayWetGain) {
    sendNode.connect(delayNode);
    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode); // feedback loop
    delayNode.connect(delayWetGain);
    delayWetGain.connect(outputGain);
  }

  const update = (m: MixerState, g: number) => {
    gainNode.gain.value = g;
    lowEQ.gain.value = m.eqLow;
    midEQ.gain.value = m.eqMid;
    highEQ.gain.value = m.eqHigh;
    if (warmthShaper && warmthDryGain && warmthWetGain) {
      const w = m.warmth / 100;
      warmthShaper.curve = _buildWarmthCurve(w) as Float32Array<ArrayBuffer>;
      warmthDryGain.gain.value = 1 - w;
      warmthWetGain.gain.value = w;
    }
    if (presenceFilter) {
      presenceFilter.gain.value = m.presence;
    }
    if (compressor) {
      compressor.threshold.value = m.compThreshold;
      compressor.ratio.value = Math.max(1, m.compRatio);
    }
    panNode.pan.value = m.pan / 100;
    widthNode.setWidth(m.width);
    if (reverbWetGain) {
      reverbWetGain.gain.value = m.reverbWet / 100;
    }
    if (delayWetGain) {
      delayWetGain.gain.value = m.delayWet / 100;
    }
  };

  let analyser: AnalyserNode | undefined;
  let chainOutput: AudioNode = outputGain;

  if (metering) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.85;
    outputGain.connect(analyser);
    chainOutput = analyser;
  }

  const getTimeDomainData = (): Uint8Array | null => {
    if (!analyser) return null;
    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);
    return buf;
  };

  const disconnect = () => {
    gainNode.disconnect();
    lowEQ.disconnect();
    midEQ.disconnect();
    highEQ.disconnect();
    warmthShaper?.disconnect();
    warmthDryGain?.disconnect();
    warmthWetGain?.disconnect();
    warmthMerge?.disconnect();
    presenceFilter?.disconnect();
    compressor?.disconnect();
    panNode.disconnect();
    widthNode.disconnect();
    reverbConvolver?.disconnect();
    reverbWetGain?.disconnect();
    delayNode?.disconnect();
    delayFeedback?.disconnect();
    delayWetGain?.disconnect();
    outputGain.disconnect();
    analyser?.disconnect();
  };

  return {
    input: gainNode,
    output: chainOutput,
    analyser,
    getTimeDomainData,
    update,
    disconnect,
  };
}

/** Synthetic exponential-decay reverb impulse response. */
function _buildReverbIR(ctx: BaseAudioContext, durationSec: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * durationSec);
  const ir = ctx.createBuffer(2, length, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
    }
  }
  return ir;
}

/**
 * Build a soft-clip waveshaper curve for harmonic warmth/saturation.
 *
 * Uses tanh-based soft clipping which produces predominantly even-order harmonics
 * (2nd, 4th) — the same harmonic profile as analog tube amplifiers. The result
 * is a "warm" or "analog" character without harsh odd-order distortion.
 *
 * @param amount - Saturation intensity 0–1 (0 = linear/bypass, 1 = heavy saturation)
 * @returns Float32Array transfer curve for WaveShaperNode
 */
function _buildWarmthCurve(amount: number): Float32Array {
  const samples = 8192;
  const curve = new Float32Array(samples);
  // Drive ranges from 1 (clean) to 5 (heavy saturation)
  const drive = 1 + Math.max(0, Math.min(1, amount)) * 4;
  const normFactor = Math.tanh(drive);

  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1; // Map index to -1..+1
    // tanh soft-clip: smooth saturation with even-harmonic emphasis
    curve[i] = Math.tanh(x * drive) / normFactor;
  }
  return curve;
}

/**
 * Create a GainNode with fade-in/fade-out automation scheduled on the AudioParam timeline.
 *
 * The node starts at gain=0, ramps to 1 over `fadeInSec`, holds at 1, then ramps
 * to 0 over `fadeOutSec` ending exactly at `wallDuration`. Uses exponential ramps
 * for a natural-sounding fade curve.
 *
 * @param ctx - AudioContext (or OfflineAudioContext) to create the node on
 * @param fadeInSec - Fade-in duration in seconds (0 = no fade-in)
 * @param fadeOutSec - Fade-out duration in seconds (0 = no fade-out)
 * @param wallDuration - Total wall-clock duration of the stem's playback (from trim start to trim end)
 * @param startTime - The `ctx.currentTime` at which playback begins (for scheduling)
 * @param elapsedWall - How far into the stem we've already seeked (0 for fresh start)
 * @returns A GainNode with scheduled automation. Wire: source → fadeNode → dspChain.input
 */
export function createFadeEnvelopeNode(
  ctx: BaseAudioContext,
  fadeInSec: number,
  fadeOutSec: number,
  wallDuration: number,
  startTime: number,
  elapsedWall: number = 0,
): GainNode {
  const fadeNode = ctx.createGain();

  // Use a very small value instead of 0 for exponentialRamp (can't ramp to/from 0)
  const NEAR_ZERO = 1e-4;

  const hasFadeIn = fadeInSec > 0.001;
  const hasFadeOut = fadeOutSec > 0.001;

  if (!hasFadeIn && !hasFadeOut) {
    fadeNode.gain.value = 1;
    return fadeNode;
  }

  // Clamp fades so they don't overlap (each gets at most half the duration)
  const maxFadeIn = Math.min(fadeInSec, wallDuration * 0.5);
  const maxFadeOut = Math.min(fadeOutSec, wallDuration - maxFadeIn);

  // Remaining wall time from current position
  const remainingWall = wallDuration - elapsedWall;

  if (hasFadeIn && elapsedWall < maxFadeIn) {
    // We're still within the fade-in region — compute current gain and ramp from there
    const fadeProgress = elapsedWall / maxFadeIn; // 0–1
    const currentGain = Math.max(NEAR_ZERO, fadeProgress);
    const remainingFadeIn = maxFadeIn - elapsedWall;
    fadeNode.gain.setValueAtTime(currentGain, startTime);
    fadeNode.gain.exponentialRampToValueAtTime(1, startTime + remainingFadeIn);
  } else {
    // Past the fade-in region — start at full gain
    fadeNode.gain.setValueAtTime(1, startTime);
  }

  if (hasFadeOut) {
    const fadeOutStartWall = wallDuration - maxFadeOut; // when fade-out begins in wall time
    const fadeOutStartFromNow = fadeOutStartWall - elapsedWall; // relative to current playback position

    if (fadeOutStartFromNow > 0) {
      // Fade-out hasn't started yet — schedule it
      fadeNode.gain.setValueAtTime(1, startTime + fadeOutStartFromNow);
      fadeNode.gain.exponentialRampToValueAtTime(NEAR_ZERO, startTime + remainingWall);
    } else {
      // We've seeked into the fade-out region — compute current gain and ramp from there
      const fadeOutElapsed = elapsedWall - fadeOutStartWall;
      const fadeOutProgress = fadeOutElapsed / maxFadeOut; // 0–1
      const currentGain = Math.max(NEAR_ZERO, 1 - fadeOutProgress);
      fadeNode.gain.setValueAtTime(currentGain, startTime);
      fadeNode.gain.exponentialRampToValueAtTime(NEAR_ZERO, startTime + remainingWall);
    }
  }

  return fadeNode;
}
