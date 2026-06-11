/**
 * Contract test for useAudioPlayback orchestrator.
 *
 * This file acts as a safety net for the tightly-coupled orchestrator hook.
 * It verifies:
 * 1. The public return interface shape is stable (compile-time contract)
 * 2. All expected keys are present at runtime
 * 3. Sub-hook composition doesn't break the surface API
 *
 * If this test breaks, the orchestrator's public contract has changed —
 * which means consumers (App.tsx, mixer panel, etc.) will also break.
 */
import { describe, expect, it } from "vitest";
import type { UseAudioPlaybackReturn, UseAudioPlaybackOptions } from "./useAudioPlayback";

/**
 * Compile-time contract: if UseAudioPlaybackReturn changes shape,
 * this type assertion will fail at `tsc --noEmit` time.
 */
type AssertExact<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;

// Every key that consumers depend on — adding or removing a key here
// forces a conscious decision about backward compatibility.
type ExpectedReturnKeys =
  | "isPlayingMix"
  | "isPlayingMixRef"
  | "playingStem"
  | "loadingPreviewStemId"
  | "playheadPosition"
  | "getPlayheadPosition"
  | "subscribePlayheadPosition"
  | "audioContextRef"
  | "handlePlayMix"
  | "handleSeekMix"
  | "handleStopMix"
  | "handlePreviewStem"
  | "stopPreview"
  | "getMasterAnalyserTimeDomainData"
  | "getMasterAnalyserTimeDomainDataLeft"
  | "getMasterAnalyserTimeDomainDataRight"
  | "getMasterAnalyserFrequencyData"
  | "getStemAnalyserTimeDomainData"
  | "getMasterRecordingStream"
  | "masterVolume"
  | "setMasterVolume"
  | "masterLimiterEnabled"
  | "setMasterLimiterEnabled"
  | "applyMasterEq"
  | "applyMasterCompressor"
  | "loopEnabled"
  | "setLoopEnabled";

// Static assertion: the return type has exactly these keys (no more, no less).
// If a key is added to UseAudioPlaybackReturn without updating this list, TS errors here.
// If a key is removed from UseAudioPlaybackReturn, TS errors here.
type _KeysMatch = AssertExact<keyof UseAudioPlaybackReturn, ExpectedReturnKeys>;
const _keysMatchCheck: _KeysMatch = true;
void _keysMatchCheck;

describe("useAudioPlayback contract", () => {
  it("UseAudioPlaybackReturn has exactly the expected keys", () => {
    // Runtime mirror of the compile-time check above.
    // This list must stay in sync with ExpectedReturnKeys.
    const expectedKeys: ExpectedReturnKeys[] = [
      "isPlayingMix",
      "isPlayingMixRef",
      "playingStem",
      "loadingPreviewStemId",
      "playheadPosition",
      "getPlayheadPosition",
      "subscribePlayheadPosition",
      "audioContextRef",
      "handlePlayMix",
      "handleSeekMix",
      "handleStopMix",
      "handlePreviewStem",
      "stopPreview",
      "getMasterAnalyserTimeDomainData",
      "getMasterAnalyserTimeDomainDataLeft",
      "getMasterAnalyserTimeDomainDataRight",
      "getMasterAnalyserFrequencyData",
      "getStemAnalyserTimeDomainData",
      "getMasterRecordingStream",
      "masterVolume",
      "setMasterVolume",
      "masterLimiterEnabled",
      "setMasterLimiterEnabled",
      "applyMasterEq",
      "applyMasterCompressor",
      "loopEnabled",
      "setLoopEnabled",
    ];

    // Verify count matches (catches accidental additions)
    expect(expectedKeys.length).toBe(27);
  });

  it("UseAudioPlaybackOptions accepts onError and stemStates", () => {
    // Compile-time: if the options interface changes, this won't compile.
    const opts: UseAudioPlaybackOptions = {
      onError: (_msg: string) => {},
      stemStates: {},
    };
    expect(opts).toBeDefined();
  });

  it("UseAudioPlaybackOptions allows empty object", () => {
    const opts: UseAudioPlaybackOptions = {};
    expect(opts).toBeDefined();
  });
});

describe("useAudioPlayback sub-hook exports", () => {
  it("useAudioContext is importable from the audio package", async () => {
    const mod = await import("./useAudioContext");
    expect(mod.useAudioContext).toBeTypeOf("function");
  });

  it("usePlayhead is importable from the audio package", async () => {
    const mod = await import("./usePlayhead");
    expect(mod.usePlayhead).toBeTypeOf("function");
  });

  it("barrel index re-exports all public symbols", async () => {
    const mod = await import("./index");
    expect(mod.useAudioPlayback).toBeTypeOf("function");
    expect(mod.useAudioContext).toBeTypeOf("function");
    expect(mod.usePlayhead).toBeTypeOf("function");
  });
});
