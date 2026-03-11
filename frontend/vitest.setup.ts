import "@testing-library/jest-dom";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

// Minimal mocks for Web Audio / browser APIs used by App
if (typeof window !== "undefined") {
  const noop = () => {};
  const mockContext = {
    createBuffer: () => ({}),
    createBufferSource: () => ({
      connect: noop,
      start: noop,
      stop: noop,
      buffer: null,
    }),
    createGain: () => ({ gain: { value: 1 }, connect: noop }),
    createStereoPanner: () => ({ pan: { value: 0 }, connect: noop }),
    destination: {},
    sampleRate: 44100,
    decodeAudioData: () => Promise.resolve(null),
    close: () => Promise.resolve(),
    state: "closed",
  };
  window.AudioContext = (window as unknown as { AudioContext: typeof AudioContext }).AudioContext ?? (() => mockContext);
  (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext = window.AudioContext;
  window.OfflineAudioContext = window.OfflineAudioContext ?? (() => mockContext);
  if (typeof HTMLMediaElement !== "undefined") {
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    HTMLMediaElement.prototype.pause = noop;
  }
}
