/**
 * patternVariations — Algorithmic variation generators for beat patterns.
 *
 * Used by both the grid sequencer and overlay transport. Each function takes
 * a VelocityPattern and returns a new modified copy without mutating input.
 *
 * Row indices follow DEFAULT_KIT order:
 *   0=kick, 1=snare, 2=closedHat, 3=openHat, 4=clap, 5=ride, 6=tomHi, 7=tomLo
 */
import type { VelocityPattern } from "./types";
import { VELOCITY_ACCENT, VELOCITY_GHOST, VELOCITY_NORMAL, VELOCITY_OFF } from "./types";

const KICK = 0;
const SNARE = 1;
const CLOSED_HAT = 2;
const OPEN_HAT = 3;
const CLAP = 4;
const RIDE = 5;
const TOM_HI = 6;
const TOM_LO = 7;

function clonePattern(pattern: VelocityPattern): VelocityPattern {
  return pattern.map((row) => [...row]);
}

/**
 * Apply fill variation — snare/tom hits in the final 25% with building velocity;
 * cymbals silenced in the fill region.
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
    const vel = Math.round(
      VELOCITY_GHOST + ((VELOCITY_ACCENT - VELOCITY_GHOST) * position) / (fillLength - 1 || 1),
    );

    if (SNARE < rows) {
      result[SNARE][i] = vel;
    }
    if (TOM_HI < rows) {
      result[TOM_HI][i] = vel;
    }
    if (TOM_LO < rows) {
      result[TOM_LO][i] = vel;
    }
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
 * Apply breakdown — strips the pattern to minimal kick/snare backbone.
 */
export function applyBreakdown(pattern: VelocityPattern): VelocityPattern {
  const result = clonePattern(pattern);
  const rows = result.length;
  if (rows === 0) return result;

  const steps = result[0].length;

  for (let i = 0; i < steps; i++) {
    if (CLOSED_HAT < rows) {
      result[CLOSED_HAT][i] = VELOCITY_OFF;
    }
    if (OPEN_HAT < rows) {
      result[OPEN_HAT][i] = VELOCITY_OFF;
    }
    if (RIDE < rows) {
      result[RIDE][i] = VELOCITY_OFF;
    }
    if (KICK < rows && i % 8 !== 0) {
      result[KICK][i] = VELOCITY_OFF;
    }
    if (SNARE < rows && i % 8 !== 4) {
      result[SNARE][i] = VELOCITY_OFF;
    }
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
 * Apply buildup — increases hi-hat density and snare ghost intensity.
 */
export function applyBuildup(pattern: VelocityPattern): VelocityPattern {
  const result = clonePattern(pattern);
  const rows = result.length;
  if (rows === 0) return result;

  const steps = result[0].length;
  if (steps === 0) return result;

  if (CLOSED_HAT < rows) {
    for (let i = 0; i < steps; i++) {
      const vel = Math.round(
        VELOCITY_GHOST + ((VELOCITY_NORMAL - VELOCITY_GHOST) * i) / (steps - 1 || 1),
      );
      result[CLOSED_HAT][i] = vel;
    }
  }

  if (SNARE < rows) {
    const half = Math.floor(steps / 2);

    for (let i = 0; i < steps; i++) {
      const vel = Math.round(
        VELOCITY_GHOST + ((VELOCITY_NORMAL - VELOCITY_GHOST) * i) / (steps - 1 || 1),
      );

      if (i < half) {
        if (i % 4 === 0) {
          result[SNARE][i] = vel;
        }
      } else if (i % 2 === 0) {
        result[SNARE][i] = vel;
      }
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

/** @deprecated Use applyVariation — kept for overlay transport migration. */
export const applyOverlayVariation = applyVariation;
