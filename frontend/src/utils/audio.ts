import type { TrimState } from "../types";

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
