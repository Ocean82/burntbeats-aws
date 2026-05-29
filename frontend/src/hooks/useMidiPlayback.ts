/**
 * useMidiPlayback — Tone.js PolySynth hook for in-browser MIDI playback.
 * Accepts MidiNoteEvent[], exposes play/stop/isPlaying/currentTime.
 * Uses requestAnimationFrame for smooth playhead position updates.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import type { MidiNoteEvent } from "./useMidiConvert";

export interface UseMidiPlaybackReturn {
  isPlaying: boolean;
  currentTime: number;
  metronomeEnabled: boolean;
  play: (notes: MidiNoteEvent[], options?: { bpm?: number }) => void;
  stop: () => void;
  toggleMetronome: () => void;
  setMetronomeEnabled: (enabled: boolean) => void;
  isSupported: boolean;
}

/** Check if Web Audio API is available in this browser. */
const checkAudioSupport = (): boolean => {
  if (typeof window === "undefined") return false;
  return !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
};

export function useMidiPlayback(): UseMidiPlaybackReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [metronomeEnabled, setMetronomeEnabledState] = useState(false);
  const [isSupported] = useState(checkAudioSupport);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const synthRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clickSynthRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  const scheduledEventsRef = useRef<number[]>([]);
  const metronomeEnabledRef = useRef(false);

  useEffect(() => {
    metronomeEnabledRef.current = metronomeEnabled;
  }, [metronomeEnabled]);

  const setMetronomeEnabled = useCallback((enabled: boolean) => {
    setMetronomeEnabledState(enabled);
  }, []);

  const toggleMetronome = useCallback(() => {
    setMetronomeEnabledState((v) => !v);
  }, []);

  /** Stop playback and clean up scheduled events. */
  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    for (const eventId of scheduledEventsRef.current) {
      Tone.getTransport().clear(eventId);
    }
    scheduledEventsRef.current = [];

    Tone.getTransport().stop();
    Tone.getTransport().position = 0;

    if (synthRef.current) {
      synthRef.current.releaseAll();
    }

    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  const scheduleMetronome = useCallback((bpm: number, totalDuration: number) => {
    if (!metronomeEnabledRef.current) return;
    if (!clickSynthRef.current) {
      clickSynthRef.current = new Tone.MembraneSynth({
        pitchDecay: 0.008,
        octaves: 2,
        envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 },
      }).toDestination();
      clickSynthRef.current.volume.value = -18;
    }
    const beatSec = 60 / bpm;
    const beats = Math.ceil(totalDuration / beatSec) + 1;
    const transport = Tone.getTransport();
    for (let i = 0; i <= beats; i++) {
      const t = i * beatSec;
      if (t > totalDuration + 0.01) break;
      const accent = i % 4 === 0;
      const eventId = transport.schedule((time: number) => {
        clickSynthRef.current?.triggerAttackRelease(accent ? "C5" : "G4", "32n", time, accent ? 0.8 : 0.5);
      }, t);
      scheduledEventsRef.current.push(eventId);
    }
  }, []);

  /** Start playback of the given notes. */
  const play = useCallback(
    (notes: MidiNoteEvent[], options?: { bpm?: number }) => {
      if (!isSupported || !notes.length) return;

      stop();

      const startPlayback = async () => {
        await Tone.start();

        if (!synthRef.current) {
          synthRef.current = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: "triangle" },
            envelope: {
              attack: 0.02,
              decay: 0.1,
              sustain: 0.3,
              release: 0.4,
            },
          }).toDestination();
          synthRef.current.volume.value = -6;
        }

        const synth = synthRef.current;
        const transport = Tone.getTransport();
        const bpm = options?.bpm ?? 120;
        transport.bpm.value = bpm;

        const minStart = Math.min(...notes.map((n) => n.start));
        const maxEnd = Math.max(...notes.map((n) => n.start + n.duration));
        const totalDuration = maxEnd - minStart;
        durationRef.current = totalDuration;

        const eventIds: number[] = [];
        for (const note of notes) {
          const noteTime = note.start - minStart;
          const freq = Tone.Frequency(note.pitch, "midi").toFrequency();
          const dur = Math.max(note.duration, 0.01);
          const vel = Math.max(0.1, Math.min(1, note.velocity));

          const eventId = transport.schedule((time: number) => {
            synth.triggerAttackRelease(freq, dur, time, vel);
          }, noteTime);
          eventIds.push(eventId);
        }
        scheduledEventsRef.current = eventIds;

        scheduleMetronome(bpm, totalDuration);

        const endEventId = transport.schedule(() => {
          stop();
        }, totalDuration + 0.1);
        scheduledEventsRef.current.push(endEventId);

        transport.start();
        startTimeRef.current = Tone.now();
        setIsPlaying(true);

        const updatePlayhead = () => {
          const elapsed = Tone.now() - startTimeRef.current;
          if (elapsed >= totalDuration) {
            setCurrentTime(totalDuration);
            return;
          }
          setCurrentTime(elapsed);
          rafRef.current = requestAnimationFrame(updatePlayhead);
        };
        rafRef.current = requestAnimationFrame(updatePlayhead);
      };

      void startPlayback();
    },
    [isSupported, stop, scheduleMetronome],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      for (const eventId of scheduledEventsRef.current) {
        Tone.getTransport().clear(eventId);
      }
      Tone.getTransport().stop();
      Tone.getTransport().position = 0;
      if (synthRef.current) {
        synthRef.current.dispose();
        synthRef.current = null;
      }
      if (clickSynthRef.current) {
        clickSynthRef.current.dispose();
        clickSynthRef.current = null;
      }
    };
  }, []);

  return {
    isPlaying,
    currentTime,
    metronomeEnabled,
    play,
    stop,
    toggleMetronome,
    setMetronomeEnabled,
    isSupported,
  };
}
