import { describe, expect, it, vi } from "vitest";
import { defaultStemState } from "../../stem-editor-state";
import type { StemResult } from "../../types";
import { renderClientMasterWavBlob } from "./renderClientMaster";

vi.mock("../../utils/stemPlaybackUtils", async (importOriginal: any) => {
  const actual =
    await importOriginal();
  return {
    ...actual,
    createStemPluginPool: async () => ({
      plugins: new Map(),
      available: false,
    }),
    destroyStemPluginPool: () => {},
  };
});

function fakeAudioBuffer(sampleRate = 44100, durationSec = 0.25): AudioBuffer {
  const length = Math.ceil(durationSec * sampleRate);
  const channel = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    channel[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.1;
  }
  return {
    length,
    duration: durationSec,
    numberOfChannels: 2,
    sampleRate,
    getChannelData: (ch: number) => (ch === 0 ? channel : channel),
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as AudioBuffer;
}

describe("renderClientMasterWavBlob context compatibility", () => {
  it("renders a master WAV from stem buffers (offline graph uses separate OfflineAudioContext)", async () => {
    const buffer = fakeAudioBuffer();
    const stems: StemResult[] = [
      { id: "vocals", url: "/api/stems/file/x/vocals.wav" },
    ];
    const stemStates = { vocals: defaultStemState() };

    const blob = await renderClientMasterWavBlob(
      { normalize: false },
      { vocals: buffer },
      stems,
      stemStates,
      "test-track",
    );

    expect(blob.size).toBeGreaterThan(44);
  });
});
