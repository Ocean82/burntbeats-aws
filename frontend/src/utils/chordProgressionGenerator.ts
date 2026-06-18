/**
 * chordProgressionGenerator — music-theory-driven progression engine.
 * Genre/mood-aware progression selection, circle-of-fifths, 8 scale modes.
 */
import { CHORD_TYPES, NOTE_NAMES, type RootNote, type Scale } from "./musicTheory";

export interface ProgressionChord {
  root: string;
  quality: string;
  extensions?: string[];
}

export interface GeneratedProgression {
  id: string;
  name: string;
  key: string;
  chords: ProgressionChord[];
  romanNumerals: string[];
  genre: string;
  mood: string;
  tempo: number;
  description: string;
  tags: string[];
}

type Mode = Scale;

const CIRCLE_OF_FIFTHS: string[] = [
  "C", "G", "D", "A", "E", "B", "F#", "C#", "Ab", "Eb", "Bb", "F",
];

const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

const COMMON_PROGRESSIONS: Record<string, number[]> = {
  "I-V-vi-IV": [1, 5, 6, 4],
  "vi-IV-I-V": [6, 4, 1, 5],
  "I-vi-IV-V": [1, 6, 4, 5],
  "ii-V-I": [2, 5, 1],
  "I-IV-V-I": [1, 4, 5, 1],
  "i-VII-VI-VII": [1, 7, 6, 7],
  "i-V-iv-i": [1, 5, 4, 1],
  "I-iii-vi-IV": [1, 3, 6, 4],
  "vi-V-IV-V": [6, 5, 4, 5],
  "I-V-vi-iii-IV-I-IV-V": [1, 5, 6, 3, 4, 1, 4, 5],
};

const GENRE_PROGRESSIONS: Record<string, string[]> = {
  pop: ["I-V-vi-IV", "vi-IV-I-V", "I-vi-IV-V"],
  rock: ["I-V-vi-IV", "i-VII-VI-VII", "I-IV-V-I"],
  jazz: ["ii-V-I", "I-vi-ii-V", "iii-vi-ii-V-I"],
  blues: ["I-I-I-I-IV-IV-I-I-V-IV-I-V"],
  folk: ["I-IV-V-I", "vi-IV-I-V", "I-vi-IV-V"],
  electronic: ["i-V-iv-i", "vi-IV-I-V", "I-V-vi-IV"],
  classical: ["I-IV-V-I", "ii-V-I", "I-vi-ii-V"],
  reggae: ["I-V-vi-IV", "vi-IV-I-V"],
  country: ["I-IV-V-I", "I-vi-IV-V", "vi-IV-I-V"],
  hiphop: ["vi-IV-I-V", "i-VII-VI-VII", "I-V-vi-IV"],
};

const MOOD_CHARACTERISTICS: Record<string, { preferMajor: boolean; tension: number }> = {
  happy: { preferMajor: true, tension: 0.3 },
  sad: { preferMajor: false, tension: 0.4 },
  energetic: { preferMajor: true, tension: 0.7 },
  calm: { preferMajor: true, tension: 0.2 },
  mysterious: { preferMajor: false, tension: 0.8 },
  romantic: { preferMajor: true, tension: 0.4 },
  dramatic: { preferMajor: false, tension: 0.9 },
  nostalgic: { preferMajor: false, tension: 0.5 },
};

export function generateProgression(
  key: { tonic: RootNote; mode: Mode },
  genre: string = "pop",
  mood: string = "happy",
  length: number = 4,
): GeneratedProgression {
  const progNames = GENRE_PROGRESSIONS[genre] ?? GENRE_PROGRESSIONS.pop;
  const progName = progNames[Math.floor(Math.random() * progNames.length)];
  const romanNumerals = COMMON_PROGRESSIONS[progName] ?? [1, 5, 6, 4];

  const adjusted = adjustProgressionLength(romanNumerals, length);
  const chords = adjusted.map((degree) => generateChordFromDegree(degree, key, mood));

  return {
    id: `progression-${Date.now()}`,
    name: progName,
    key: `${key.tonic} ${key.mode}`,
    chords,
    romanNumerals: adjusted.map((d) => degreeToRomanNumeral(d, key.mode)),
    genre,
    mood,
    tempo: getTempoForGenre(genre),
    description: `${mood.charAt(0).toUpperCase() + mood.slice(1)} ${genre} progression in ${key.tonic} ${key.mode}`,
    tags: [genre, mood, key.mode],
  };
}

function adjustProgressionLength(progression: number[], targetLength: number): number[] {
  if (progression.length === targetLength) return progression;
  if (progression.length > targetLength) return progression.slice(0, targetLength);

  const extended = [...progression];
  while (extended.length < targetLength) {
    const last = extended[extended.length - 1];
    extended.push(getCommonTransition(last));
  }
  return extended.slice(0, targetLength);
}

function getCommonTransition(fromDegree: number): number {
  const transitions: Record<number, number[]> = {
    1: [4, 5, 6],
    2: [5, 1],
    3: [6, 4],
    4: [5, 1, 2],
    5: [1, 6],
    6: [4, 2, 5],
    7: [1, 3],
  };
  const options = transitions[fromDegree] ?? [1];
  return options[Math.floor(Math.random() * options.length)];
}

function generateChordFromDegree(degree: number, key: { tonic: RootNote; mode: Mode }, mood: string): ProgressionChord {
  const scaleNotes = getScaleNotes(key);
  const rootNote = scaleNotes[(degree - 1) % 7];
  const quality = getChordQuality(degree, key.mode, mood);
  const extensions = getChordExtensions(degree, mood);

  return { root: rootNote, quality, extensions: extensions.length > 0 ? extensions : undefined };
}

function getScaleNotes(key: { tonic: RootNote; mode: Mode }): string[] {
  const tonicIndex = NOTE_NAMES.indexOf(key.tonic);
  const intervals = key.mode === "minor" ? MINOR_SCALE_INTERVALS : MAJOR_SCALE_INTERVALS;
  return intervals.map((i) => NOTE_NAMES[(tonicIndex + i) % 12]);
}

function getChordQuality(degree: number, mode: Mode, mood: string): string {
  const moodChar = MOOD_CHARACTERISTICS[mood] ?? MOOD_CHARACTERISTICS.happy;

  if (mode === "major") {
    const qualities = ["major", "minor", "minor", "major", "dom7", "minor", "dim"];
    let q = qualities[(degree - 1) % 7];
    if (moodChar.tension > 0.6) {
      if (q === "major") q = "maj7";
      if (q === "minor") q = "min7";
    }
    return q;
  }

  const qualities = ["minor", "dim", "major", "minor", "minor", "major", "major"];
  return qualities[(degree - 1) % 7];
}

function getChordExtensions(degree: number, mood: string): string[] {
  const moodChar = MOOD_CHARACTERISTICS[mood] ?? MOOD_CHARACTERISTICS.happy;
  const extensions: string[] = [];
  if (moodChar.tension > 0.7) {
    if (degree === 1 || degree === 4) extensions.push("add9");
    if (degree === 5) extensions.push("sus4");
  }
  return extensions;
}

function degreeToRomanNumeral(degree: number, mode: Mode): string {
  const numerals = ["I", "II", "III", "IV", "V", "VI", "VII"];
  const numeral = numerals[(degree - 1) % 7];

  if (mode === "major") {
    if ([2, 3, 6].includes(degree)) return numeral.toLowerCase();
    if (degree === 7) return numeral.toLowerCase() + "°";
    return numeral;
  }

  if ([3, 6, 7].includes(degree)) return numeral;
  if (degree === 2) return numeral.toLowerCase() + "°";
  return numeral.toLowerCase();
}

function getTempoForGenre(genre: string): number {
  const tempos: Record<string, number> = {
    pop: 120, rock: 130, jazz: 140, blues: 90, folk: 100,
    electronic: 128, classical: 110, reggae: 75, country: 115, hiphop: 90,
  };
  return tempos[genre] ?? 120;
}

/** Generate variations of an existing progression. */
export function generateVariation(
  base: GeneratedProgression,
  variationType: "substitute" | "extend" | "invert" | "reharmonize",
): GeneratedProgression {
  const variation = { ...base };
  variation.id = `variation-${Date.now()}`;
  variation.name = `${base.name} (${variationType})`;
  variation.tags = [...base.tags, variationType];

  switch (variationType) {
    case "substitute":
      variation.chords = base.chords.map((chord) =>
        chord.quality === "dom7" ? { ...chord, root: getTritoneSubstitute(chord.root) } : chord,
      );
      break;
    case "extend":
      variation.chords = base.chords.map((chord) => ({
        ...chord,
        extensions: [...(chord.extensions ?? []), "9"],
      }));
      break;
    case "invert":
      variation.chords = base.chords.map((chord, i) => ({
        ...chord,
        extensions: [...(chord.extensions ?? []), `inv${(i % 3) + 1}`],
      }));
      break;
    case "reharmonize":
      variation.chords = reharmonizeChords(base.chords);
      break;
  }

  return variation;
}

function getTritoneSubstitute(note: string): string {
  const idx = NOTE_NAMES.indexOf(note as RootNote);
  if (idx === -1) return note;
  return NOTE_NAMES[(idx + 6) % 12];
}

function reharmonizeChords(chords: ProgressionChord[]): ProgressionChord[] {
  const result: ProgressionChord[] = [];
  for (let i = 0; i < chords.length; i++) {
    result.push(chords[i]);
    if (i < chords.length - 1) {
      const fromIdx = NOTE_NAMES.indexOf(chords[i].root as RootNote);
      const toIdx = NOTE_NAMES.indexOf(chords[i + 1].root as RootNote);
      const dist = (toIdx - fromIdx + 12) % 12;
      if (dist === 2 || dist === 10) {
        const passIdx = (fromIdx + (dist > 6 ? 11 : 1)) % 12;
        result.push({ root: NOTE_NAMES[passIdx], quality: "dim" });
      }
    }
  }
  return result;
}

/** Analyze a progression for music theory insights. */
export function analyzeProgression(progression: GeneratedProgression): {
  functionalAnalysis: string[];
  keyCenter: string;
  tension: number;
  brightness: number;
} {
  const functionalAnalysis = progression.romanNumerals.map((numeral) => {
    if (numeral.includes("V")) return "Dominant";
    if (numeral.includes("I")) return "Tonic";
    if (numeral.includes("IV")) return "Subdominant";
    return "Other";
  });

  const tension =
    progression.chords.reduce((acc, c) => {
      let t = 0;
      if (c.quality.includes("7")) t += 0.3;
      if (c.quality === "dim") t += 0.4;
      if (c.extensions?.length) t += 0.2;
      return acc + t;
    }, 0) / Math.max(1, progression.chords.length);

  const majorChords = progression.chords.filter(
    (c) => c.quality === "major" || c.quality === "maj7",
  ).length;

  return {
    functionalAnalysis,
    keyCenter: progression.key,
    tension: Math.min(1, tension),
    brightness: majorChords / Math.max(1, progression.chords.length),
  };
}
