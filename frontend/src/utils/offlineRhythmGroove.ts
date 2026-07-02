/**
 * Client-side drum groove generator — works without midi_service.
 */
import { generateNoteId } from "../components/midi-convert/editorTypes";
import type { EditableNote } from "../components/midi-convert/editorTypes";

const DRUM = {
  kick: 36,
  snare: 38,
  hat: 42,
  openHat: 46,
  ride: 51,
  cowbell: 56,
} as const;

function addHit(
  notes: EditableNote[],
  pitch: number,
  start: number,
  duration: number,
  velocity: number,
) {
  notes.push({
    id: generateNoteId(),
    pitch,
    start,
    duration,
    velocity,
  });
}

function scaledVelocity(base: number, energy: number): number {
  return Math.round(Math.min(127, base * (0.55 + energy * 0.45)));
}

export interface OfflineGrooveOptions {
  style: string;
  bars: number;
  tempo: number;
  energy: number;
}

export function generateOfflineGrooveNotes({
  style,
  bars,
  tempo,
  energy,
}: OfflineGrooveOptions): EditableNote[] {
  const beat = 60 / Math.max(tempo, 40);
  const notes: EditableNote[] = [];
  const id = style.toLowerCase();
  const vel = (base: number) => scaledVelocity(base, energy);

  for (let bar = 0; bar < Math.max(1, bars); bar += 1) {
    const barStart = bar * beat * 4;

    if (id === "edm" || id === "techno") {
      for (let step = 0; step < 4; step += 1) {
        const t = barStart + step * beat;
        addHit(notes, DRUM.kick, t, 0.08, vel(112));
        addHit(notes, DRUM.hat, t + beat * 0.5, 0.04, vel(78));
      }
      if (energy > 0.45) {
        for (let step = 0; step < 16; step += 1) {
          addHit(notes, DRUM.hat, barStart + (step * beat) / 4, 0.03, vel(58));
        }
      }
      continue;
    }

    if (id === "hiphop" || id === "trap") {
      addHit(notes, DRUM.kick, barStart, 0.1, vel(118));
      addHit(notes, DRUM.kick, barStart + beat * 1.75, 0.1, vel(102));
      addHit(notes, DRUM.snare, barStart + beat * 2, 0.08, vel(112));
      addHit(notes, DRUM.hat, barStart + beat * 0.5, 0.04, vel(72));
      addHit(notes, DRUM.hat, barStart + beat * 1.5, 0.04, vel(72));
      if (id === "trap" && energy > 0.5) {
        for (let step = 0; step < 6; step += 1) {
          addHit(notes, DRUM.hat, barStart + beat * 2.25 + (step * beat) / 12, 0.025, vel(55));
        }
      }
      continue;
    }

    if (id === "dnb") {
      addHit(notes, DRUM.kick, barStart, 0.09, vel(110));
      addHit(notes, DRUM.kick, barStart + beat * 2.75, 0.09, vel(100));
      addHit(notes, DRUM.snare, barStart + beat * 2, 0.08, vel(108));
      addHit(notes, DRUM.snare, barStart + beat * 3.5, 0.07, vel(95));
      for (let step = 0; step < 8; step += 1) {
        addHit(notes, DRUM.hat, barStart + (step * beat) / 2, 0.03, vel(62));
      }
      continue;
    }

    if (id === "jazz") {
      for (let step = 0; step < 8; step += 1) {
        addHit(notes, DRUM.ride, barStart + (step * beat) / 2, 0.06, vel(70));
      }
      addHit(notes, DRUM.kick, barStart + beat * 0.5, 0.07, vel(85));
      addHit(notes, DRUM.snare, barStart + beat * 2, 0.06, vel(75));
      continue;
    }

    if (id === "latin") {
      addHit(notes, DRUM.kick, barStart, 0.08, vel(105));
      addHit(notes, DRUM.kick, barStart + beat * 1.5, 0.08, vel(98));
      addHit(notes, DRUM.kick, barStart + beat * 2.5, 0.08, vel(98));
      addHit(notes, DRUM.cowbell, barStart + beat, 0.05, vel(90));
      addHit(notes, DRUM.cowbell, barStart + beat * 3, 0.05, vel(88));
      continue;
    }

    if (id === "reggae") {
      addHit(notes, DRUM.kick, barStart + beat * 2, 0.1, vel(115));
      addHit(notes, DRUM.snare, barStart + beat * 3, 0.07, vel(80));
      addHit(notes, DRUM.hat, barStart + beat * 0.5, 0.04, vel(68));
      addHit(notes, DRUM.hat, barStart + beat * 1.5, 0.04, vel(68));
      addHit(notes, DRUM.hat, barStart + beat * 2.5, 0.04, vel(68));
      addHit(notes, DRUM.hat, barStart + beat * 3.5, 0.04, vel(68));
      continue;
    }

    // rock + unknown styles
    for (let step = 0; step < 4; step += 1) {
      const t = barStart + step * beat;
      if (step === 0 || energy > 0.35) {
        addHit(notes, DRUM.kick, t, 0.09, vel(108));
      }
      addHit(notes, DRUM.hat, t, 0.04, vel(72));
      addHit(notes, DRUM.hat, t + beat * 0.5, 0.04, vel(66));
      if (step === 1 || step === 3) {
        addHit(notes, DRUM.snare, t, 0.08, vel(112));
      }
    }
  }

  return notes;
}
