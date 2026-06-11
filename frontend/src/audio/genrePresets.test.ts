/**
 * genrePresets — Unit tests for validation and query functions.
 */
import { describe, expect, it } from "vitest";
import {
  GENRE_PRESETS,
  type GenrePresetPattern,
  getPresetsByGenre,
  getValidPresets,
  validatePreset,
} from "./genrePresets";

describe("genrePresets", () => {
  describe("validatePreset", () => {
    it("accepts all built-in presets", () => {
      for (const preset of GENRE_PRESETS) {
        expect(validatePreset(preset)).toBe(true);
      }
    });

    it("rejects preset with wrong row count", () => {
      const bad: GenrePresetPattern = {
        ...GENRE_PRESETS[0],
        pattern: GENRE_PRESETS[0].pattern.slice(0, 7), // only 7 rows
      };
      expect(validatePreset(bad)).toBe(false);
    });

    it("rejects preset with mismatched step count", () => {
      const bad: GenrePresetPattern = {
        ...GENRE_PRESETS[0],
        pattern: GENRE_PRESETS[0].pattern.map((row) => row.slice(0, 8)), // only 8 steps
      };
      expect(validatePreset(bad)).toBe(false);
    });

    it("rejects preset with velocity out of range", () => {
      const bad: GenrePresetPattern = {
        ...GENRE_PRESETS[0],
        pattern: GENRE_PRESETS[0].pattern.map((row, i) =>
          i === 0 ? [200, ...row.slice(1)] : [...row],
        ),
      };
      expect(validatePreset(bad)).toBe(false);
    });

    it("rejects preset with invalid genre", () => {
      const bad = {
        ...GENRE_PRESETS[0],
        genre: "country" as GenrePresetPattern["genre"],
      };
      expect(validatePreset(bad)).toBe(false);
    });

    it("rejects preset with tempo out of range (too low)", () => {
      const bad: GenrePresetPattern = { ...GENRE_PRESETS[0], tempo: 50 };
      expect(validatePreset(bad)).toBe(false);
    });

    it("rejects preset with tempo out of range (too high)", () => {
      const bad: GenrePresetPattern = { ...GENRE_PRESETS[0], tempo: 210 };
      expect(validatePreset(bad)).toBe(false);
    });

    it("rejects preset with invalid steps value", () => {
      const bad = { ...GENRE_PRESETS[0], steps: 24 as GenrePresetPattern["steps"] };
      expect(validatePreset(bad)).toBe(false);
    });

    it("rejects preset with non-integer velocity", () => {
      const bad: GenrePresetPattern = {
        ...GENRE_PRESETS[0],
        pattern: GENRE_PRESETS[0].pattern.map((row, i) =>
          i === 0 ? [50.5, ...row.slice(1)] : [...row],
        ),
      };
      expect(validatePreset(bad)).toBe(false);
    });

    it("accepts preset with boundary values (tempo 60, 200)", () => {
      const low: GenrePresetPattern = { ...GENRE_PRESETS[0], tempo: 60 };
      const high: GenrePresetPattern = { ...GENRE_PRESETS[0], tempo: 200 };
      expect(validatePreset(low)).toBe(true);
      expect(validatePreset(high)).toBe(true);
    });
  });

  describe("getValidPresets", () => {
    it("returns all built-in presets (all valid)", () => {
      const valid = getValidPresets();
      expect(valid.length).toBe(GENRE_PRESETS.length);
    });
  });

  describe("getPresetsByGenre", () => {
    it("returns at least one preset per genre", () => {
      const genres = ["rock", "hip-hop", "edm", "jazz", "latin", "reggae"];
      for (const genre of genres) {
        const presets = getPresetsByGenre(genre);
        expect(presets.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("returns only presets of the requested genre", () => {
      const rockPresets = getPresetsByGenre("rock");
      for (const p of rockPresets) {
        expect(p.genre).toBe("rock");
      }
    });

    it("returns empty array for unknown genre", () => {
      expect(getPresetsByGenre("country")).toHaveLength(0);
    });
  });

  describe("data integrity", () => {
    it("all presets have 8 rows in DEFAULT_KIT order", () => {
      for (const preset of GENRE_PRESETS) {
        expect(preset.pattern.length).toBe(8);
      }
    });

    it("covers all six genres", () => {
      const genres = new Set(GENRE_PRESETS.map((p) => p.genre));
      expect(genres).toEqual(
        new Set(["rock", "hip-hop", "edm", "jazz", "latin", "reggae"]),
      );
    });

    it("all presets are statically importable (no fetch)", () => {
      // If we got here, the import succeeded — no runtime fetch needed
      expect(GENRE_PRESETS.length).toBeGreaterThan(0);
    });
  });
});
