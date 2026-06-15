import type { MidiNoteEvent } from "../../hooks/useMidiConvert";
import { MidiEffectsChain } from "./midiEffectsChain";
import type { MidiEffectEvent, MidiEffectsConfig } from "./types";

export function toMidiEffectEvents(notes: MidiNoteEvent[]): MidiEffectEvent[] {
  return notes.map((note) => ({
    pitch: note.pitch,
    velocity: note.velocity,
    start: note.start,
    duration: note.duration,
  }));
}

export function fromMidiEffectEvents(events: MidiEffectEvent[]): MidiNoteEvent[] {
  return events.map((event) => ({
    pitch: event.pitch,
    velocity: event.velocity,
    start: event.start,
    duration: event.duration,
  }));
}

export function applyMidiEffects(
  notes: MidiNoteEvent[],
  config: MidiEffectsConfig,
  bpm: number,
): MidiNoteEvent[] {
  if (notes.length === 0) return [];

  const chain = new MidiEffectsChain(config, bpm);
  const processed = chain.process(toMidiEffectEvents(notes));
  return fromMidiEffectEvents(processed);
}

export function hasActiveMidiEffects(config: MidiEffectsConfig): boolean {
  if (config.transposer.semitones !== 0 || config.transposer.octaves !== 0) {
    return true;
  }
  if (config.quantizer.enabled) return true;
  if (config.chordGenerator.enabled) return true;
  if (config.noteRepeater.enabled) return true;
  if (config.arpeggiator.enabled) return true;
  return false;
}
