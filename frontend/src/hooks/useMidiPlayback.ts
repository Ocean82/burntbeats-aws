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
  play: (notes: MidiNoteEvent[]) => void;
  stop: () => void;
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
  const [isSupported] = useState(checkAudioSupport);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const synthRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  const scheduledEventsRef = useRef<number[]>([]);

  /** Stop playback and clean up scheduled events. */
  const stop = useCallback(() => {
    // Cancel animation frame
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    // Clear scheduled events from Transport
    for (const eventId of scheduledEventsRef.current) {
      Tone.getTransport().clear(eventId);
    }
    scheduledEventsRef.current = [];

    // Stop transport
    Tone.getTransport().stop();
    Tone.getTransport().position = 0;

    // Release all notes on the synth
    if (synthRef.current) {
      synthRef.current.releaseAll();
    }

    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  /** Start playback of the given notes. */
  const play = useCallback(
    (notes: MidiNoteEvent[]) => {
      if (!isSupported || !notes.length) return;

      // Stop any existing playback first
      stop();

      const startPlayback = async () => {
        // Ensure AudioContext is started (browser autoplay policy)
        await Tone.start();

        // Create synth if not already created
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

        // Compute the total duration of the piece
        const minStart = Math.min(...notes.map((n) => n.start));
        const maxEnd = Math.max(...notes.map((n) => n.start + n.duration));
        const totalDuration = maxEnd - minStart;
        durationRef.current = totalDuration;

        // Schedule each note on the Transport
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

        // Schedule a stop event at the end
        const endEventId = transport.schedule(() => {
          stop();
        }, totalDuration + 0.1);
        scheduledEventsRef.current.push(endEventId);

        // Start transport
        transport.start();
        startTimeRef.current = Tone.now();
        setIsPlaying(true);

        // Start animation frame loop for currentTime updates
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
    [isSupported, stop],
  );

  // Cleanup on unmount
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
    };
  }, []);

  return { isPlaying, currentTime, play, stop, isSupported };
}
