/**
 * patternVariations — Algorithmic variation generators for beat patterns.
 *
 * Each function takes a VelocityPattern and returns a new modified copy.
 * They reference the DEFAULT_KIT row indices for instrument awareness.
 */
import type { VelocityPattern } from "./types";
import { VELOCITY_ACCENT, VELOCITY_GHOST, VELOCITY_NORMAL, VELOCITY_OFF } from "./types";

// Row indices in DEFAULT_KIT
const KICK = 0;
const SNARE = 1;
const CLOSED_HAT = 2;
const OPEN_HAT = 3;
const CLAP = 4;
const RIDE = 5;
const TOM_HI = 6;
const TOM_LO = 7;

/**
 * Generate a fill — adds snare/tom activity in the last quarter of the pattern.
 * Creates a drum fill effect leading into the next bar.
 */
export function applyFill(pattern: VelocityPattern): VelocityPattern {
  const result = pattern.map((row) => [...row]);
  const steps = result[0].length;
  const fillStart = Math.floor(steps * 0.75); // Last 25% of pattern

  for (let i = fillStart; i < steps; i++) {
    const position = i - fillStart;
    const fillLength = steps - fillStart;

    // Snare: add 16th notes with building velocity
    const snareVel = Math.round(
      VELOCITY_GHOST + ((VELOCITY_ACCENT - VELOCITY_GHOST) * position) / fillLength,
    );
    result[SNARE][i] = snareVel;

    // Toms: alternate tom hi/lo on off-beats
    if (position % 2 === 1) {
      const tomRow = position % 4 < 2 ? TOM_HI : TOM_LO;
      result[tomRow][i] = VELOCITY_NORMAL;
    }

    // Silence the hi-hat during the fill for clarity
    result[CLOSED_HAT][i] = VELOCITY_OFF;
    result[OPEN_HAT][i] = VELOCITY_OFF;
    result[RIDE][i] = VELOCITY_OFF;
  }

  // Add a crash/accent on the very last step
  if (steps > 0) {
    result[OPEN_HAT][steps - 1] = VELOCITY_ACCENT;
  }

  return result;
}

/**
 * Generate a breakdown — strips the pattern to its minimal elements.
 * Removes cymbals, reduces kick to downbeats only, removes snare ghost notes.
 */
export function applyBreakdown(pattern: VelocityPattern): VelocityPattern {
  const result = pattern.map((row) => [...row]);
  const steps = result[0].length;

  // Mute all cymbals
  for (let i = 0; i < steps; i++) {
    result[CLOSED_HAT][i] = VELOCITY_OFF;
    result[OPEN_HAT][i] = VELOCITY_OFF;
    result[RIDE][i] = VELOCITY_OFF;
  }

  // Kick: keep only strong beats (every 8 steps = half-notes)
  for (let i = 0; i < steps; i++) {
    if (i % 8 !== 0) {
      result[KICK][i] = VELOCITY_OFF;
    }
  }

  // Snare: keep only backbeats (steps 4, 12, 20, 28...)
  for (let i = 0; i < steps; i++) {
    if (i % 8 !== 4) {
      result[SNARE][i] = VELOCITY_OFF;
    }
  }

  // Remove clap, toms
  for (let i = 0; i < steps; i++) {
    result[CLAP][i] = VELOCITY_OFF;
    result[TOM_HI][i] = VELOCITY_OFF;
    result[TOM_LO][i] = VELOCITY_OFF;
  }

  return result;
}

/**
 * Generate a buildup — increases density and energy.
 * Doubles hi-hat speed, adds snare rolls building in velocity,
 * keeps kick steady for the foundation.
 */
export function applyBuildup(pattern: VelocityPattern): VelocityPattern {
  const result = pattern.map((row) => [...row]);
  const steps = result[0].length;

  // Hi-hat: fill every step with building velocity
  for (let i = 0; i < steps; i++) {
    const progress = i / steps;
    const vel = Math.round(VELOCITY_GHOST + (VELOCITY_NORMAL - VELOCITY_GHOST) * progress);
    result[CLOSED_HAT][i] = vel;
  }

  // Remove open hat (closed hat dominates)
  for (let i = 0; i < steps; i++) {
    result[OPEN_HAT][i] = VELOCITY_OFF;
  }

  // Snare: add ghost notes that intensify over time
  for (let i = 0; i < steps; i++) {
    const progress = i / steps;
    // In the first half, add ghosts every 4 steps
    // In the second half, add ghosts every 2 steps
    if (progress < 0.5) {
      if (i % 4 === 2 && result[SNARE][i] === VELOCITY_OFF) {
        result[SNARE][i] = VELOCITY_GHOST;
      }
    } else {
      if (i % 2 === 1 && result[SNARE][i] === VELOCITY_OFF) {
        const vel = Math.round(VELOCITY_GHOST + (VELOCITY_NORMAL - VELOCITY_GHOST) * (progress - 0.5) * 2);
        result[SNARE][i] = vel;
      }
    }
  }

  // Kick: ensure steady four-on-the-floor for energy
  for (let i = 0; i < steps; i++) {
    if (i % 4 === 0) {
      result[KICK][i] = Math.max(result[KICK][i], VELOCITY_NORMAL);
    }
  }

  return result;
}

export type VariationType = "fill" | "breakdown" | "buildup";

/** Apply a named variation to a pattern. */
export function applyVariation(
  pattern: VelocityPattern,
  type: VariationType,
): VelocityPattern {
  switch (type) {
    case "fill":
      return applyFill(pattern);
    case "breakdown":
      return applyBreakdown(pattern);
    case "buildup":
      return applyBuildup(pattern);
  }
}
