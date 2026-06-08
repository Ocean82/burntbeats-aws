import type { MidiConvertResult, MidiNoteEvent } from "../../hooks/useMidiConvert";

const fixtureNotes: MidiNoteEvent[] = [
  { pitch: 72, start: 0, duration: 0.5, velocity: 108 },
  { pitch: 69, start: 0.5, duration: 0.5, velocity: 92 },
  { pitch: 67, start: 1, duration: 0.5, velocity: 84 },
  { pitch: 64, start: 1.5, duration: 0.75, velocity: 76 },
  { pitch: 60, start: 2, duration: 1, velocity: 96 },
  { pitch: 64, start: 3.25, duration: 0.5, velocity: 88 },
  { pitch: 67, start: 3.75, duration: 0.5, velocity: 90 },
];

export const MIDI_EDITOR_E2E_FIXTURE: MidiConvertResult = {
  notesDetected: fixtureNotes.length,
  durationSeconds: 5,
  tracks: 1,
  inferenceTimeSeconds: 0.6,
  pianoRollNotes: fixtureNotes,
  analysis: {
    estimated_key: "C major",
    scale: "major",
    pitch_range: {
      min: 60,
      max: 72,
      min_name: "C4",
      max_name: "C5",
    },
    note_density: 1.4,
    suggested_bpm: 120,
    complexity_score: 0.32,
    total_notes: fixtureNotes.length,
  },
  fileAnalysis: {
    has_drums: false,
    tempo_bpm: 120,
    key_signature: "C",
  },
};
