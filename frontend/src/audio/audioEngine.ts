/**
 * Shared Tone.js audio engine — single Transport for previews, pooled synths elsewhere.
 */
import * as Tone from "tone";
import { PolySynth, Synth } from "tone";
import type { MidiNoteEvent } from "../hooks/useMidiConvert";
import type { TrackInstrument } from "../components/midi-convert/editorTypes";

const scheduledIds: number[] = [];
let previewSynth: InstanceType<typeof PolySynth> | null = null;
let chordSynth: InstanceType<typeof PolySynth> | null = null;
const instrumentSynths = new Map<string, InstanceType<typeof PolySynth>>();
let editorTransportStopHandler: (() => void) | null = null;

export function registerEditorTransportStopHandler(
  handler: (() => void) | null,
): void {
  editorTransportStopHandler = handler;
}

/** Stop aux preview bus so main editor transport can own Tone.Transport. */
export function pausePreviewForEditor(): void {
  stopMidiPreview();
}

function notifyPreviewTransportStarting(): void {
  editorTransportStopHandler?.();
}

const INSTRUMENT_CONFIG: Record<
  TrackInstrument,
  {
    oscillator: { type: string };
    envelope: { attack: number; decay: number; sustain: number; release: number };
  }
> = {
  piano: {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.02, decay: 0.2, sustain: 0.2, release: 0.5 },
  },
  synth: {
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.4, release: 0.3 },
  },
  bass: {
    oscillator: { type: "square" },
    envelope: { attack: 0.005, decay: 0.15, sustain: 0.5, release: 0.2 },
  },
  strings: {
    oscillator: { type: "sine" },
    envelope: { attack: 0.15, decay: 0.2, sustain: 0.7, release: 0.8 },
  },
};

export async function ensureAudioStarted(): Promise<void> {
  await Tone.start();
}

/** @deprecated Use ensureAudioStarted */
export const ensurePreviewAudioStarted = ensureAudioStarted;

function getPreviewSynth(): InstanceType<typeof PolySynth> {
  if (!previewSynth) {
    previewSynth = new PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 0.3 },
    }).toDestination();
    previewSynth.volume.value = -8;
  }
  return previewSynth;
}

function getChordSynth(): InstanceType<typeof PolySynth> {
  if (!chordSynth) {
    chordSynth = new PolySynth(Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.4, release: 0.5 },
    }).toDestination();
    chordSynth.volume.value = -10;
  }
  return chordSynth;
}

export function stopMidiPreview(): void {
  for (const id of scheduledIds) {
    Tone.getTransport().clear(id);
  }
  scheduledIds.length = 0;
  Tone.getTransport().stop();
  Tone.getTransport().position = 0;
  previewSynth?.releaseAll();
}

export async function playMidiPreviewNotes(
  notes: MidiNoteEvent[],
  bpm: number,
  onComplete?: () => void,
): Promise<void> {
  if (!notes.length) return;
  await ensureAudioStarted();
  notifyPreviewTransportStarting();
  stopMidiPreview();

  const synth = getPreviewSynth();
  const transport = Tone.getTransport();
  transport.bpm.value = bpm;
  const minStart = Math.min(...notes.map((n) => n.start));
  const maxEnd = Math.max(...notes.map((n) => n.start + n.duration));
  const total = maxEnd - minStart;

  for (const note of notes) {
    const t = note.start - minStart;
    const freq = Tone.Frequency(note.pitch, "midi").toFrequency();
    const eventId = transport.schedule((time: number) => {
      synth.triggerAttackRelease(
        freq,
        Math.max(note.duration, 0.05),
        time,
        Math.max(0.1, note.velocity / 127),
      );
    }, t);
    scheduledIds.push(eventId);
  }

  const endId = transport.schedule(() => {
    stopMidiPreview();
    onComplete?.();
  }, total + 0.1);
  scheduledIds.push(endId);
  transport.start();
}

export async function previewChordFrequencies(
  frequencies: number[],
  duration: string = "8n",
): Promise<void> {
  await ensureAudioStarted();
  getChordSynth().triggerAttackRelease(frequencies, duration);
}

export async function previewChordMidiNotes(
  midiNotes: number[],
  duration: string = "8n",
): Promise<void> {
  const frequencies = midiNotes.map((pitch) =>
    Tone.Frequency(pitch, "midi").toFrequency(),
  );
  await previewChordFrequencies(frequencies, duration);
}

export async function getInstrumentSynth(
  trackKey: string,
  instrument: TrackInstrument,
): Promise<InstanceType<typeof PolySynth>> {
  await ensureAudioStarted();
  const key = `${trackKey}:${instrument}`;
  let synth = instrumentSynths.get(key);
  if (!synth) {
    synth = new PolySynth(Tone.Synth, INSTRUMENT_CONFIG[instrument]).toDestination();
    synth.volume.value = -6;
    instrumentSynths.set(key, synth);
  }
  return synth;
}

export function releaseAllInstrumentSynths(): void {
  for (const synth of instrumentSynths.values()) {
    synth.releaseAll();
  }
}

export function disposeInstrumentSynths(): void {
  for (const synth of instrumentSynths.values()) {
    synth.dispose();
  }
  instrumentSynths.clear();
}

export function disposePreviewSynths(): void {
  previewSynth?.dispose();
  previewSynth = null;
  chordSynth?.dispose();
  chordSynth = null;
}
