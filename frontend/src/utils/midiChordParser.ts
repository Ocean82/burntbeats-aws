/**
 * midiChordParser — chord symbol parsing and generation.
 */
import { CHORD_TYPES } from "./musicTheory";

const NOTE_VALUES: Record<string, number> = {
  "C": 0, "C#": 1, "Db": 1,
  "D": 2, "D#": 3, "Eb": 3,
  "E": 4,
  "F": 5, "F#": 6, "Gb": 6,
  "G": 7, "G#": 8, "Ab": 8,
  "A": 9, "A#": 10, "Bb": 10,
  "B": 11,
};

const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

export interface ParsedChord {
  root: string;
  type: string;
}

/**
 * Parse a chord symbol (e.g. "Cmaj7", "F#m", "G7sus4") into root and type.
 */
export function parseChord(chordSymbol: string): ParsedChord {
  const match = chordSymbol.match(/^([A-G][#b]?)(.*)$/);
  if (!match) {
    return { root: "C", type: "major" };
  }
  const root = match[1];
  let suffix = match[2];

  if (suffix === "" || suffix === "M") {
    return { root, type: "major" };
  }
  if (suffix === "m" || suffix === "min" || suffix === "-") {
    return { root, type: "minor" };
  }

  const typeMap: Record<string, string> = {
    "maj7": "maj7",
    "M7": "maj7",
    "min7": "min7",
    "m7": "min7",
    "-7": "min7",
    "dom7": "dom7",
    "7": "dom7",
    "dim7": "dim7",
    "dim": "dim",
    "°": "dim",
    "m7b5": "m7b5",
    "ø": "m7b5",
    "aug7": "aug7",
    "+7": "aug7",
    "aug": "aug",
    "+": "aug",
    "sus2": "sus2",
    "sus4": "sus4",
    "7sus4": "7sus4",
    "add9": "add9",
    "madd9": "madd9",
    "maj9": "maj9",
    "m9": "m9",
    "9": "9",
    "11": "11",
    "13": "13",
    "6": "6",
    "m6": "m6",
    "7b9": "7b9",
    "7#9": "7#9",
    "7b5": "7b5",
    "7#5": "7#5",
  };

  const type = typeMap[suffix];
  if (type && CHORD_TYPES[type]) {
    return { root, type };
  }

  return { root, type: "major" };
}

/**
 * Convert a note name+octave to MIDI number (e.g. "C4" -> 60).
 */
export function noteToMidi(noteName: string, octave: number = 4): number {
  const note = noteName.replace(/[0-9]/g, "").toUpperCase();
  const idx = NOTE_VALUES[note];
  if (idx === undefined) return 60;
  return idx + (octave + 1) * 12;
}

/**
 * Convert a MIDI note number to note name (e.g. 60 -> "C4").
 */
export function midiToNote(midiNote: number): string {
  const octave = Math.floor(midiNote / 12) - 1;
  const noteIndex = ((midiNote % 12) + 12) % 12;
  return NOTE_NAMES[noteIndex] + octave;
}

/**
 * Build MIDI note numbers for a chord from root name + type + octave.
 */
export function chordToMidi(
  rootNote: string,
  chordType: string = "major",
  octave: number = 4,
  inversion: number = 0,
): number[] {
  const chordEntry = CHORD_TYPES[chordType] ?? CHORD_TYPES.major;
  const rootMidi = noteToMidi(rootNote, octave);
  const notes = chordEntry.intervals.map((interval) => rootMidi + interval);

  if (inversion > 0) {
    for (let i = 0; i < inversion; i++) {
      const first = notes.shift();
      if (first !== undefined) notes.push(first + 12);
    }
  }

  return notes.filter((n) => n >= 0 && n <= 127);
}
