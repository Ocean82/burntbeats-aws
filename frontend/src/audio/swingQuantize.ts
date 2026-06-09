/**
 * swingQuantize — Applies swing timing offset to step positions.
 *
 * Swing works by delaying every other 16th note (the "upbeats")
 * by a percentage of the step duration.
 * 0% = straight, 50% = triplet feel, 67% = hard shuffle.
 */

/**
 * Calculate the playback time offset in seconds for a given step
 * considering swing amount.
 *
 * @param step - Step index (0-based)
 * @param stepDuration - Duration of one step in seconds (60 / bpm / 4 for 16th notes)
 * @param swingPercent - Swing amount 0-100 (0 = straight, 67 = classic shuffle)
 * @returns Time in seconds for when this step should fire
 */
export function getSwungStepTime(
  step: number,
  stepDuration: number,
  swingPercent: number,
): number {
  const straightTime = step * stepDuration;

  if (swingPercent === 0) return straightTime;

  // Swing affects every other step (the off-beat 16ths)
  const isOffBeat = step % 2 === 1;
  if (!isOffBeat) return straightTime;

  // Maximum swing delay is one step duration (full offset = next beat)
  // Scale: 0% = no delay, 100% = full step delay (would sound like skipping)
  // Musically: 50% ≈ triplet, 67% = classic shuffle
  const swingOffset = (swingPercent / 100) * stepDuration * 0.67;
  return straightTime + swingOffset;
}

/**
 * Apply swing to a note start time for MIDI export.
 * Works the same as playback swing but returns absolute seconds.
 */
export function applySwingToNoteStart(
  stepIndex: number,
  bpm: number,
  swingPercent: number,
): number {
  const stepDuration = 60 / bpm / 4; // 16th note duration
  return getSwungStepTime(stepIndex, stepDuration, swingPercent);
}
