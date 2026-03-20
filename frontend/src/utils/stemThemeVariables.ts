import type { StemDefinition } from "../types";

/** CSS custom properties for stem-tinted surfaces (Phase E: one assignment site per node). */
export interface StemThemeCssVariables {
  readonly "--stem-color": string;
  readonly "--stem-color-soft": string;
}

export function stemThemeVariables(stem: Pick<StemDefinition, "glow" | "glowSoft">): StemThemeCssVariables {
  return {
    "--stem-color": stem.glow,
    "--stem-color-soft": stem.glowSoft,
  };
}

/** Visible-region trim edges for lane overlay (0–100 within zoomed viewport). */
export interface TrimVisiblePercents {
  readonly "--trim-start-vis": number;
  readonly "--trim-end-vis": number;
}

export function trimVisiblePercentsStyle(startVisible: number, endVisible: number): TrimVisiblePercents {
  return { "--trim-start-vis": startVisible, "--trim-end-vis": endVisible };
}
