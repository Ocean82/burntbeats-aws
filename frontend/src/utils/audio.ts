import type { TrimState } from "../types";
import type { StemId } from "../types";

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
  const out = new OfflineAudioContext(
    numChannels,
    length,
    buffer.sampleRate
  ).createBuffer(numChannels, length, buffer.sampleRate);
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
