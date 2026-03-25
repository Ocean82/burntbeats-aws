/**
 * pitchShift.ts — Time-preserving pitch shifting via SoundTouchJS.
 *
 * SoundTouchJS.PitchShifter takes an AudioBuffer directly and acts as its own
 * playback source — it replaces AudioBufferSourceNode when pitch != 0.
 * Pitch changes without altering duration or timing.
 *
 * API:
 *   const shifter = createPitchShifter(ctx, buffer, semitones, tempo);
 *   shifter.connect(dspInputNode);
 *   // later:
 *   shifter.disconnect();
 */

import { PitchShifter } from "soundtouchjs";
import type { StemEditorState } from "../stem-editor-state";

export interface StemPitchShifter {
  /** Connect output to a downstream AudioNode (e.g. dsp.input). */
  connect(destination: AudioNode): void;
  /** Disconnect and clean up. */
  disconnect(): void;
  /** Percentage played (0–100), updated by SoundTouch internally. */
  percentagePlayed: number;
}

/**
 * Creates a SoundTouch-based pitch shifter that replaces AudioBufferSourceNode.
 *
 * @param ctx       Web Audio context
 * @param buffer    Decoded AudioBuffer for the stem
 * @param semitones Pitch shift in semitones (-12 to +12). 0 = no shift.
 * @param tempo     Playback speed (1 = normal, 0.5 = half speed). Independent of pitch.
 * @param trimStart Offset in seconds to start from
 */
export function createPitchShifter(
  ctx: AudioContext,
  buffer: AudioBuffer,
  semitones: number,
  tempo: number = 1,
  trimStart: number = 0
): StemPitchShifter {
  // PitchShifter(context, buffer, bufferSize, startOffset?)
  const shifter = new PitchShifter(ctx, buffer, 1024, trimStart);
  // pitch is a multiplier: 2^(semitones/12)
  shifter.pitch = Math.pow(2, semitones / 12);
  shifter.tempo = tempo;

  // SoundTouchJS requires an 'on' listener before connect() — SimpleFilter.onEnd
  // calls this.callback and throws if it's not set. Register a no-op to satisfy it.
  shifter.on("play", () => {});

  return {
    connect(destination: AudioNode) {
      shifter.connect(destination);
    },
    disconnect() {
      try { shifter.off(); } catch { /* ignored */ }
      try { shifter.disconnect(); } catch { /* already disconnected */ }
    },
    get percentagePlayed() {
      return shifter.percentagePlayed ?? 0;
    },
  };
}

/** Returns true when pitch shifting is needed (non-zero semitones). */
export function needsPitchShift(st: StemEditorState): boolean {
  return (st.pitchSemitones ?? 0) !== 0;
}
