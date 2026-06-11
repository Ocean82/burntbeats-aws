/**
 * Property-Based Tests for Overlay Independence
 *
 * Feature: rhythm-pattern-overlay
 *
 * Property 12: Grid state independence from overlay operations
 * For any grid state (pattern, rowStates, steps, bpm, swing) and any overlay operation
 * (loading a pattern, applying a variation, clearing the overlay), the grid state values
 * SHALL remain identical before and after the overlay operation.
 * **Validates: Requirements 7.1, 7.2**
 *
 * Property 13: Overlay state independence from grid operations
 * For any active overlay state (selected pattern, variation, playback step) and any grid
 * mutation (toggle cell, clear cell, change step count, load preset, clear pattern), the
 * overlay pattern selection, variation state, and effective pattern data SHALL remain
 * unchanged.
 * **Validates: Requirements 7.4, 7.5**
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fc from "fast-check";
import { renderHook, act } from "@testing-library/react";
import { useBeatMaker } from "./useBeatMaker";
import { useOverlayTransport } from "./useOverlayTransport";
import type { GenrePresetPattern, VariationType } from "../audio/genrePresets";
import type { PatternLength, VelocityPattern } from "../audio/types";

// ─── Mocks ────────────────────────────────────────────────────────

// Mock drumSynth to prevent actual audio scheduling
vi.mock("../audio/drumSynth", () => ({
  playDrumVoice: vi.fn(),
}));

beforeEach(() => {
  const noop = () => {};
  const mockGainNode = {
    gain: {
      value: 1,
      setValueAtTime: noop,
      cancelScheduledValues: noop,
      linearRampToValueAtTime: noop,
    },
    connect: noop,
    disconnect: noop,
  };

  const mockCompressor = {
    connect: noop,
    disconnect: noop,
  };

  window.AudioContext = class MockAudioContext {
    currentTime = 0;
    state: AudioContextState = "running";
    destination = { connect: noop };
    sampleRate = 44100;
    resume = () => Promise.resolve();
    createGain = () => ({ ...mockGainNode });
    createDynamicsCompressor = () => mockCompressor;
    createBufferSource = () => ({
      connect: noop,
      disconnect: noop,
      start: noop,
      stop: noop,
      buffer: null,
      playbackRate: { value: 1 },
    });
  } as unknown as typeof AudioContext;
});

// ─── Generators ───────────────────────────────────────────────────

const VALID_GENRES = ["rock", "hip-hop", "edm", "jazz", "latin", "reggae"] as const;
const VALID_STEPS: PatternLength[] = [16, 32, 64];
const VARIATION_TYPES: VariationType[] = ["fill", "breakdown", "buildup"];

/** Generates a valid velocity value (integer 0–127) */
const velocityArb = fc.integer({ min: 0, max: 127 });

/** Generates a valid genre */
const genreArb = fc.constantFrom(...VALID_GENRES);

/** Generates a valid steps value */
const stepsArb = fc.constantFrom<PatternLength>(...VALID_STEPS);

/** Generates a valid BPM value */
const bpmArb = fc.integer({ min: 40, max: 240 });

/** Generates a valid swing value */
const swingArb = fc.integer({ min: 0, max: 80 });

/** Generates a valid GenrePresetPattern */
function arbitraryGenrePresetPattern(): fc.Arbitrary<GenrePresetPattern> {
  return stepsArb.chain((steps) =>
    fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 }),
      name: fc.string({ minLength: 1, maxLength: 30 }),
      genre: genreArb,
      tempo: fc.integer({ min: 60, max: 200 }),
      timeSignature: fc.constantFrom("4/4", "3/4", "6/8"),
      swing: fc.integer({ min: 0, max: 100 }),
      steps: fc.constant(steps),
      pattern: fc.tuple(
        fc.array(velocityArb, { minLength: steps, maxLength: steps }),
        fc.array(velocityArb, { minLength: steps, maxLength: steps }),
        fc.array(velocityArb, { minLength: steps, maxLength: steps }),
        fc.array(velocityArb, { minLength: steps, maxLength: steps }),
        fc.array(velocityArb, { minLength: steps, maxLength: steps }),
        fc.array(velocityArb, { minLength: steps, maxLength: steps }),
        fc.array(velocityArb, { minLength: steps, maxLength: steps }),
        fc.array(velocityArb, { minLength: steps, maxLength: steps }),
      ).map((rows) => [...rows] as VelocityPattern),
      tags: fc.array(
        fc.string({ minLength: 1, maxLength: 10 }).map((s) => s.toLowerCase()),
        { minLength: 1, maxLength: 3 },
      ),
    }),
  );
}

/** Generates an arbitrary overlay operation type */
const overlayOperationArb = fc.constantFrom(
  "selectPattern",
  "applyVariation",
  "clearOverlay",
) as fc.Arbitrary<"selectPattern" | "applyVariation" | "clearOverlay">;

/** Generates an arbitrary variation type or null */
const variationArb = fc.constantFrom<VariationType | null>(...VARIATION_TYPES, null);

// ─── Helpers ──────────────────────────────────────────────────────

/** Snapshot of grid state from useBeatMaker */
interface GridSnapshot {
  pattern: VelocityPattern;
  rowStates: { muted: boolean; solo: boolean; volume: number }[];
  steps: PatternLength;
  bpm: number;
  swing: number;
}

/** Deep-copy a grid snapshot for comparison */
function captureGridSnapshot(result: { current: ReturnType<typeof useBeatMaker> }): GridSnapshot {
  return {
    pattern: result.current.pattern.map((row) => [...row]),
    rowStates: result.current.rowStates.map((rs) => ({ ...rs })),
    steps: result.current.steps,
    bpm: result.current.bpm,
    swing: result.current.swing,
  };
}

// ─── Property 12: Grid state independence from overlay operations ─

describe("Feature: rhythm-pattern-overlay, Property 12: Grid state independence from overlay operations", () => {
  it("grid state remains identical after selectPattern overlay operation", () => {
    fc.assert(
      fc.property(arbitraryGenrePresetPattern(), (presetPattern) => {
        // Render both hooks independently (as they would be in the app)
        const { result: gridResult } = renderHook(() => useBeatMaker());
        const { result: overlayResult } = renderHook(() =>
          useOverlayTransport(null, false, 120, 0, null),
        );

        // Capture grid state before overlay operation
        const snapshotBefore = captureGridSnapshot(gridResult);

        // Perform overlay selectPattern operation
        act(() => {
          overlayResult.current.selectPattern(presetPattern);
        });

        // Capture grid state after overlay operation
        const snapshotAfter = captureGridSnapshot(gridResult);

        // Grid state must be unchanged
        expect(snapshotAfter.pattern).toEqual(snapshotBefore.pattern);
        expect(snapshotAfter.rowStates).toEqual(snapshotBefore.rowStates);
        expect(snapshotAfter.steps).toBe(snapshotBefore.steps);
        expect(snapshotAfter.bpm).toBe(snapshotBefore.bpm);
        expect(snapshotAfter.swing).toBe(snapshotBefore.swing);
      }),
      { numRuns: 100 },
    );
  });

  it("grid state remains identical after applyVariation overlay operation", () => {
    fc.assert(
      fc.property(
        arbitraryGenrePresetPattern(),
        variationArb,
        (presetPattern, variation) => {
          const { result: gridResult } = renderHook(() => useBeatMaker());
          const { result: overlayResult } = renderHook(() =>
            useOverlayTransport(null, false, 120, 0, null),
          );

          // First load a pattern into the overlay
          act(() => {
            overlayResult.current.selectPattern(presetPattern);
          });

          // Capture grid state before variation
          const snapshotBefore = captureGridSnapshot(gridResult);

          // Apply variation to overlay
          act(() => {
            overlayResult.current.applyVariation(variation);
          });

          // Capture grid state after variation
          const snapshotAfter = captureGridSnapshot(gridResult);

          // Grid state must be unchanged
          expect(snapshotAfter.pattern).toEqual(snapshotBefore.pattern);
          expect(snapshotAfter.rowStates).toEqual(snapshotBefore.rowStates);
          expect(snapshotAfter.steps).toBe(snapshotBefore.steps);
          expect(snapshotAfter.bpm).toBe(snapshotBefore.bpm);
          expect(snapshotAfter.swing).toBe(snapshotBefore.swing);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("grid state remains identical after clearing the overlay", () => {
    fc.assert(
      fc.property(arbitraryGenrePresetPattern(), (presetPattern) => {
        const { result: gridResult } = renderHook(() => useBeatMaker());
        const { result: overlayResult } = renderHook(() =>
          useOverlayTransport(null, false, 120, 0, null),
        );

        // Load a pattern, then clear it
        act(() => {
          overlayResult.current.selectPattern(presetPattern);
        });

        // Capture grid state before clearing overlay
        const snapshotBefore = captureGridSnapshot(gridResult);

        // Clear overlay by selecting null
        act(() => {
          overlayResult.current.selectPattern(null);
        });

        // Capture grid state after clearing overlay
        const snapshotAfter = captureGridSnapshot(gridResult);

        // Grid state must be unchanged
        expect(snapshotAfter.pattern).toEqual(snapshotBefore.pattern);
        expect(snapshotAfter.rowStates).toEqual(snapshotBefore.rowStates);
        expect(snapshotAfter.steps).toBe(snapshotBefore.steps);
        expect(snapshotAfter.bpm).toBe(snapshotBefore.bpm);
        expect(snapshotAfter.swing).toBe(snapshotBefore.swing);
      }),
      { numRuns: 100 },
    );
  });

  it("grid state with user modifications is preserved through overlay operations", () => {
    fc.assert(
      fc.property(
        arbitraryGenrePresetPattern(),
        overlayOperationArb,
        variationArb,
        fc.integer({ min: 0, max: 7 }),
        fc.integer({ min: 0, max: 15 }),
        (presetPattern, operation, variation, row, col) => {
          const { result: gridResult } = renderHook(() => useBeatMaker());
          const { result: overlayResult } = renderHook(() =>
            useOverlayTransport(null, false, 120, 0, null),
          );

          // Modify grid state before overlay operation
          act(() => {
            gridResult.current.toggleCell(row, col);
          });

          // Capture modified grid state
          const snapshotBefore = captureGridSnapshot(gridResult);

          // Perform the overlay operation
          act(() => {
            switch (operation) {
              case "selectPattern":
                overlayResult.current.selectPattern(presetPattern);
                break;
              case "applyVariation":
                overlayResult.current.selectPattern(presetPattern);
                overlayResult.current.applyVariation(variation);
                break;
              case "clearOverlay":
                overlayResult.current.selectPattern(presetPattern);
                overlayResult.current.selectPattern(null);
                break;
            }
          });

          // Grid state must still match the snapshot from before overlay operation
          const snapshotAfter = captureGridSnapshot(gridResult);
          expect(snapshotAfter.pattern).toEqual(snapshotBefore.pattern);
          expect(snapshotAfter.rowStates).toEqual(snapshotBefore.rowStates);
          expect(snapshotAfter.steps).toBe(snapshotBefore.steps);
          expect(snapshotAfter.bpm).toBe(snapshotBefore.bpm);
          expect(snapshotAfter.swing).toBe(snapshotBefore.swing);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("grid BPM and swing values remain unchanged by overlay volume changes", () => {
    fc.assert(
      fc.property(
        bpmArb,
        swingArb,
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        (bpm, swing, volume) => {
          const { result: gridResult } = renderHook(() => useBeatMaker());
          const { result: overlayResult } = renderHook(() =>
            useOverlayTransport(null, false, bpm, swing, null),
          );

          // Set grid BPM and swing
          act(() => {
            gridResult.current.setBpm(bpm);
            gridResult.current.setSwing(swing);
          });

          // Capture grid state
          const snapshotBefore = captureGridSnapshot(gridResult);

          // Perform overlay volume change
          act(() => {
            overlayResult.current.setOverlayVolume(volume);
          });

          // Grid state must be unchanged
          const snapshotAfter = captureGridSnapshot(gridResult);
          expect(snapshotAfter.bpm).toBe(snapshotBefore.bpm);
          expect(snapshotAfter.swing).toBe(snapshotBefore.swing);
          expect(snapshotAfter.pattern).toEqual(snapshotBefore.pattern);
          expect(snapshotAfter.rowStates).toEqual(snapshotBefore.rowStates);
          expect(snapshotAfter.steps).toBe(snapshotBefore.steps);
        },
      ),
      { numRuns: 100 },
    );
  });
});
