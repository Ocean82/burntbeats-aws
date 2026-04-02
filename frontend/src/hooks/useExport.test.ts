import { describe, expect, it } from "vitest";
import { buildMasterExportFilename, stripFileExtension } from "./useExport";

describe("stripFileExtension", () => {
  it("removes only the last extension segment", () => {
    expect(stripFileExtension("track.wav")).toBe("track");
    expect(stripFileExtension("my.song.demo.mp3")).toBe("my.song.demo");
  });

  it("keeps names without extension unchanged", () => {
    expect(stripFileExtension("untitled")).toBe("untitled");
  });
});

describe("buildMasterExportFilename", () => {
  it("builds wav and mp3 master file names consistently", () => {
    expect(buildMasterExportFilename("song.wav", "wav")).toBe("song_master.wav");
    expect(buildMasterExportFilename("song.wav", "mp3")).toBe("song_master.mp3");
  });

  it("handles filenames with multiple dots", () => {
    expect(buildMasterExportFilename("mix.v1.final.flac", "wav")).toBe("mix.v1.final_master.wav");
  });
});
