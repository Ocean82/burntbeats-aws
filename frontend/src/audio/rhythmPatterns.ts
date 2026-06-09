/**
 * rhythmPatterns — Genre-aware pattern preset library.
 *
 * Each preset is a BeatPreset compatible with useBeatMaker.loadPreset().
 * Patterns use the DEFAULT_KIT row order:
 *   0: Kick, 1: Snare, 2: Closed HH, 3: Open HH,
 *   4: Clap, 5: Ride, 6: Tom Hi, 7: Tom Lo
 */
import type { BeatPreset } from "../hooks/useBeatMaker";
import type { PatternLength, VelocityPattern } from "./types";
import { VELOCITY_ACCENT, VELOCITY_GHOST, VELOCITY_NORMAL, VELOCITY_OFF } from "./types";

// ─── Shorthand aliases for readability ────────────────────────────
const _ = VELOCITY_OFF;
const g = VELOCITY_GHOST;   // 40
const n = VELOCITY_NORMAL;  // 100
const a = VELOCITY_ACCENT;  // 127

// ─── Genre Types ──────────────────────────────────────────────────

export type Genre = "rock" | "hiphop" | "edm" | "jazz" | "latin" | "reggae";

export interface PresetEntry {
  id: string;
  genre: Genre;
  preset: BeatPreset;
}

// ─── Helper: pad pattern to 8 rows ───────────────────────────────

function pad8(rows: number[][], steps: PatternLength): VelocityPattern {
  const result: VelocityPattern = Array.from({ length: 8 }, () =>
    Array(steps).fill(_),
  );
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    for (let j = 0; j < Math.min(rows[i].length, steps); j++) {
      result[i][j] = rows[i][j];
    }
  }
  return result;
}

// ─── ROCK PRESETS ─────────────────────────────────────────────────

const rockBasic: PresetEntry = {
  id: "rock-basic",
  genre: "rock",
  preset: {
    name: "Basic Rock",
    bpm: 120,
    swing: 0,
    steps: 16,
    pattern: pad8(
      [
        /* Kick  */ [a, _, _, _, _, _, _, _, a, _, _, _, _, _, _, _],
        /* Snare */ [_, _, _, _, a, _, _, _, _, _, _, _, a, _, _, _],
        /* CH HH */ [a, _, n, _, a, _, n, _, a, _, n, _, a, _, n, _],
        /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
      ],
      16,
    ),
  },
};

const rockDriving: PresetEntry = {
  id: "rock-driving",
  genre: "rock",
  preset: {
    name: "Driving Rock",
    bpm: 130,
    swing: 0,
    steps: 16,
    pattern: pad8(
      [
        /* Kick  */ [a, _, _, _, a, _, _, _, a, _, _, _, a, _, _, _],
        /* Snare */ [_, _, _, _, a, _, _, _, _, _, _, _, a, _, _, _],
        /* CH HH */ [n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n],
        /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
      ],
      16,
    ),
  },
};

const rockHalftime: PresetEntry = {
  id: "rock-halftime",
  genre: "rock",
  preset: {
    name: "Half-Time Rock",
    bpm: 140,
    swing: 0,
    steps: 16,
    pattern: pad8(
      [
        /* Kick  */ [a, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Snare */ [_, _, _, _, _, _, _, _, a, _, _, _, _, _, _, _],
        /* CH HH */ [n, _, n, _, n, _, n, _, n, _, n, _, n, _, n, _],
        /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, a],
        /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
      ],
      16,
    ),
  },
};

// ─── HIP-HOP PRESETS ──────────────────────────────────────────────

const hiphopBoomBap: PresetEntry = {
  id: "hiphop-boom-bap",
  genre: "hiphop",
  preset: {
    name: "Boom Bap",
    bpm: 90,
    swing: 30,
    steps: 16,
    pattern: pad8(
      [
        /* Kick  */ [a, _, _, _, _, _, _, _, n, _, _, _, _, _, _, _],
        /* Snare */ [_, _, _, _, a, _, _, _, _, _, _, _, a, _, _, _],
        /* CH HH */ [_, _, n, _, _, _, g, _, _, _, n, _, _, _, g, _],
        /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
      ],
      16,
    ),
  },
};

const hiphopTrap: PresetEntry = {
  id: "hiphop-trap",
  genre: "hiphop",
  preset: {
    name: "Trap",
    bpm: 140,
    swing: 0,
    steps: 32,
    pattern: pad8(
      [
        /* Kick  */ [a,_,_,_,_,_,_,_,_,_,_,_,n,_,_,_, a,_,_,_,_,_,_,_,_,_,n,_,_,_,_,_],
        /* Snare */ [_,_,_,_,_,_,_,_,a,_,_,_,_,_,_,_, _,_,_,_,_,_,_,_,a,_,_,_,_,_,_,_],
        /* CH HH */ [n,_,n,_,n,_,n,_,n,_,n,n,n,_,n,_, n,_,n,_,n,_,n,n,n,_,n,_,n,n,n,n],
        /* OH HH */ [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,n, _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
        /* Clap  */ [_,_,_,_,_,_,_,_,a,_,_,_,_,_,_,_, _,_,_,_,_,_,_,_,a,_,_,_,_,_,_,_],
        /* Ride  */ [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_, _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
        /* TomHi */ [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_, _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
        /* TomLo */ [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_, _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      ],
      32,
    ),
  },
};

const hiphopLofi: PresetEntry = {
  id: "hiphop-lofi",
  genre: "hiphop",
  preset: {
    name: "Lo-Fi",
    bpm: 78,
    swing: 45,
    steps: 16,
    pattern: pad8(
      [
        /* Kick  */ [n, _, _, _, _, _, _, _, _, _, n, _, _, _, _, _],
        /* Snare */ [_, _, _, _, n, _, _, g, _, _, _, _, n, _, _, _],
        /* CH HH */ [g, _, n, _, g, _, n, _, g, _, n, _, g, _, n, _],
        /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, n],
        /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
      ],
      16,
    ),
  },
};

// ─── EDM PRESETS ──────────────────────────────────────────────────

const edmFourFloor: PresetEntry = {
  id: "edm-four-floor",
  genre: "edm",
  preset: {
    name: "Four on the Floor",
    bpm: 128,
    swing: 0,
    steps: 16,
    pattern: pad8(
      [
        /* Kick  */ [a, _, _, _, a, _, _, _, a, _, _, _, a, _, _, _],
        /* Snare */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* CH HH */ [_, _, n, _, _, _, n, _, _, _, n, _, _, _, n, _],
        /* OH HH */ [_, _, _, _, _, _, _, n, _, _, _, _, _, _, _, n],
        /* Clap  */ [_, _, _, _, a, _, _, _, _, _, _, _, a, _, _, _],
        /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
      ],
      16,
    ),
  },
};

const edmBreakbeat: PresetEntry = {
  id: "edm-breakbeat",
  genre: "edm",
  preset: {
    name: "Breakbeat",
    bpm: 135,
    swing: 0,
    steps: 16,
    pattern: pad8(
      [
        /* Kick  */ [a, _, _, _, _, _, n, _, _, _, _, _, _, _, n, _],
        /* Snare */ [_, _, _, _, a, _, _, _, _, _, n, _, _, _, _, _],
        /* CH HH */ [n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n],
        /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, a, _, _, _],
        /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
      ],
      16,
    ),
  },
};

const edmDnB: PresetEntry = {
  id: "edm-dnb",
  genre: "edm",
  preset: {
    name: "Drum & Bass",
    bpm: 174,
    swing: 0,
    steps: 16,
    pattern: pad8(
      [
        /* Kick  */ [a, _, _, _, _, _, _, _, _, _, n, _, _, _, _, _],
        /* Snare */ [_, _, _, _, a, _, _, _, _, _, _, _, _, _, a, _],
        /* CH HH */ [n, _, n, _, n, _, n, _, n, _, n, _, n, _, n, _],
        /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
      ],
      16,
    ),
  },
};

// ─── JAZZ PRESETS ─────────────────────────────────────────────────

const jazzSwing: PresetEntry = {
  id: "jazz-swing",
  genre: "jazz",
  preset: {
    name: "Jazz Swing",
    bpm: 140,
    swing: 55,
    steps: 16,
    pattern: pad8(
      [
        /* Kick  */ [n, _, _, _, _, _, _, _, _, _, g, _, _, _, _, _],
        /* Snare */ [_, _, _, _, n, _, _, g, _, _, _, _, n, _, _, g],
        /* CH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Ride  */ [a, _, n, a, _, n, a, _, n, a, _, n, a, _, n, _],
        /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
      ],
      16,
    ),
  },
};

const jazzBossa: PresetEntry = {
  id: "jazz-bossa",
  genre: "jazz",
  preset: {
    name: "Bossa Nova",
    bpm: 130,
    swing: 20,
    steps: 16,
    pattern: pad8(
      [
        /* Kick  */ [n, _, _, _, _, _, n, _, _, _, _, _, _, _, _, _],
        /* Snare */ [_, _, _, _, _, _, _, _, _, _, n, _, _, _, _, _],
        /* CH HH */ [n, _, n, _, n, _, n, _, n, _, n, _, n, _, n, _],
        /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomHi */ [_, _, _, g, _, _, _, _, _, _, _, g, _, _, _, _],
        /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
      ],
      16,
    ),
  },
};

const jazzBrush: PresetEntry = {
  id: "jazz-brush",
  genre: "jazz",
  preset: {
    name: "Brush Shuffle",
    bpm: 110,
    swing: 60,
    steps: 16,
    pattern: pad8(
      [
        /* Kick  */ [n, _, _, _, _, _, _, _, n, _, _, _, _, _, _, _],
        /* Snare */ [_, _, g, _, n, _, g, _, _, _, g, _, n, _, g, _],
        /* CH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Ride  */ [n, _, g, n, _, g, n, _, n, _, g, n, _, g, n, _],
        /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
      ],
      16,
    ),
  },
};

// ─── LATIN PRESETS ────────────────────────────────────────────────

const latinSalsa: PresetEntry = {
  id: "latin-salsa",
  genre: "latin",
  preset: {
    name: "Salsa",
    bpm: 180,
    swing: 0,
    steps: 32,
    pattern: pad8(
      [
        /* Kick  */ [a,_,_,_,_,_,n,_,_,n,_,_,_,_,_,_, a,_,_,_,_,_,n,_,_,_,_,_,n,_,_,_],
        /* Snare */ [_,_,_,_,a,_,_,_,_,_,_,_,a,_,_,_, _,_,_,_,a,_,_,_,_,_,_,_,a,_,_,_],
        /* CH HH */ [n,_,n,_,n,_,n,_,n,_,n,_,n,_,n,_, n,_,n,_,n,_,n,_,n,_,n,_,n,_,n,_],
        /* OH HH */ [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_, _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
        /* Clap  */ [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_, _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
        /* Ride  */ [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_, _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
        /* TomHi */ [_,_,_,n,_,_,_,_,_,_,_,n,_,_,_,_, _,_,n,_,_,_,_,_,n,_,_,_,_,_,_,_],
        /* TomLo */ [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_, _,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
      ],
      32,
    ),
  },
};

const latinReggaeton: PresetEntry = {
  id: "latin-reggaeton",
  genre: "latin",
  preset: {
    name: "Reggaeton",
    bpm: 95,
    swing: 0,
    steps: 16,
    pattern: pad8(
      [
        /* Kick  */ [a, _, _, n, _, _, _, a, _, _, n, _, _, _, _, _],
        /* Snare */ [_, _, _, _, a, _, _, _, _, _, _, _, a, _, _, _],
        /* CH HH */ [n, _, n, _, n, _, n, _, n, _, n, _, n, _, n, _],
        /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
      ],
      16,
    ),
  },
};

const latinSamba: PresetEntry = {
  id: "latin-samba",
  genre: "latin",
  preset: {
    name: "Samba",
    bpm: 100,
    swing: 15,
    steps: 16,
    pattern: pad8(
      [
        /* Kick  */ [a, _, _, _, _, _, n, _, _, _, _, _, n, _, _, _],
        /* Snare */ [_, _, n, _, _, _, _, _, n, _, _, _, _, _, n, _],
        /* CH HH */ [n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n],
        /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomHi */ [_, _, _, g, _, _, _, g, _, _, _, g, _, _, _, g],
        /* TomLo */ [_, _, _, _, _, g, _, _, _, _, _, _, _, g, _, _],
      ],
      16,
    ),
  },
};

// ─── REGGAE PRESETS ───────────────────────────────────────────────

const reggaeOneDrop: PresetEntry = {
  id: "reggae-one-drop",
  genre: "reggae",
  preset: {
    name: "One Drop",
    bpm: 75,
    swing: 10,
    steps: 16,
    pattern: pad8(
      [
        /* Kick  */ [_, _, _, _, _, _, _, _, a, _, _, _, _, _, _, _],
        /* Snare */ [_, _, _, _, _, _, _, _, a, _, _, _, _, _, _, _],
        /* CH HH */ [_, n, _, n, _, n, _, n, _, n, _, n, _, n, _, n],
        /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
      ],
      16,
    ),
  },
};

const reggaeRocker: PresetEntry = {
  id: "reggae-rocker",
  genre: "reggae",
  preset: {
    name: "Rockers",
    bpm: 80,
    swing: 10,
    steps: 16,
    pattern: pad8(
      [
        /* Kick  */ [a, _, _, _, _, _, _, _, a, _, _, _, _, _, _, _],
        /* Snare */ [_, _, _, _, a, _, _, _, _, _, _, _, a, _, _, _],
        /* CH HH */ [_, n, _, n, _, n, _, n, _, n, _, n, _, n, _, n],
        /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
      ],
      16,
    ),
  },
};

const reggaeSteppers: PresetEntry = {
  id: "reggae-steppers",
  genre: "reggae",
  preset: {
    name: "Steppers",
    bpm: 82,
    swing: 5,
    steps: 16,
    pattern: pad8(
      [
        /* Kick  */ [a, _, _, _, a, _, _, _, a, _, _, _, a, _, _, _],
        /* Snare */ [_, _, _, _, _, _, _, _, a, _, _, _, _, _, _, _],
        /* CH HH */ [_, n, _, n, _, n, _, n, _, n, _, n, _, n, _, n],
        /* OH HH */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Clap  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* Ride  */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomHi */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        /* TomLo */ [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
      ],
      16,
    ),
  },
};

// ─── Full Catalog ─────────────────────────────────────────────────

export const RHYTHM_PRESETS: PresetEntry[] = [
  // Rock
  rockBasic,
  rockDriving,
  rockHalftime,
  // Hip-Hop
  hiphopBoomBap,
  hiphopTrap,
  hiphopLofi,
  // EDM
  edmFourFloor,
  edmBreakbeat,
  edmDnB,
  // Jazz
  jazzSwing,
  jazzBossa,
  jazzBrush,
  // Latin
  latinSalsa,
  latinReggaeton,
  latinSamba,
  // Reggae
  reggaeOneDrop,
  reggaeRocker,
  reggaeSteppers,
];

/** All available genres in display order. */
export const GENRES: { value: Genre; label: string }[] = [
  { value: "rock", label: "Rock" },
  { value: "hiphop", label: "Hip-Hop" },
  { value: "edm", label: "EDM" },
  { value: "jazz", label: "Jazz" },
  { value: "latin", label: "Latin" },
  { value: "reggae", label: "Reggae" },
];

/** Get presets filtered by genre. */
export function getPresetsByGenre(genre: Genre): PresetEntry[] {
  return RHYTHM_PRESETS.filter((p) => p.genre === genre);
}
