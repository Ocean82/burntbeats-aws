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
  it("mounts ClerkProvider in local-dev full-app mode when a valid fallback key is set", () => {
    expect(
      shouldMountClerkProvider({
        clerkPubKey: "pk_test_Y2xlcmsuYnVybnRiZWF0cy50ZXN0JA",
        isLocalDevFullApp: true,
      }),
    ).toBe(true);
  });

  it("mounts ClerkProvider when auth is enabled and a key is present", () => {
    expect(
      shouldMountClerkProvider({
        clerkPubKey: "pk_test_realistic",
        isLocalDevFullApp: false,
      }),
    ).toBe(true);
  });

  it("skips ClerkProvider when no key is present", () => {
    expect(
      shouldMountClerkProvider({
        clerkPubKey: undefined,
        isLocalDevFullApp: true,
      }),
    ).toBe(false);
  });
});
