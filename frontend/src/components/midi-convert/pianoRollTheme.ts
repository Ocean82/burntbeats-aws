const BLACK_KEY_SEMITONES = new Set([1, 3, 6, 8, 10]);

export function isBlackKeyPitch(pitch: number): boolean {
  return BLACK_KEY_SEMITONES.has(((pitch % 12) + 12) % 12);
}

export { secondsPerBar } from "../../utils/midiEditorSnap";

export const EDITOR_ZOOM_MIN = 0.5;
export const EDITOR_ZOOM_MAX = 2;

export function clampEditorZoom(level: number): number {
  return Math.max(
    EDITOR_ZOOM_MIN,
    Math.min(EDITOR_ZOOM_MAX, Math.round(level * 100) / 100),
  );
}

export const PIANO_ROLL = {
  surface: "#1a1917",
  ruler: "#22211e",
  whiteKeyRow: "#2e2d28",
  blackKeyRow: "#22211e",
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

  velocityLaneSurface: "#1e1d1a",
  velocityBarFill(velocity: number): string {
    const t = 0.25 + (velocity / 127) * 0.5;
    return `rgba(205, 165, 60, ${t})`;
  },
  velocityBarSelectedFill: "rgba(245, 180, 60, 0.7)",
  velocityBarStroke: "rgba(160, 120, 30, 0.4)",
  velocityBarHover: "rgba(205, 165, 60, 0.5)",

  ccLaneSurface: "#1a1c1e",
  ccCurveStroke: "rgba(100, 180, 220, 0.8)",
  ccCurveFill: "rgba(100, 180, 220, 0.12)",
  ccPointFill: "rgba(100, 180, 220, 0.9)",
  ccPointStroke: "rgba(100, 180, 220, 1)",
  ccPointHover: "rgba(150, 210, 240, 1)",

  automationVolumeStroke: "rgba(80, 200, 120, 0.85)",
  automationVolumeFill: "rgba(80, 200, 120, 0.15)",
  automationVolumePoint: "rgba(80, 200, 120, 0.95)",
  automationPanStroke: "rgba(200, 180, 80, 0.85)",
  automationPanFill: "rgba(200, 180, 80, 0.15)",
  automationPanPoint: "rgba(200, 180, 80, 0.95)",
  automationFilterStroke: "rgba(140, 160, 240, 0.85)",
  automationFilterFill: "rgba(140, 160, 240, 0.15)",
  automationFilterPoint: "rgba(140, 160, 240, 0.95)",

  loopRegionFill: "rgba(240, 130, 50, 0.08)",
  loopRegionBorder: "rgba(240, 130, 50, 0.6)",
  loopRegionHandle: "rgba(240, 130, 50, 0.8)",

  trackStripBg: "#201e1a",
  trackStripBorder: "rgba(255,245,220,0.1)",
  trackActiveBg: "#2a2823",
} as const;

export const EDITOR_TOOLS: Record<string, { label: string; shortcut: string; hint: string }> = {
  select: { label: "Select", shortcut: "1", hint: "Move and resize notes" },
  draw: { label: "Draw", shortcut: "2", hint: "Click to add notes" },
  erase: { label: "Erase", shortcut: "3", hint: "Click notes to delete" },
  split: { label: "Split", shortcut: "S", hint: "Click a note to split it" },
} as const;

export const VELOCITY_LANE_HEIGHT = 48;
export const CC_LANE_HEIGHT = 48;
export const LANE_LABEL_WIDTH = 48;

/** Default pixels-per-second at zoom level 1 (used in MidiEditorCanvas and MidiNoteEditor). */
export const BASE_PIXELS_PER_SECOND = 80;
