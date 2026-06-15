/**
 * Heuristics for drum/percussion MIDI content where diatonic scale lock is inappropriate.
 */
export function isDrumMidiContext(
  sourceLabel?: string | null,
  fileAnalysis?: { has_drums?: boolean } | null,
): boolean {
  if (fileAnalysis?.has_drums) return true;
  const label = (sourceLabel ?? "").toLowerCase();
  return /\b(drums?|percussion|perc|kick|snare|hihat|hi-hat)\b/.test(label);
}
