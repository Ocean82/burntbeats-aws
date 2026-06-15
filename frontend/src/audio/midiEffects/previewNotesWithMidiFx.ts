import type { MidiNoteEvent } from "../../hooks/useMidiConvert";
import { applyMidiEffects } from "./applyMidiEffects";
import type { MidiEffectsConfig } from "./types";
import { hasActiveMidiEffects } from "./applyMidiEffects";

export function previewNotesWithMidiFx(
  notes: MidiNoteEvent[],
  config: MidiEffectsConfig,
  bpm: number,
): MidiNoteEvent[] {
  if (!notes.length || !hasActiveMidiEffects(config)) return notes;
  return applyMidiEffects(notes, config, bpm);
}
