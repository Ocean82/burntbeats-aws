import { Buffer } from "node:buffer";

/**
 * Tiny valid WAV (PCM mono, 8kHz, 16-bit) — enough for File + duration hooks.
 * Avoids bundling binary fixtures.
 */
export function minimalWavBuffer(): Buffer {
  const sampleRate = 8000;
  const bitsPerSample = 16;
  const numChannels = 1;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const numSamples = 16;
  const dataSize = numSamples * blockAlign;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

/** Suppress onboarding tour so it doesn't interfere with tests. */
export function skipOnboarding(page: import("@playwright/test").Page) {
  return page.addInitScript(() => {
    localStorage.setItem("burnt-beats-onboarding-complete", "true");
  });
}
