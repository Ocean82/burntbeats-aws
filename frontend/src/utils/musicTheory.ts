export type Scale =
  | "major"
  | "minor"
  | "pentatonic"
  | "blues"
  | "chromatic"
  | "dorian"
  | "phrygian"
  | "lydian"
  | "mixolydian";
export type RootNote = "C" | "C#" | "D" | "D#" | "E" | "F" | "F#" | "G" | "G#" | "A" | "A#" | "B";

export const NOTE_NAMES: RootNote[] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const SCALE_INTERVALS: Record<Scale, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

export const CHORD_TYPES: Record<string, { name: string; intervals: number[] }> = {
  major: { name: "Maj", intervals: [0, 4, 7] },
  minor: { name: "Min", intervals: [0, 3, 7] },
  dom7: { name: "7", intervals: [0, 4, 7, 10] },
  maj7: { name: "Maj7", intervals: [0, 4, 7, 11] },
  min7: { name: "Min7", intervals: [0, 3, 7, 10] },
  sus2: { name: "Sus2", intervals: [0, 2, 7] },
  sus4: { name: "Sus4", intervals: [0, 5, 7] },
  dim: { name: "Dim", intervals: [0, 3, 6] },
  aug: { name: "Aug", intervals: [0, 4, 8] },
};

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidi(freq: number): number {
  return Math.round(12 * Math.log2(freq / 440) + 69);
}

export function midiToNoteName(midi: number): string {
  const note = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

export function noteNameToMidi(name: string, octave: number): number {
  const idx = NOTE_NAMES.indexOf(name as RootNote);
  return (octave + 1) * 12 + idx;
}

export function getScaleNotes(root: RootNote, scale: Scale, octaveStart = 3, octaves = 3): number[] {
  const rootIdx = NOTE_NAMES.indexOf(root);
  const intervals = SCALE_INTERVALS[scale];
  const notes: number[] = [];
  for (let o = 0; o < octaves; o++) {
    for (const interval of intervals) {
      const midi = (octaveStart + o + 1) * 12 + rootIdx + interval;
      if (midi <= 127) notes.push(midi);
    }
  }
  return notes;
}

export function quantizeToScale(midi: number, root: RootNote, scale: Scale): number {
  if (scale === "chromatic") return midi;
  const rootIdx = NOTE_NAMES.indexOf(root);
  const intervals = SCALE_INTERVALS[scale];
  const noteInOctave = ((midi - rootIdx) % 12 + 12) % 12;
  let closest = intervals[0];
  let minDist = Math.abs(noteInOctave - intervals[0]);
  for (const interval of intervals) {
    const dist = Math.min(Math.abs(noteInOctave - interval), 12 - Math.abs(noteInOctave - interval));
    if (dist < minDist) {
      minDist = dist;
      closest = interval;
    }
  }
  const diff = closest - noteInOctave;
  return midi + diff;
}

export function getChordNotes(root: RootNote, chordType: string, octave = 4): number[] {
  const rootIdx = NOTE_NAMES.indexOf(root);
  const chord = CHORD_TYPES[chordType];
  if (!chord) return [];
  return chord.intervals.map((i) => (octave + 1) * 12 + rootIdx + i);
}

export function getDiatonicChords(
  root: RootNote,
  scale: Scale
): Array<{ root: string; type: string; name: string; midi: number[] }> {
  const rootIdx = NOTE_NAMES.indexOf(root);
  const intervals = SCALE_INTERVALS[scale];
  const chords = [];
  for (let i = 0; i < Math.min(7, intervals.length); i++) {
    const chordRoot = (rootIdx + intervals[i]) % 12;
    const chordRootName = NOTE_NAMES[chordRoot];
    const third = (intervals[(i + 2) % intervals.length] - intervals[i] + 12) % 12;
    const isMinor = third === 3;
    const type = isMinor ? "minor" : "major";
    const midi = [chordRoot + 60, chordRoot + 60 + (isMinor ? 3 : 4), chordRoot + 60 + 7];
    chords.push({ root: chordRootName, type, name: `${chordRootName} ${type === "minor" ? "min" : "maj"}`, midi });
  }
  return chords;
}

export function getFreqName(freq: number): { note: string; cents: number; octave: number } {
  const midi = 12 * Math.log2(freq / 440) + 69;
  const roundedMidi = Math.round(midi);
  const cents = (midi - roundedMidi) * 100;
  const note = NOTE_NAMES[((roundedMidi % 12) + 12) % 12];
  const octave = Math.floor(roundedMidi / 12) - 1;
  return { note, cents, octave };
}

/** x = complexity (0–1), y = velocity (unused; reserved). Returns 6 rows × `beats` steps. */
export function generateDrumPattern(x: number, _y: number, beats = 16): boolean[][] {
  const complexity = x;
  const rows = 6;
  const pattern: boolean[][] = Array.from({ length: rows }, () => Array(beats).fill(false));

  pattern[0][0] = true;
  pattern[0][8] = true;
  if (complexity > 0.5) {
    pattern[0][6] = true;
  }
  if (complexity > 0.7) {
    pattern[0][14] = true;
  }
  if (complexity > 0.9) {
    pattern[0][10] = true;
  }

  pattern[1][4] = true;
  pattern[1][12] = true;
  if (complexity > 0.8) {
    pattern[1][2] = true;
    pattern[1][14] = true;
  }

  for (let i = 0; i < beats; i += 2) {
    pattern[2][i] = true;
  }
  if (complexity > 0.4) {
    for (let i = 1; i < beats; i += 2) {
      pattern[2][i] = true;
    }
  }
  if (complexity > 0.6) {
    pattern[3][3] = true;
    pattern[3][11] = true;
  }

  if (complexity > 0.3) {
    pattern[4][4] = true;
    pattern[4][12] = true;
  }
  if (complexity > 0.75) {
    pattern[4][8] = true;
  }

  if (complexity > 0.5) {
    for (let i = 0; i < beats; i += 4) {
      pattern[5][i] = true;
    }
  }

  return pattern;
}
