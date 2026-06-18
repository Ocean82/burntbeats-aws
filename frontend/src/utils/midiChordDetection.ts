/**
 * midiChordDetection — recognize chord names from sets of MIDI notes.
 */
import { CHORD_TYPES, NOTE_NAMES } from "./musicTheory";

const CHROMATIC: string[] = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

export interface RecognizedChord {
  root: string;
  type: string;
  name: string;
  confidence: number;
}

const CHORD_TYPE_ORDER = [
  "dim7", "dim", "m7b5", "min7", "m9", "m6", "minor", "madd9",
  "maj7", "maj9", "major",
  "dom7", "7sus4", "9", "11", "13", "7b9", "7#9", "7b5", "7#5",
  "aug7", "aug",
  "sus2", "sus4", "add9", "6",
];

function normalizePitchClass(pitch: number): number {
  return ((pitch % 12) + 12) % 12;
}

function pitchClassSet(notes: number[]): number[] {
  const set = new Set(notes.map(normalizePitchClass));
  return Array.from(set).sort((a, b) => a - b);
}

function intervalSet(pitchClasses: number[]): number[] {
  if (pitchClasses.length === 0) return [];
  const root = pitchClasses[0];
  return pitchClasses.map((pc) => (pc - root + 12) % 12);
}

/**
 * Recognize the most likely chord from a set of MIDI note numbers.
 * Returns the best match with confidence score (0-1).
 */
export function recognizeChord(notes: number[]): RecognizedChord | null {
  if (notes.length < 2) return null;

  const pcs = pitchClassSet(notes);

  let bestMatch: RecognizedChord | null = null;
  let bestScore = 0;

  for (let rotation = 0; rotation < pcs.length; rotation++) {
    const rotated = [...pcs.slice(rotation), ...pcs.slice(0, rotation)];
    const targetIntervals = intervalSet(rotated);

    for (const type of CHORD_TYPE_ORDER) {
      const chordDef = CHORD_TYPES[type];
      if (!chordDef) continue;

      const ci = chordDef.intervals.map((i) => i % 12);
      const uniqueCI = Array.from(new Set(ci)).sort((a, b) => a - b);

      let matches = 0;
      for (const ti of targetIntervals) {
        if (uniqueCI.includes(ti)) matches++;
      }

      const precision = matches / targetIntervals.length;
      const recall = matches / uniqueCI.length;
      const f1 =
        precision + recall > 0
          ? (2 * precision * recall) / (precision + recall)
          : 0;

      if (f1 > bestScore) {
        const rootIdx = normalizePitchClass(rotated[0]);
        const rootName = CHROMATIC[rootIdx];
        const suffix = chordDef.name;
        const name = `${rootName}${suffix === "Maj" ? "" : suffix === "Min" ? "m" : suffix === "7" ? "7" : suffix}`;

        bestScore = f1;
        bestMatch = {
          root: rootName,
          type,
          name,
          confidence: f1,
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Get the canonical chord name from root + type (e.g. "C", "maj7" -> "Cmaj7").
 */
export function chordName(root: string, type: string): string {
  const def = CHORD_TYPES[type];
  if (!def) return root;
  const suffix = def.name;
  if (suffix === "Maj") return root;
  if (suffix === "Min") return root + "m";
  return root + suffix;
}
