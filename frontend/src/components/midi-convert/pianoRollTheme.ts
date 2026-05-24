/**
 * Shared piano roll visuals — warm studio aesthetic.
 * Dark grid with ember-tinted rows, warm gold notes, bright amber selection.
 * Designed to feel like hardware gear, not a generic DAW clone.
 */

const BLACK_KEY_SEMITONES = new Set([1, 3, 6, 8, 10]);

export function isBlackKeyPitch(pitch: number): boolean {
  return BLACK_KEY_SEMITONES.has(((pitch % 12) + 12) % 12);
}

/** Seconds per bar (4/4). */
export function secondsPerBar(bpm: number): number {
  return (60 / bpm) * 4;
}

export const PIANO_ROLL = {
  surface: "#1a1917",
  ruler: "#22211e",
  whiteKeyRow: "#2e2d28",
  blackKeyRow: "#22211e",
  /** Mini keyboard in the left gutter */
  gutterWhiteKey: "#d4d0c8",
  gutterBlackKey: "#3f3d36",
  gutterBlackKeyWidthRatio: 0.62,
  gridBeat: "rgba(255,245,220,0.07)",
  gridBar: "rgba(255,245,220,0.22)",
  rowLine: "rgba(255,245,220,0.05)",
  rowLineC: "rgba(255,245,220,0.14)",
  rulerText: "rgba(255,245,220,0.5)",
  labelOnWhite: "rgba(30,25,15,0.6)",
  labelOnBlack: "rgba(255,245,220,0.45)",
  /** Warm gold notes — feels like brass/analog hardware */
  noteFill(velocity: number): string {
    const t = 0.5 + (velocity / 127) * 0.4;
    return `rgba(205, 165, 60, ${t})`;
  },
  noteStroke: "rgba(160, 120, 30, 0.75)",
  noteSelectedFill(velocity: number): string {
    const t = 0.6 + (velocity / 127) * 0.35;
    return `rgba(245, 180, 60, ${t})`;
  },
  noteSelectedStroke: "rgba(245, 180, 60, 0.95)",
  notePreviewFill: "rgba(245, 180, 60, 0.4)",
  notePreviewStroke: "rgba(245, 180, 60, 0.9)",
  lassoFill: "rgba(205, 165, 60, 0.12)",
  lassoStroke: "rgba(205, 165, 60, 0.65)",
  playhead: "rgba(240, 130, 50, 0.95)",
} as const;

export const EDITOR_TOOLS = {
  select: { label: "Select", shortcut: "1", hint: "Move and resize notes" },
  draw: { label: "Draw", shortcut: "2", hint: "Click to add notes" },
  erase: { label: "Erase", shortcut: "3", hint: "Click notes to delete" },
} as const;
