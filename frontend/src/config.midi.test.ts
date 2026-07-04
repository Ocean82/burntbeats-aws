import { describe, expect, it } from "vitest";
import {
  isAllowedMidiAudioFile,
  MIDI_ALLOWED_AUDIO_EXTENSIONS,
  shouldMountClerkProvider,
} from "./config";

describe("MIDI audio format config", () => {
  it("allows formats supported by midi_service", () => {
    expect(isAllowedMidiAudioFile("track.wav")).toBe(true);
    expect(isAllowedMidiAudioFile("track.mp3")).toBe(true);
    expect(isAllowedMidiAudioFile("track.flac")).toBe(true);
    expect(isAllowedMidiAudioFile("track.ogg")).toBe(true);
    expect(isAllowedMidiAudioFile("track.m4a")).toBe(true);
    expect(isAllowedMidiAudioFile("track.webm")).toBe(true);
  });

  it("rejects AAC (not supported by midi_service)", () => {
    expect(isAllowedMidiAudioFile("voice.aac")).toBe(false);
    expect(MIDI_ALLOWED_AUDIO_EXTENSIONS.has(".aac")).toBe(false);
  });

  it("rejects unknown extensions", () => {
    expect(isAllowedMidiAudioFile("readme.txt")).toBe(false);
  });
});

describe("Clerk provider config", () => {
  it("skips ClerkProvider in local-dev full-app mode even when a placeholder key is set", () => {
    expect(
      shouldMountClerkProvider({
        clerkPubKey: "pk_test_0000000000000000000000000000000000000000000000000000000000000000",
        isLocalDevFullApp: true,
      }),
    ).toBe(false);
  });

  it("mounts ClerkProvider when auth is enabled and a key is present", () => {
    expect(
      shouldMountClerkProvider({
        clerkPubKey: "pk_test_realistic",
        isLocalDevFullApp: false,
      }),
    ).toBe(true);
  });
});
