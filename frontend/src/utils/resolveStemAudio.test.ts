import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  stemEntryToAudioSource,
  resolveStemAudioArrayBuffer,
} from "./resolveStemAudio";

vi.mock("../api/stems", () => ({
  parseJobIdFromStemFileUrl: (url: string) => {
    const m = url.match(
      /\/api\/stems\/file\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i,
    );
    return m ? m[1] : null;
  },
  fetchStemWavAsArrayBuffer: vi.fn(async () => new ArrayBuffer(8)),
}));

import { fetchStemWavAsArrayBuffer } from "../api/stems";

describe("stemEntryToAudioSource", () => {
  it("classifies API stem URLs", () => {
    const url =
      "https://app.example/api/stems/file/00000000-0000-0000-0000-000000000001/vocals.wav";
    expect(stemEntryToAudioSource({ id: "vocals", url }).kind).toBe("api");
  });

  it("classifies loaded stems with file", () => {
    const file = new File([new Uint8Array([1, 2])], "a.wav", {
      type: "audio/wav",
    });
    expect(
      stemEntryToAudioSource({ id: "loaded_1_0", url: "blob:x", file }).kind,
    ).toBe("blob");
  });

  it("classifies blob URLs without file", () => {
    expect(
      stemEntryToAudioSource({ id: "loaded_2_0", url: "blob:abc" }).kind,
    ).toBe("blob");
  });
});

describe("resolveStemAudioArrayBuffer", () => {
  beforeEach(() => {
    vi.mocked(fetchStemWavAsArrayBuffer).mockClear();
  });

  it("uses API fetch for api sources", async () => {
    const url =
      "/api/stems/file/00000000-0000-0000-0000-000000000001/vocals.wav";
    const buf = await resolveStemAudioArrayBuffer({ kind: "api", url });
    expect(fetchStemWavAsArrayBuffer).toHaveBeenCalledWith(url);
    expect(buf.byteLength).toBe(8);
  });

  it("reads from File for blob sources with file", async () => {
    const file = {
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as unknown as File;
    const buf = await resolveStemAudioArrayBuffer({
      kind: "blob",
      url: "blob:x",
      file,
    });
    expect(fetchStemWavAsArrayBuffer).not.toHaveBeenCalled();
    expect(buf.byteLength).toBe(3);
  });
});
