/**
 * Property-Based Test: File validation determines phase transition (Property 1)
 *
 * Feature: stem-editor-transitional-ui
 * Property 1: File validation determines phase transition
 *
 * For any file metadata (format string and size in bytes), if the format is one of
 * {WAV, MP3, FLAC, OGG, AAC} and the size is ≤ 500 MB (inclusive), the Phase_Controller
 * SHALL transition from "upload" to "configure"; otherwise the Phase_Controller SHALL
 * remain in "upload" and produce a non-empty error message.
 *
 * **Validates: Requirements 1.3, 1.8, 1.9**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateFile,
  SUPPORTED_FORMATS,
  MAX_FILE_SIZE_BYTES,
} from './validateFile';

describe('Feature: stem-editor-transitional-ui, Property 1: File validation determines phase transition', () => {
  /** Arbitrary for supported format strings */
  const supportedFormatArb = fc.constantFrom(...SUPPORTED_FORMATS);

  /** Arbitrary for unsupported format strings — random strings that are NOT in the supported set */
  const unsupportedFormatArb = fc
    .string({ minLength: 1, maxLength: 10 })
    .filter((s) => !(SUPPORTED_FORMATS as readonly string[]).includes(s.toLowerCase().trim()));

  /** Arbitrary for valid sizes: 0 to 500 MB inclusive */
  const validSizeArb = fc.integer({ min: 0, max: MAX_FILE_SIZE_BYTES });

  /** Arbitrary for invalid sizes: > 500 MB */
  const invalidSizeArb = fc.integer({ min: MAX_FILE_SIZE_BYTES + 1, max: MAX_FILE_SIZE_BYTES * 10 });

  it('supported format + valid size → transition to "configure" (valid=true, no error)', () => {
    fc.assert(
      fc.property(supportedFormatArb, validSizeArb, (format, size) => {
        const result = validateFile({ format, size });

        expect(result.valid).toBe(true);
        expect(result.error).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('unsupported format + valid size → remain in "upload" with non-empty error', () => {
    fc.assert(
      fc.property(unsupportedFormatArb, validSizeArb, (format, size) => {
        const result = validateFile({ format, size });

        expect(result.valid).toBe(false);
        expect(result.error).toBeTruthy();
        expect(typeof result.error).toBe('string');
        expect(result.error!.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('supported format + size > 500 MB → remain in "upload" with non-empty error', () => {
    fc.assert(
      fc.property(supportedFormatArb, invalidSizeArb, (format, size) => {
        const result = validateFile({ format, size });

        expect(result.valid).toBe(false);
        expect(result.error).toBeTruthy();
        expect(typeof result.error).toBe('string');
        expect(result.error!.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('unsupported format + size > 500 MB → remain in "upload" with non-empty error', () => {
    fc.assert(
      fc.property(unsupportedFormatArb, invalidSizeArb, (format, size) => {
        const result = validateFile({ format, size });

        expect(result.valid).toBe(false);
        expect(result.error).toBeTruthy();
        expect(typeof result.error).toBe('string');
        expect(result.error!.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('exactly 500 MB file with supported format → valid (boundary inclusive)', () => {
    fc.assert(
      fc.property(supportedFormatArb, (format) => {
        const result = validateFile({ format, size: MAX_FILE_SIZE_BYTES });

        expect(result.valid).toBe(true);
        expect(result.error).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('case-insensitive format matching — mixed-case supported formats are accepted', () => {
    const mixedCaseFormatArb = supportedFormatArb.chain((fmt) =>
      fc.tuple(...[...fmt].map(() => fc.boolean())).map((upperFlags) =>
        [...fmt].map((c, i) => (upperFlags[i] ? c.toUpperCase() : c.toLowerCase())).join(''),
      ),
    );

    fc.assert(
      fc.property(mixedCaseFormatArb, validSizeArb, (format, size) => {
        const result = validateFile({ format, size });

        expect(result.valid).toBe(true);
        expect(result.error).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});
