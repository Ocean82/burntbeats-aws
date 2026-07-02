import type { MidiNoteEvent } from "../hooks/useMidiConvert";
import { applySwingToNoteStart } from "./swingQuantize";
import type { DrumVoice, PatternLength, RowState, VelocityPattern } from "./types";
import { VELOCITY_OFF } from "./types";
import { getAudibleRows } from "../hooks/useBeatMaker";

export interface PatternToMidiNotesInput {
  pattern: VelocityPattern;
  rowStates: RowState[];
  kit: DrumVoice[];
  bpm: number;
  swing: number;
  steps: PatternLength;
  canExportFullMidi?: boolean;
}

export function patternToMidiNotes({
  pattern,
  rowStates,
  kit,
  bpm,
  swing,
  steps,
  canExportFullMidi = true,
}: PatternToMidiNotesInput): MidiNoteEvent[] {
  const notes: MidiNoteEvent[] = [];
  const audible = getAudibleRows(rowStates);
  const exportSteps = canExportFullMidi ? steps : Math.min(steps, 16);
  const stepDur = 60 / bpm / 4;

  pattern.forEach((row, ri) => {
    if (!audible[ri]) return;
    row.forEach((vel, stepIdx) => {
      if (stepIdx >= exportSteps) return;
      if (vel === VELOCITY_OFF) return;
      const startTime = applySwingToNoteStart(stepIdx, bpm, swing);
      notes.push({
        pitch: kit[ri].pitch,
        start: startTime,
        duration: stepDur * 0.8,
        velocity: Math.round(vel * rowStates[ri].volume),
      });
    });
  });

  return notes;
}
