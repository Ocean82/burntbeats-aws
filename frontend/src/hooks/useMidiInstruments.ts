import { useCallback, useEffect, useRef } from "react";
import * as Tone from "tone";
import type { TrackInstrument } from "../components/midi-convert/editorTypes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SynthInstance = any;

const INSTRUMENT_CONFIG: Record<
  TrackInstrument,
  { oscillator: { type: string }; envelope: { attack: number; decay: number; sustain: number; release: number } }
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

export function useMidiInstruments() {
  const synthsRef = useRef<Map<string, SynthInstance>>(new Map());

  const getSynth = useCallback(async (trackKey: string, instrument: TrackInstrument) => {
    await Tone.start();
    const key = `${trackKey}:${instrument}`;
    let synth = synthsRef.current.get(key);
    if (!synth) {
      synth = new Tone.PolySynth(Tone.Synth, INSTRUMENT_CONFIG[instrument]).toDestination();
      synth.volume.value = -6;
      synthsRef.current.set(key, synth);
    }
    return synth as SynthInstance;
  }, []);

  const releaseAll = useCallback(() => {
    for (const synth of synthsRef.current.values()) {
      synth.releaseAll();
    }
  }, []);

  const disposeAll = useCallback(() => {
    for (const synth of synthsRef.current.values()) {
      synth.dispose();
    }
    synthsRef.current.clear();
  }, []);

  useEffect(() => () => disposeAll(), [disposeAll]);

  return { getSynth, releaseAll, disposeAll };
}
