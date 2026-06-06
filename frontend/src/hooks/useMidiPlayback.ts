import { useCallback, useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import type { MidiNoteEvent } from "./useMidiConvert";
import type { LoopRegion } from "../components/midi-convert/editorTypes";

export interface UseMidiPlaybackReturn {
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number;
  metronomeEnabled: boolean;
  play: (notes: MidiNoteEvent[], options?: { bpm?: number; loopRegion?: LoopRegion }) => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  toggleMetronome: () => void;
  setMetronomeEnabled: (enabled: boolean) => void;
  isSupported: boolean;
}

const checkAudioSupport = (): boolean => {
  if (typeof window === "undefined") return false;
  return !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
};

export function useMidiPlayback(): UseMidiPlaybackReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
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
  const pausedPositionRef = useRef<number>(0);
  const loopRegionRef = useRef<LoopRegion | undefined>(undefined);
  const isPausedRef = useRef(false);
  const notesRef = useRef<MidiNoteEvent[]>([]);
  const bpmRef = useRef(120);

  useEffect(() => {
    metronomeEnabledRef.current = metronomeEnabled;
  }, [metronomeEnabled]);

  const setMetronomeEnabled = useCallback((enabled: boolean) => {
    setMetronomeEnabledState(enabled);
  }, []);

  const toggleMetronome = useCallback(() => {
    setMetronomeEnabledState((v) => !v);
  }, []);

  const clearScheduled = useCallback(() => {
    for (const eventId of scheduledEventsRef.current) {
      Tone.getTransport().clear(eventId);
    }
    scheduledEventsRef.current = [];
  }, []);

  const scheduleNotes = useCallback(
    (notes: MidiNoteEvent[], _bpm: number, offset: number, loopEnd: number) => {
      const transport = Tone.getTransport();
      const eventIds: number[] = [];
      for (const note of notes) {
        const noteTime = note.start - offset;
        if (noteTime < 0) continue;
        if (loopEnd > 0 && noteTime > loopEnd) continue;
        const freq = Tone.Frequency(note.pitch, "midi").toFrequency();
        const dur = Math.max(note.duration, 0.01);
        const vel = Math.max(0.1, Math.min(1, note.velocity));
        const eventId = transport.schedule((time: number) => {
          synthRef.current?.triggerAttackRelease(freq, dur, time, vel);
        }, noteTime);
        eventIds.push(eventId);
      }
      return eventIds;
    },
    [],
  );

  const scheduleMetronome = useCallback(
    (bpm: number, totalDuration: number, offset: number, loopEnd: number) => {
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
        const t = i * beatSec + offset;
        if (t > loopEnd + 0.01 || t > totalDuration + offset + 0.01) break;
        const accent = i % 4 === 0;
        const eventId = transport.schedule((time: number) => {
          clickSynthRef.current?.triggerAttackRelease(
            accent ? "C5" : "G4",
            "32n",
            time,
            accent ? 0.8 : 0.5,
          );
        }, t);
        scheduledEventsRef.current.push(eventId);
      }
    },
    [],
  );

  const updatePlayhead = useCallback((totalDuration: number, offset: number) => {
    const update = () => {
      if (isPausedRef.current) return;
      const elapsed = Tone.now() - startTimeRef.current;
      const pos = offset + elapsed;
      const loop = loopRegionRef.current;
      if (loop?.enabled && loop.end > loop.start && pos >= loop.end) {
        pausedPositionRef.current = loop.start;
        startTimeRef.current = Tone.now();
        rafRef.current = requestAnimationFrame(update);
        setCurrentTime(loop.start);
        return;
      }
      if (pos >= totalDuration + offset) {
        setCurrentTime(totalDuration + offset);
        setIsPlaying(false);
        setIsPaused(false);
        return;
      }
      setCurrentTime(pos);
      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    clearScheduled();
    Tone.getTransport().stop();
    Tone.getTransport().position = 0;
    if (synthRef.current) {
      synthRef.current.releaseAll();
    }
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentTime(0);
    isPausedRef.current = false;
    pausedPositionRef.current = 0;
  }, [clearScheduled]);

  const pause = useCallback(() => {
    if (!isPlaying || isPaused) return;
    clearScheduled();
    Tone.getTransport().stop();
    if (synthRef.current) {
      synthRef.current.releaseAll();
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pausedPositionRef.current = currentTime;
    isPausedRef.current = true;
    setIsPaused(true);
  }, [isPlaying, isPaused, clearScheduled, currentTime]);

  const seek = useCallback(
    (time: number) => {
      if (!isPlaying && !isPaused) {
        setCurrentTime(time);
        pausedPositionRef.current = time;
        return;
      }
      clearScheduled();
      Tone.getTransport().stop();
      if (synthRef.current) {
        synthRef.current.releaseAll();
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const offset = Math.max(0, time);
      const notes = notesRef.current;
      const bpm = bpmRef.current;
      const minStart = notes.length > 0 ? Math.min(...notes.map((n) => n.start)) : 0;
      const maxEnd = notes.length > 0 ? Math.max(...notes.map((n) => n.start + n.duration)) : 0;
      const totalDuration = maxEnd - minStart;
      const loop = loopRegionRef.current;

      const startPlayback = async () => {
        await Tone.start();
        if (!synthRef.current) return;
        const transport = Tone.getTransport();
        transport.bpm.value = bpm;
        startTimeRef.current = Tone.now();
        transport.start();

        const eventIds = scheduleNotes(notes, bpm, minStart, loop?.enabled ? (loop.end - minStart) : totalDuration);
        scheduledEventsRef.current = eventIds;
        scheduleMetronome(bpm, totalDuration, minStart, totalDuration);

        if (loop?.enabled && loop.end > 0) {
          const scheduleLoop = () => {
            if (!isPausedRef.current) {
              const newIds = scheduleNotes(notes, bpm, minStart, loop.end - minStart);
              scheduledEventsRef.current.push(...newIds);
            }
          };
          const loopEndEventId = transport.schedule(() => {
            scheduleLoop();
            transport.start();
          }, loop.end - minStart + 0.05);
          scheduledEventsRef.current.push(loopEndEventId);
        }

        setCurrentTime(offset);
        updatePlayhead(totalDuration, minStart);
      };

      void startPlayback();
    },
    [clearScheduled, scheduleNotes, scheduleMetronome, updatePlayhead, isPlaying, isPaused],
  );

  const play = useCallback(
    (notes: MidiNoteEvent[], options?: { bpm?: number; loopRegion?: LoopRegion }) => {
      if (!isSupported || !notes.length) return;
      stop();

      notesRef.current = notes;
      bpmRef.current = options?.bpm ?? 120;
      loopRegionRef.current = options?.loopRegion;

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

        const loop = options?.loopRegion;

        const eventIds: number[] = [];
        for (const note of notes) {
          const noteTime = note.start - minStart;
          if (loop?.enabled && loop.end > 0 && note.start >= loop.end) continue;
          const freq = Tone.Frequency(note.pitch, "midi").toFrequency();
          const dur = Math.max(note.duration, 0.01);
          const vel = Math.max(0.1, Math.min(1, note.velocity));
          const eventId = transport.schedule((time: number) => {
            synth.triggerAttackRelease(freq, dur, time, vel);
          }, noteTime);
          eventIds.push(eventId);
        }
        scheduledEventsRef.current = eventIds;

        scheduleMetronome(bpm, totalDuration, 0, totalDuration);

        if (loop?.enabled && loop.start >= 0 && loop.end > loop.start) {
          const loopEndEventId = transport.schedule(() => {
            transport.stop();
            transport.position = loop.start - minStart;
            const newIds: number[] = [];
            for (const note of notes) {
              const noteTime = note.start - minStart;
              if (note.start < loop.start || note.start >= loop.end) continue;
              const freq = Tone.Frequency(note.pitch, "midi").toFrequency();
              const dur = Math.max(note.duration, 0.01);
              const vel = Math.max(0.1, Math.min(1, note.velocity));
              const id = transport.schedule((time: number) => {
                synth.triggerAttackRelease(freq, dur, time, vel);
              }, noteTime);
              newIds.push(id);
            }
            scheduledEventsRef.current.push(...newIds);
            transport.start();
          }, loop.end - minStart);
          scheduledEventsRef.current.push(loopEndEventId);
        } else {
          const endEventId = transport.schedule(() => {
            stop();
          }, totalDuration + 0.1);
          scheduledEventsRef.current.push(endEventId);
        }

        transport.start();
        startTimeRef.current = Tone.now();
        isPausedRef.current = false;
        setIsPaused(false);
        setIsPlaying(true);

        updatePlayhead(totalDuration, minStart);
      };

      void startPlayback();
    },
    [isSupported, stop, scheduleMetronome, updatePlayhead],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      clearScheduled();
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
  }, [clearScheduled]);

  return {
    isPlaying,
    isPaused,
    currentTime,
    metronomeEnabled,
    play,
    pause,
    stop,
    seek,
    toggleMetronome,
    setMetronomeEnabled,
    isSupported,
  };
}
