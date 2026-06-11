/**
 * genrePresets — Genre-based rhythm pattern preset library for the overlay system.
 *
 * Each preset defines a complete pattern with metadata for browsing/filtering
 * in the Pattern Library Panel. Patterns use the DEFAULT_KIT row order:
 *   0: Kick, 1: Snare, 2: Closed HH, 3: Open HH,
 *   4: Clap, 5: Ride, 6: Tom Hi, 7: Tom Lo
 *
 * Imported statically at build time (no runtime network requests).
 */
import type { PatternLength, VelocityPattern } from "./types";
import { VELOCITY_ACCENT, VELOCITY_GHOST, VELOCITY_NORMAL, VELOCITY_OFF } from "./types";

// ─── Types ────────────────────────────────────────────────────────

export type GenreType = "rock" | "hip-hop" | "edm" | "jazz" | "latin" | "reggae";

export type VariationType = "fill" | "breakdown" | "buildup";

export interface GenrePresetPattern {
  id: string;
  name: string;
  genre: GenreType;
  tempo: number;          // 60–200 BPM
  timeSignature: string;  // e.g. "4/4"
  swing: number;          // 0–100
  steps: PatternLength;   // 16 | 32 | 64
  pattern: VelocityPattern; // 8 rows × steps columns
  tags: string[];         // lowercase descriptive tags
}

// ─── Validation ───────────────────────────────────────────────────

const VALID_GENRES: GenreType[] = ["rock", "hip-hop", "edm", "jazz", "latin", "reggae"];
const VALID_STEPS: PatternLength[] = [16, 32, 64];

/**
 * Validates a preset against all required constraints.
 * Returns true if the preset is valid, false otherwise.
 */
export function validatePreset(preset: GenrePresetPattern): boolean {
  // Genre must be one of the six supported values
  if (!VALID_GENRES.includes(preset.genre)) return false;

  // Tempo must be 60–200
  if (preset.tempo < 60 || preset.tempo > 200) return false;

  // Steps must be 16, 32, or 64
  if (!VALID_STEPS.includes(preset.steps)) return false;

  // Pattern must have exactly 8 rows
  if (!Array.isArray(preset.pattern) || preset.pattern.length !== 8) return false;

  // Each row's length must match declared steps, and all values must be integers 0–127
  for (const row of preset.pattern) {
    if (!Array.isArray(row) || row.length !== preset.steps) return false;
    for (const v of row) {
      if (!Number.isInteger(v) || v < 0 || v > 127) return false;
    }
  }

  return true;
}

/**
 * Returns all presets that pass validation.
 */
export function getValidPresets(): GenrePresetPattern[] {
  return GENRE_PRESETS.filter(validatePreset);
}

/**
 * Returns valid presets filtered by genre.
 */
export function getPresetsByGenre(genre: string): GenrePresetPattern[] {
  return getValidPresets().filter((p) => p.genre === genre);
}

// ─── Shorthand aliases for readability ────────────────────────────
const _ = VELOCITY_OFF;
const g = VELOCITY_GHOST;   // 40
const n = VELOCITY_NORMAL;  // 100
const a = VELOCITY_ACCENT;  // 127

// ─── ROCK PRESETS ─────────────────────────────────────────────────

const rockBasic: GenrePresetPattern = {
  id: "rock-basic-4x4",
  name: "Basic Rock",
  genre: "rock",
  tempo: 120,
  timeSignature: "4/4",
  swing: 0,
  steps: 16,
  pattern: [
    /* Kick  */ [a, _, _, _, _, _, _, _, a, _, _, _, _, _, _, _],
    /* Snare */ [_, _, _, _, a, _, _, _, _, _, _, _, a, _, _, _],
    /* CH HH */ [a, _, n, _, a, _, n, _, a, _, n, _, a, _, n, _],
    /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ],
  tags: ["basic", "rock", "steady"],
};

const rockDriving: GenrePresetPattern = {
  id: "rock-driving-8th",
  name: "Driving Rock",
  genre: "rock",
  tempo: 130,
  timeSignature: "4/4",
  swing: 0,
  steps: 16,
  pattern: [
    /* Kick  */ [a, _, _, _, a, _, _, _, a, _, _, _, a, _, _, _],
    /* Snare */ [_, _, _, _, a, _, _, _, _, _, _, _, a, _, _, _],
    /* CH HH */ [n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n],
    /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ],
  tags: ["driving", "rock", "energetic"],
};

// ─── HIP-HOP PRESETS ──────────────────────────────────────────────

const hiphopBoomBap: GenrePresetPattern = {
  id: "hiphop-boom-bap",
  name: "Boom Bap",
  genre: "hip-hop",
  tempo: 90,
  timeSignature: "4/4",
  swing: 30,
  steps: 16,
  pattern: [
    /* Kick  */ [a, _, _, _, _, _, _, _, n, _, _, _, _, _, _, _],
    /* Snare */ [_, _, _, _, a, _, _, _, _, _, _, _, a, _, _, _],
    /* CH HH */ [_, _, n, _, _, _, g, _, _, _, n, _, _, _, g, _],
    /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ],
  tags: ["boom-bap", "hip-hop", "classic"],
};

const hiphopTrap: GenrePresetPattern = {
  id: "hiphop-trap-32",
  name: "Trap",
  genre: "hip-hop",
  tempo: 140,
  timeSignature: "4/4",
  swing: 0,
  steps: 32,
  pattern: [
    /* Kick  */ [a,_,_,_,_,_,_,_,_,_,_,_,n,_,_,_, a,_,_,_,_,_,_,_,_,_,n,_,_,_,_,_],
    /* Snare */ [_,_,_,_,_,_,_,_,a,_,_,_,_,_,_,_, _,_,_,_,_,_,_,_,a,_,_,_,_,_,_,_],
    /* CH HH */ [n,_,n,_,n,_,n,_,n,_,n,n,n,_,n,_, n,_,n,_,n,_,n,n,n,_,n,_,n,n,n,n],
    /* OH HH */ [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,n, _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    /* Clap  */ [_,_,_,_,_,_,_,_,a,_,_,_,_,_,_,_, _,_,_,_,_,_,_,_,a,_,_,_,_,_,_,_],
    /* Ride  */ [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_, _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    /* TomHi */ [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_, _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    /* TomLo */ [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_, _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ],
  tags: ["trap", "hip-hop", "modern"],
};

// ─── EDM PRESETS ──────────────────────────────────────────────────

const edmFourFloor: GenrePresetPattern = {
  id: "edm-four-floor",
  name: "Four on the Floor",
  genre: "edm",
  tempo: 128,
  timeSignature: "4/4",
  swing: 0,
  steps: 16,
  pattern: [
    /* Kick  */ [a, _, _, _, a, _, _, _, a, _, _, _, a, _, _, _],
    /* Snare */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* CH HH */ [_, _, n, _, _, _, n, _, _, _, n, _, _, _, n, _],
    /* OH HH */ [_, _, _, _, _, _, _, n, _, _, _, _, _, _, _, n],
    /* Clap  */ [_, _, _, _, a, _, _, _, _, _, _, _, a, _, _, _],
    /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ],
  tags: ["house", "edm", "dance", "four-on-floor"],
};

const edmDnB: GenrePresetPattern = {
  id: "edm-dnb",
  name: "Drum & Bass",
  genre: "edm",
  tempo: 174,
  timeSignature: "4/4",
  swing: 0,
  steps: 16,
  pattern: [
    /* Kick  */ [a, _, _, _, _, _, _, _, _, _, n, _, _, _, _, _],
    /* Snare */ [_, _, _, _, a, _, _, _, _, _, _, _, _, _, a, _],
    /* CH HH */ [n, _, n, _, n, _, n, _, n, _, n, _, n, _, n, _],
    /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ],
  tags: ["dnb", "edm", "fast", "jungle"],
};

// ─── JAZZ PRESETS ─────────────────────────────────────────────────

const jazzSwing: GenrePresetPattern = {
  id: "jazz-swing-ride",
  name: "Jazz Swing",
  genre: "jazz",
  tempo: 140,
  timeSignature: "4/4",
  swing: 55,
  steps: 16,
  pattern: [
    /* Kick  */ [n, _, _, _, _, _, _, _, _, _, g, _, _, _, _, _],
    /* Snare */ [_, _, _, _, n, _, _, g, _, _, _, _, n, _, _, g],
    /* CH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* Ride  */ [a, _, n, a, _, n, a, _, n, a, _, n, a, _, n, _],
    /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ],
  tags: ["jazz", "swing", "ride"],
};

const jazzBossa: GenrePresetPattern = {
  id: "jazz-bossa-nova",
  name: "Bossa Nova",
  genre: "jazz",
  tempo: 130,
  timeSignature: "4/4",
  swing: 20,
  steps: 16,
  pattern: [
    /* Kick  */ [n, _, _, _, _, _, n, _, _, _, _, _, _, _, _, _],
    /* Snare */ [_, _, _, _, _, _, _, _, _, _, n, _, _, _, _, _],
    /* CH HH */ [n, _, n, _, n, _, n, _, n, _, n, _, n, _, n, _],
    /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* TomHi */ [_, _, _, g, _, _, _, _, _, _, _, g, _, _, _, _],
    /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ],
  tags: ["jazz", "bossa-nova", "latin-jazz"],
};

// ─── LATIN PRESETS ────────────────────────────────────────────────

const latinSalsa: GenrePresetPattern = {
  id: "latin-salsa-clave",
  name: "Salsa",
  genre: "latin",
  tempo: 180,
  timeSignature: "4/4",
  swing: 0,
  steps: 32,
  pattern: [
    /* Kick  */ [a,_,_,_,_,_,n,_,_,n,_,_,_,_,_,_, a,_,_,_,_,_,n,_,_,_,_,_,n,_,_,_],
    /* Snare */ [_,_,_,_,a,_,_,_,_,_,_,_,a,_,_,_, _,_,_,_,a,_,_,_,_,_,_,_,a,_,_,_],
    /* CH HH */ [n,_,n,_,n,_,n,_,n,_,n,_,n,_,n,_, n,_,n,_,n,_,n,_,n,_,n,_,n,_,n,_],
    /* OH HH */ [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_, _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    /* Clap  */ [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_, _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    /* Ride  */ [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_, _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    /* TomHi */ [_,_,_,n,_,_,_,_,_,_,_,n,_,_,_,_, _,_,n,_,_,_,_,_,n,_,_,_,_,_,_,_],
    /* TomLo */ [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_, _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ],
  tags: ["salsa", "latin", "clave"],
};

const latinReggaeton: GenrePresetPattern = {
  id: "latin-reggaeton",
  name: "Reggaeton",
  genre: "latin",
  tempo: 95,
  timeSignature: "4/4",
  swing: 0,
  steps: 16,
  pattern: [
    /* Kick  */ [a, _, _, n, _, _, _, a, _, _, n, _, _, _, _, _],
    /* Snare */ [_, _, _, _, a, _, _, _, _, _, _, _, a, _, _, _],
    /* CH HH */ [n, _, n, _, n, _, n, _, n, _, n, _, n, _, n, _],
    /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ],
  tags: ["reggaeton", "latin", "dembow"],
};

// ─── REGGAE PRESETS ───────────────────────────────────────────────

const reggaeOneDrop: GenrePresetPattern = {
  id: "reggae-one-drop",
  name: "One Drop",
  genre: "reggae",
  tempo: 75,
  timeSignature: "4/4",
  swing: 10,
  steps: 16,
  pattern: [
    /* Kick  */ [_, _, _, _, _, _, _, _, a, _, _, _, _, _, _, _],
    /* Snare */ [_, _, _, _, _, _, _, _, a, _, _, _, _, _, _, _],
    /* CH HH */ [_, n, _, n, _, n, _, n, _, n, _, n, _, n, _, n],
    /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ],
  tags: ["reggae", "one-drop", "roots"],
};

const reggaeSteppers: GenrePresetPattern = {
  id: "reggae-steppers",
  name: "Steppers",
  genre: "reggae",
  tempo: 82,
  timeSignature: "4/4",
  swing: 5,
  steps: 16,
  pattern: [
    /* Kick  */ [a, _, _, _, a, _, _, _, a, _, _, _, a, _, _, _],
    /* Snare */ [_, _, _, _, _, _, _, _, a, _, _, _, _, _, _, _],
    /* CH HH */ [_, n, _, n, _, n, _, n, _, n, _, n, _, n, _, n],
    /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ],
  tags: ["reggae", "steppers", "dub"],
};

// ─── Full Catalog ─────────────────────────────────────────────────

export const GENRE_PRESETS: GenrePresetPattern[] = [
  // Rock
  rockBasic,
  rockDriving,
  // Hip-Hop
  hiphopBoomBap,
  hiphopTrap,
  // EDM
  edmFourFloor,
  edmDnB,
  // Jazz
  jazzSwing,
  jazzBossa,
  // Latin
  latinSalsa,
  latinReggaeton,
  // Reggae
  reggaeOneDrop,
  reggaeSteppers,
];
