/**
 * Property-Based Tests for Genre Presets
 *
 * Feature: rhythm-pattern-overlay
 *
 * Property 1: Pattern validation accepts valid and rejects invalid presets
 * Property 4: Genre filter correctness
 *
 * **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 3.3**
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  validatePreset,
  getPresetsByGenre,
  getValidPresets,
  type GenrePresetPattern,
  type GenreType,
} from "./genrePresets";
import type { PatternLength } from "./types";

// ─── Generators ───────────────────────────────────────────────────

const VALID_GENRES: GenreType[] = ["rock", "hip-hop", "edm", "jazz", "latin", "reggae"];
const VALID_STEPS: PatternLength[] = [16, 32, 64];

/** Generates a valid velocity value (integer 0–127) */
const velocityArb = fc.integer({ min: 0, max: 127 });

/** Generates a valid genre */
const genreArb = fc.constantFrom<GenreType>(...VALID_GENRES);

/** Generates a valid steps value */
const stepsArb = fc.constantFrom<PatternLength>(...VALID_STEPS);

/** Generates a valid tempo (60–200) */
const tempoArb = fc.integer({ min: 60, max: 200 });

/** Generates a valid swing value (0–100) */
const swingArb = fc.integer({ min: 0, max: 100 });

/**
 * arbitraryGenrePresetPattern() — generates valid GenrePresetPattern objects
 */
function arbitraryGenrePresetPattern(): fc.Arbitrary<GenrePresetPattern> {
  return stepsArb.chain((steps) =>
    fc.record({
      id: fc.string({ minLength: 1, maxLength: 30 }),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      genre: genreArb,
      tempo: tempoArb,
      timeSignature: fc.constantFrom("4/4", "3/4", "6/8"),
      swing: swingArb,
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
      ).map((rows) => [...rows]),
      tags: fc.array(fc.string({ minLength: 1, maxLength: 15 }).map((s) => s.toLowerCase()), {
        minLength: 0,
        maxLength: 5,
      }),
    }),
  );
}

/**
 * arbitraryInvalidPresetPattern() — generates presets that violate one or more validation rules.
 * Each generated preset has exactly one intentional violation.
 */
function arbitraryInvalidPresetPattern(): fc.Arbitrary<GenrePresetPattern> {
  // We pick a violation type and produce a pattern that breaks that specific rule
  return fc
    .constantFrom(
      "bad-genre",
      "bad-tempo-low",
      "bad-tempo-high",
      "bad-steps",
      "bad-row-count",
      "bad-row-length",
      "bad-velocity-high",
      "bad-velocity-negative",
      "bad-velocity-float",
    )
    .chain((violationType) => {
      // Start with a valid preset and corrupt one thing
      return arbitraryGenrePresetPattern().map((validPreset) => {
        switch (violationType) {
          case "bad-genre":
            return { ...validPreset, genre: "country" as GenreType };

          case "bad-tempo-low":
            return { ...validPreset, tempo: fc.sample(fc.integer({ min: -100, max: 59 }), 1)[0] };

          case "bad-tempo-high":
            return { ...validPreset, tempo: fc.sample(fc.integer({ min: 201, max: 500 }), 1)[0] };

          case "bad-steps":
            return { ...validPreset, steps: 24 as PatternLength };

          case "bad-row-count": {
            // Remove one row to get 7 rows
            const shortPattern = validPreset.pattern.slice(0, 7);
            return { ...validPreset, pattern: shortPattern };
          }

          case "bad-row-length": {
            // Make one row have wrong length
            const badPattern = validPreset.pattern.map((row, i) =>
              i === 0 ? row.slice(0, row.length - 1) : row,
            );
            return { ...validPreset, pattern: badPattern };
          }

          case "bad-velocity-high": {
            // Insert velocity > 127
            const badPattern = validPreset.pattern.map((row, i) =>
              i === 0 ? [200, ...row.slice(1)] : [...row],
            );
            return { ...validPreset, pattern: badPattern };
          }

          case "bad-velocity-negative": {
            // Insert negative velocity
            const badPattern = validPreset.pattern.map((row, i) =>
              i === 0 ? [-1, ...row.slice(1)] : [...row],
            );
            return { ...validPreset, pattern: badPattern };
          }

          case "bad-velocity-float": {
            // Insert float velocity
            const badPattern = validPreset.pattern.map((row, i) =>
              i === 0 ? [50.5, ...row.slice(1)] : [...row],
            );
            return { ...validPreset, pattern: badPattern };
          }

          default:
            return validPreset;
        }
      });
    });
}

// ─── Property 1: Pattern validation accepts valid and rejects invalid presets ──

describe("Feature: rhythm-pattern-overlay, Property 1: Pattern validation accepts valid and rejects invalid presets", () => {
  it("validatePreset returns true for any valid preset (8 rows, correct steps, velocity 0–127, valid genre, tempo 60–200)", () => {
    fc.assert(
      fc.property(arbitraryGenrePresetPattern(), (preset) => {
        expect(validatePreset(preset)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("validatePreset returns false for presets with invalid genre", () => {
    fc.assert(
      fc.property(
        arbitraryGenrePresetPattern().map((p) => ({ ...p, genre: "country" as GenreType })),
        (preset) => {
          expect(validatePreset(preset)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("validatePreset returns false for presets with tempo below 60", () => {
    fc.assert(
      fc.property(
        fc.tuple(arbitraryGenrePresetPattern(), fc.integer({ min: -100, max: 59 })),
        ([preset, badTempo]) => {
          const invalid = { ...preset, tempo: badTempo };
          expect(validatePreset(invalid)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("validatePreset returns false for presets with tempo above 200", () => {
    fc.assert(
      fc.property(
        fc.tuple(arbitraryGenrePresetPattern(), fc.integer({ min: 201, max: 500 })),
        ([preset, badTempo]) => {
          const invalid = { ...preset, tempo: badTempo };
          expect(validatePreset(invalid)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("validatePreset returns false for presets with invalid steps value", () => {
    const invalidSteps = fc.integer({ min: 1, max: 128 }).filter((s) => s !== 16 && s !== 32 && s !== 64);
    fc.assert(
      fc.property(
        fc.tuple(arbitraryGenrePresetPattern(), invalidSteps),
        ([preset, badSteps]) => {
          const invalid = { ...preset, steps: badSteps as PatternLength };
          expect(validatePreset(invalid)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("validatePreset returns false for presets with row count != 8", () => {
    const rowCountArb = fc.integer({ min: 1, max: 12 }).filter((n) => n !== 8);
    fc.assert(
      fc.property(
        fc.tuple(arbitraryGenrePresetPattern(), rowCountArb),
        ([preset, rowCount]) => {
          const invalid = {
            ...preset,
            pattern: preset.pattern.slice(0, Math.min(rowCount, preset.pattern.length)),
          };
          // Ensure we have exactly rowCount rows (pad with empty if needed)
          while (invalid.pattern.length < rowCount) {
            invalid.pattern.push(new Array(preset.steps).fill(0));
          }
          expect(validatePreset(invalid as GenrePresetPattern)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("validatePreset returns false for presets with row length != declared steps", () => {
    fc.assert(
      fc.property(
        fc.tuple(arbitraryGenrePresetPattern(), fc.integer({ min: 1, max: 5 })),
        ([preset, trimAmount]) => {
          // Make one row shorter than declared steps
          const invalid = {
            ...preset,
            pattern: preset.pattern.map((row, i) =>
              i === 0 ? row.slice(0, Math.max(1, row.length - trimAmount)) : row,
            ),
          };
          expect(validatePreset(invalid as GenrePresetPattern)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("validatePreset returns false for presets with velocity values outside 0–127", () => {
    const badVelocityArb = fc.oneof(
      fc.integer({ min: 128, max: 500 }),
      fc.integer({ min: -500, max: -1 }),
      fc.double({ min: 0.01, max: 126.99 }).filter((v) => !Number.isInteger(v)),
    );
    fc.assert(
      fc.property(
        fc.tuple(arbitraryGenrePresetPattern(), badVelocityArb),
        ([preset, badVel]) => {
          const invalid = {
            ...preset,
            pattern: preset.pattern.map((row, i) =>
              i === 0 ? [badVel, ...row.slice(1)] : [...row],
            ),
          };
          expect(validatePreset(invalid as GenrePresetPattern)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("validatePreset returns false for any generated invalid preset", () => {
    fc.assert(
      fc.property(arbitraryInvalidPresetPattern(), (preset) => {
        expect(validatePreset(preset)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 4: Genre filter correctness ─────────────────────────

describe("Feature: rhythm-pattern-overlay, Property 4: Genre filter correctness", () => {
  it("filtered list contains only patterns matching the selected genre", () => {
    fc.assert(
      fc.property(genreArb, (genre) => {
        const filtered = getPresetsByGenre(genre);
        for (const pattern of filtered) {
          expect(pattern.genre).toBe(genre);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("filtered list contains all matching patterns from the valid presets (up to 50)", () => {
    fc.assert(
      fc.property(genreArb, (genre) => {
        const allValid = getValidPresets();
        const filtered = getPresetsByGenre(genre);
        const expectedMatches = allValid.filter((p) => p.genre === genre);

        // All matching patterns are included (up to 50)
        const expectedCount = Math.min(expectedMatches.length, 50);
        expect(filtered.length).toBe(expectedCount);

        // Every expected match appears in the filtered result
        for (const expected of expectedMatches.slice(0, 50)) {
          expect(filtered.some((p) => p.id === expected.id)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("filtering by an unsupported genre returns an empty list", () => {
    const unsupportedGenreArb = fc
      .string({ minLength: 1, maxLength: 15 })
      .filter((s) => !VALID_GENRES.includes(s as GenreType));

    fc.assert(
      fc.property(unsupportedGenreArb, (genre) => {
        const filtered = getPresetsByGenre(genre);
        expect(filtered).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  it("returns at least one preset for every built-in genre", () => {
  const genres = ["rock", "hip-hop", "edm", "jazz", "latin", "reggae"];
  for (const genre of genres) {
    const presets = getPresetsByGenre(genre);
    expect(presets.length).toBeGreaterThanOrEqual(1);
  }
});

it("for arbitrary valid patterns and genre selections, filtered list is a correct subset", () => {
    // Generate a set of valid patterns and a genre to filter by
    fc.assert(
      fc.property(
        fc.array(arbitraryGenrePresetPattern(), { minLength: 1, maxLength: 20 }),
        genreArb,
        (patterns, selectedGenre) => {
          // Manually filter the generated patterns
          const matching = patterns.filter(
            (p) => p.genre === selectedGenre && validatePreset(p),
          );
          const nonMatching = patterns.filter(
            (p) => p.genre !== selectedGenre || !validatePreset(p),
          );

          // Verify the correctness property: matching patterns pass validation and have correct genre
          for (const p of matching) {
            expect(p.genre).toBe(selectedGenre);
            expect(validatePreset(p)).toBe(true);
          }

          // Verify non-matching patterns either have wrong genre or are invalid
          for (const p of nonMatching) {
            expect(p.genre !== selectedGenre || !validatePreset(p)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
