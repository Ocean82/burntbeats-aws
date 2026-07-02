/**
 * Shared musical timeline helpers for MIDI view and editor surfaces.
 */

export const EDITOR_PIXELS_PER_SECOND = 80;
/** Match editor timeline scale so view → edit transition feels consistent. */
export const PREVIEW_PIXELS_PER_SECOND = EDITOR_PIXELS_PER_SECOND;
/** Piano-key gutter width shared across preview roll, editor canvas, and lane layout. */
export const TIMELINE_LEFT_MARGIN = 56;

export function secondsToBarBeat(
  seconds: number,
  bpm: number,
  beatsPerBar = 4,
): { bar: number; beat: number; sixteenth: number } {
  const safeBpm = Math.max(40, Math.min(300, bpm));
  const beats = (seconds * safeBpm) / 60;
  const bar = Math.floor(beats / beatsPerBar) + 1;
  const beatInBar = beats % beatsPerBar;
  const beat = Math.floor(beatInBar) + 1;
  const sixteenth = Math.floor((beatInBar % 1) * 4);
  return { bar, beat, sixteenth };
}

export function formatBarBeatLabel(
  seconds: number,
  bpm: number,
  beatsPerBar = 4,
): string {
  const { bar, beat, sixteenth } = secondsToBarBeat(seconds, bpm, beatsPerBar);
  return `${bar}:${beat}:${sixteenth}`;
}

export function formatSecondsLabel(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frac = Math.floor((seconds % 1) * 10);
  if (mins > 0) return `${mins}:${secs.toString().padStart(2, "0")}`;
  return frac > 0 ? `${secs}.${frac}s` : `${secs}s`;
}

export function beatDurationSeconds(bpm: number): number {
  const safeBpm = Math.max(40, Math.min(300, bpm));
  return 60 / safeBpm;
}

export function barDurationSeconds(bpm: number, beatsPerBar = 4): number {
  return beatDurationSeconds(bpm) * beatsPerBar;
}
