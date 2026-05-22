/**
 * Shared piano roll visuals aligned with common DAW conventions
 * (Ableton, FL Studio, Logic): dark grid, striped keys, green notes, gold selection.
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
  surface: "#1a1a1c",
  ruler: "#222226",
  whiteKeyRow: "#2e2e32",
  blackKeyRow: "#222226",
  /** Mini keyboard in the left gutter */
  gutterWhiteKey: "#d4d4d8",
  gutterBlackKey: "#3f3f46",
  gutterBlackKeyWidthRatio: 0.62,
  gridBeat: "rgba(255,255,255,0.07)",
  gridBar: "rgba(255,255,255,0.24)",
  rowLine: "rgba(255,255,255,0.05)",
  rowLineC: "rgba(255,255,255,0.14)",
  rulerText: "rgba(255,255,255,0.5)",
  labelOnWhite: "rgba(0,0,0,0.55)",
  labelOnBlack: "rgba(255,255,255,0.45)",
  /** Default MIDI clip color (teal/green family — common in DAWs) */
  noteFill(velocity: number): string {
    const t = 0.45 + (velocity / 127) * 0.45;
    return `rgba(72, 187, 140, ${t})`;
  },
  noteStroke: "rgba(45, 140, 100, 0.75)",
  noteSelectedFill(velocity: number): string {
    const t = 0.55 + (velocity / 127) * 0.4;
    return `rgba(251, 191, 36, ${t})`;
  },
  noteSelectedStroke: "rgba(251, 191, 36, 0.95)",
  notePreviewFill: "rgba(251, 191, 36, 0.4)",
  notePreviewStroke: "rgba(251, 191, 36, 0.9)",
  lassoFill: "rgba(96, 165, 250, 0.12)",
  lassoStroke: "rgba(96, 165, 250, 0.65)",
  playhead: "rgba(248, 113, 113, 0.95)",
} as const;

export const EDITOR_TOOLS = {
  select: { label: "Select", shortcut: "1", hint: "Move and resize notes" },
  draw: { label: "Draw", shortcut: "2", hint: "Click to add notes" },
  erase: { label: "Erase", shortcut: "3", hint: "Click notes to delete" },
} as const;
