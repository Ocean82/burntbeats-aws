/**
 * overlayVariations — Algorithmic variation generators for overlay patterns.
 *
 * Each function takes a VelocityPattern and returns a new modified copy
 * without mutating the input. These are designed specifically for the
 * overlay transport layer and follow the spec's exact algorithms.
 *
 * Row indices follow DEFAULT_KIT order:
 *   0=kick, 1=snare, 2=closedHat, 3=openHat, 4=clap, 5=ride, 6=tomHi, 7=tomLo
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
 * Deep-clone a VelocityPattern to avoid mutating the input.
 */
function clonePattern(pattern: VelocityPattern): VelocityPattern {
  return pattern.map((row) => [...row]);
}

/**
 * Apply fill variation — adds snare/tom hits in the final 25% of the pattern
 * with linearly increasing velocity from VELOCITY_GHOST to VELOCITY_ACCENT,
 * and silences cymbals (closed hat, open hat, ride) in the fill region.
 * Steps before the fill region remain unchanged.
 */
export function applyFill(pattern: VelocityPattern): VelocityPattern {
  const result = clonePattern(pattern);
  const rows = result.length;
  if (rows === 0) return result;

  const steps = result[0].length;
  if (steps === 0) return result;

  const fillStart = Math.floor(steps * 0.75);
  const fillLength = steps - fillStart;

  for (let i = fillStart; i < steps; i++) {
    const position = i - fillStart;
    // Linear interpolation from VELOCITY_GHOST to VELOCITY_ACCENT
    const vel = Math.round(
      VELOCITY_GHOST + ((VELOCITY_ACCENT - VELOCITY_GHOST) * position) / (fillLength - 1 || 1),
    );

    // Snare (row 1): set velocity
    if (SNARE < rows) {
      result[SNARE][i] = vel;
    }

    // TomHi (row 6): set velocity
    if (TOM_HI < rows) {
      result[TOM_HI][i] = vel;
    }

    // TomLo (row 7): set velocity
    if (TOM_LO < rows) {
      result[TOM_LO][i] = vel;
    }

    // Silence cymbals in fill region
    if (CLOSED_HAT < rows) {
      result[CLOSED_HAT][i] = VELOCITY_OFF;
    }
    if (OPEN_HAT < rows) {
      result[OPEN_HAT][i] = VELOCITY_OFF;
    }
    if (RIDE < rows) {
      result[RIDE][i] = VELOCITY_OFF;
    }
  }

  return result;
}

/**
 * Apply breakdown variation — strips the pattern to minimal elements.
 * - Cymbals (closed hat, open hat, ride): all set to VELOCITY_OFF
 * - Kick: retain only on steps divisible by 8, else VELOCITY_OFF
 * - Snare: retain only where step % 8 === 4, else VELOCITY_OFF
 * - Clap, toms: all set to VELOCITY_OFF
 */
export function applyBreakdown(pattern: VelocityPattern): VelocityPattern {
  const result = clonePattern(pattern);
  const rows = result.length;
  if (rows === 0) return result;

  const steps = result[0].length;

  for (let i = 0; i < steps; i++) {
    // Mute all cymbals
    if (CLOSED_HAT < rows) {
      result[CLOSED_HAT][i] = VELOCITY_OFF;
    }
    if (OPEN_HAT < rows) {
      result[OPEN_HAT][i] = VELOCITY_OFF;
    }
    if (RIDE < rows) {
      result[RIDE][i] = VELOCITY_OFF;
    }

    // Kick: retain only on steps divisible by 8
    if (KICK < rows && i % 8 !== 0) {
      result[KICK][i] = VELOCITY_OFF;
    }

    // Snare: retain only where step % 8 === 4
    if (SNARE < rows && i % 8 !== 4) {
      result[SNARE][i] = VELOCITY_OFF;
    }

    // Clap and toms: all off
    if (CLAP < rows) {
      result[CLAP][i] = VELOCITY_OFF;
    }
    if (TOM_HI < rows) {
      result[TOM_HI][i] = VELOCITY_OFF;
    }
    if (TOM_LO < rows) {
      result[TOM_LO][i] = VELOCITY_OFF;
    }
  }

  return result;
}

/**
 * Apply buildup variation — increases density and energy.
 * - Closed hi-hat: every step with velocity linearly from VELOCITY_GHOST to VELOCITY_NORMAL
 * - Snare: ghost notes every 4 steps in first half, every 2 steps in second half,
 *   with velocity rising from VELOCITY_GHOST to VELOCITY_NORMAL
 */
export function applyBuildup(pattern: VelocityPattern): VelocityPattern {
  const result = clonePattern(pattern);
  const rows = result.length;
  if (rows === 0) return result;

  const steps = result[0].length;
  if (steps === 0) return result;

  // Closed hi-hat: every step with velocity 40→100
  if (CLOSED_HAT < rows) {
    for (let i = 0; i < steps; i++) {
      const vel = Math.round(
        VELOCITY_GHOST + ((VELOCITY_NORMAL - VELOCITY_GHOST) * i) / (steps - 1 || 1),
      );
      result[CLOSED_HAT][i] = vel;
    }
  }

  // Snare: ghost notes at increasing density with velocity 40→100
  if (SNARE < rows) {
    const half = Math.floor(steps / 2);

    for (let i = 0; i < steps; i++) {
      const vel = Math.round(
        VELOCITY_GHOST + ((VELOCITY_NORMAL - VELOCITY_GHOST) * i) / (steps - 1 || 1),
      );

      if (i < half) {
        // First half: every 4 steps
        if (i % 4 === 0) {
          result[SNARE][i] = vel;
        }
      } else {
        // Second half: every 2 steps
        if (i % 2 === 0) {
          result[SNARE][i] = vel;
        }
      }
    }
  }

  return result;
}

export type VariationType = "fill" | "breakdown" | "buildup";

/** Apply a named variation to a pattern. */
export function applyOverlayVariation(
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
