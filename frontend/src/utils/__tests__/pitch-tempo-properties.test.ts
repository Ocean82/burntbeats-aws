import { describe, expect } from 'vitest';
import { fc, test as fcTest } from '@fast-check/vitest';
import {
  timeStretchToTempoRatio,
  getStemTrimWallDurationSeconds,
  trimStartOffsetAtElapsedWall,
  trimToSeconds,
} from '../audio';
import {
  getStemEffectiveRate,
  defaultStemState,
  type StemEditorState,
} from '../../stem-editor-state';
import { stemRoutingSignature } from '../stemPlaybackUtils';
import { PARAM_META } from 'pitch-plugin';

// ─── Helper: mock AudioBuffer for Node/Vitest (no Web Audio API) ───────────
function mockAudioBuffer(duration: number, sampleRate = 44100): AudioBuffer {
  const length = Math.floor(duration * sampleRate);
  return {
    duration,
    length,
    sampleRate,
    numberOfChannels: 2,
    getChannelData: () => new Float32Array(length),
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}

describe('pitch-tempo-plugin-integration properties', () => {
  // ─── Property 1: timeStretch to tempoRatio Inverse Conversion ──────────
  // Validates: Requirements 3.1, 5.2
  describe('Property 1: timeStretch to tempoRatio Inverse Conversion', () => {
    fcTest.prop(
      [fc.double({ min: 0.1, max: 5.0, noNaN: true })],
      { numRuns: 100 },
    )(
      'timeStretchToTempoRatio(ts) ≈ 1.0 / ts for positive values',
      (timeStretch: any) => {
        const result = timeStretchToTempoRatio(timeStretch);
        expect(result).toBeCloseTo(1.0 / timeStretch, 10);
      },
    );

    fcTest.prop(
      [fc.double({ min: -10, max: 0, noNaN: true })],
      { numRuns: 100 },
    )(
      'timeStretchToTempoRatio returns 1.0 for zero/negative values',
      (timeStretch: any) => {
        const result = timeStretchToTempoRatio(timeStretch);
        expect(result).toBe(1.0);
      },
    );
  });

  // ─── Property 2: Pitch Value Clamping ──────────────────────────────────
  // Validates: Requirements 2.2
  describe('Property 2: Pitch Value Clamping', () => {
    fcTest.prop(
      [fc.double({ min: -100, max: 100, noNaN: true })],
      { numRuns: 100 },
    )(
      'pitch values are clamped to [-3, 3]',
      (value: any) => {
        const clamped = Math.max(
          PARAM_META.pitchSemitones.min,
          Math.min(PARAM_META.pitchSemitones.max, value),
        );
        expect(clamped).toBeGreaterThanOrEqual(PARAM_META.pitchSemitones.min - 1e-9);
        expect(clamped).toBeLessThanOrEqual(PARAM_META.pitchSemitones.max + 1e-9);
      },
    );
  });

  // ─── Property 3: Tempo Ratio Clamping ──────────────────────────────────
  // Validates: Requirements 3.2
  describe('Property 3: Tempo Ratio Clamping', () => {
    fcTest.prop(
      [fc.double({ min: 0.1, max: 5.0, noNaN: true })],
      { numRuns: 100 },
    )(
      'tempo ratio values are clamped to plugin PARAM_META range',
      (value: any) => {
        const clamped = Math.max(
          PARAM_META.tempoRatio.min,
          Math.min(PARAM_META.tempoRatio.max, value),
        );
        expect(clamped).toBeGreaterThanOrEqual(PARAM_META.tempoRatio.min);
        expect(clamped).toBeLessThanOrEqual(PARAM_META.tempoRatio.max);
      },
    );
  });

  // ─── Property 4: Legacy Effective Rate Formula Preservation ────────────
  // Validates: Requirements 5.3, 9.1
  describe('Property 4: Legacy Effective Rate Formula Preservation', () => {
    fcTest.prop(
      [
        fc.double({ min: -12, max: 12, noNaN: true }),
        fc.double({ min: 0.1, max: 2.0, noNaN: true }),
      ],
      { numRuns: 100 },
    )(
      'getStemEffectiveRate(state) ≈ 2^(pitchSemitones/12) / timeStretch',
      (pitchSemitones, timeStretch) => {
        const state: StemEditorState = {
          ...defaultStemState(),
          pitchSemitones,
          timeStretch,
        };
        const result = getStemEffectiveRate(state);
        const expected = Math.pow(2, pitchSemitones / 12) / timeStretch;
        expect(result).toBeCloseTo(expected, 10);
      },
    );
  });

  // ─── Property 5: Plugin-Mode Wall-Clock Duration ───────────────────────
  // Validates: Requirements 7.1, 7.2
  describe('Property 5: Plugin-Mode Wall-Clock Duration', () => {
    fcTest.prop(
      [
        fc.double({ min: 1, max: 60, noNaN: true }),
        fc.double({ min: 0, max: 49, noNaN: true }),
        fc.double({ min: 51, max: 100, noNaN: true }),
        fc.double({ min: 0.85, max: 1.15, noNaN: true }),
      ],
      { numRuns: 100 },
    )(
      'wall-clock duration = (trimEnd - trimStart) * timeStretch in plugin mode',
      (duration, trimStartPct, trimEndPct, timeStretch) => {
        fc.pre(trimStartPct < trimEndPct);

        const buffer = mockAudioBuffer(duration);
        const state: StemEditorState = {
          ...defaultStemState(),
          trim: { start: trimStartPct, end: trimEndPct },
          timeStretch,
        };

        const wallDuration = getStemTrimWallDurationSeconds(buffer, state, true);
        const { trimStart, trimEnd } = trimToSeconds(buffer, state.trim);
        const expected = (trimEnd - trimStart) * timeStretch;

        expect(wallDuration).toBeCloseTo(expected, 5);
      },
    );
  });

  // ─── Property 6: Plugin-Mode Seek Offset Consistency ───────────────────
  // Validates: Requirements 7.3
  describe('Property 6: Plugin-Mode Seek Offset Consistency', () => {
    fcTest.prop(
      [
        fc.double({ min: 1, max: 60, noNaN: true }),
        fc.double({ min: 0, max: 49, noNaN: true }),
        fc.double({ min: 51, max: 100, noNaN: true }),
        fc.double({ min: 0.85, max: 1.15, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
      ],
      { numRuns: 100 },
    )(
      'startOffset ≈ trimStart + (elapsedWall / timeStretch) capped at trimEnd',
      (duration, trimStartPct, trimEndPct, timeStretch, elapsedWallFraction) => {
        fc.pre(trimStartPct < trimEndPct);

        const buffer = mockAudioBuffer(duration);
        const state: StemEditorState = {
          ...defaultStemState(),
          trim: { start: trimStartPct, end: trimEndPct },
          timeStretch,
        };

        const wallDuration = getStemTrimWallDurationSeconds(buffer, state, true);
        const elapsedWall = wallDuration * elapsedWallFraction;

        const { startOffset, trimStart, trimEnd } = trimStartOffsetAtElapsedWall(
          buffer,
          state,
          elapsedWall,
          true,
        );

        const expectedRaw = trimStart + elapsedWall / timeStretch;
        const expected = Math.min(trimEnd, expectedRaw);

        expect(startOffset).toBeCloseTo(expected, 5);
      },
    );
  });

  // ─── Property 7: Duration-Seek Round Trip ──────────────────────────────
  // Validates: Requirements 7.1, 7.3
  describe('Property 7: Duration-Seek Round Trip', () => {
    fcTest.prop(
      [
        fc.double({ min: 1, max: 60, noNaN: true }),
        fc.double({ min: 0, max: 49, noNaN: true }),
        fc.double({ min: 51, max: 100, noNaN: true }),
        fc.double({ min: 0.85, max: 1.15, noNaN: true }),
      ],
      { numRuns: 100 },
    )(
      'seeking to wallDuration yields startOffset === trimEnd',
      (duration, trimStartPct, trimEndPct, timeStretch) => {
        fc.pre(trimStartPct < trimEndPct);

        const buffer = mockAudioBuffer(duration);
        const state: StemEditorState = {
          ...defaultStemState(),
          trim: { start: trimStartPct, end: trimEndPct },
          timeStretch,
        };

        const wallDuration = getStemTrimWallDurationSeconds(buffer, state, true);
        const { startOffset, trimEnd } = trimStartOffsetAtElapsedWall(
          buffer,
          state,
          wallDuration,
          true,
        );

        expect(startOffset).toBeCloseTo(trimEnd, 5);
      },
    );
  });

  // ─── Property 8: Routing Signature Sensitivity ─────────────────────────
  // Validates: Requirements 5.4, 6.1
  describe('Property 8: Routing Signature Sensitivity', () => {
    fcTest.prop(
      [
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: 0.85, max: 1.15, noNaN: true }),
        fc.double({ min: 0.85, max: 1.15, noNaN: true }),
      ],
      { numRuns: 100 },
    )(
      'different pitchSemitones or timeStretch produce different routing signatures',
      (pitch1, pitch2, stretch1, stretch2) => {
        // Ensure at least one field differs
        fc.pre(pitch1 !== pitch2 || stretch1 !== stretch2);

        const stemId = 'vocals';
        const state1: StemEditorState = {
          ...defaultStemState(),
          pitchSemitones: pitch1,
          timeStretch: stretch1,
        };
        const state2: StemEditorState = {
          ...defaultStemState(),
          pitchSemitones: pitch2,
          timeStretch: stretch2,
        };

        const sig1 = stemRoutingSignature({ [stemId]: state1 }, [stemId]);
        const sig2 = stemRoutingSignature({ [stemId]: state2 }, [stemId]);

        expect(sig1).not.toBe(sig2);
      },
    );
  });
});
