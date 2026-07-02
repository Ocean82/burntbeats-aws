import { useCallback, useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import type { Player } from "tone/build/esm/source/buffer/Player.js";
import type { MidiNoteEvent } from "./useMidiConvert";
import type { LoopRegion } from "../components/midi-convert/editorTypes";
import type { TrackInstrument } from "../components/midi-convert/editorTypes";
import { useMidiInstruments } from "./useMidiInstruments";
import {
  pausePreviewForEditor,
  registerEditorTransportStopHandler,
} from "../audio/audioEngine";

/** Minimum ms between live playback reschedule operations inside refresh(). */
const MIN_REFRESH_INTERVAL_MS = 80;

export interface MidiPlaybackTrack {
  id?: string;
  notes: MidiNoteEvent[];
  muted?: boolean;
  soloed?: boolean;
  instrument?: TrackInstrument;
}

export interface MidiPlaybackOptions {
  bpm?: number;
  loopRegion?: LoopRegion;
  /** When set, source audio is synced to Tone.Transport with MIDI (comparison A/B). */
  syncedPlayer?: Player | null;
}

export interface UseMidiPlaybackReturn {
  isPlaying: boolean;
  isPaused: boolean;
  /** Clip-relative seconds (0 = first note). */
  currentTime: number;
  metronomeEnabled: boolean;
  play: (
    tracksOrNotes: MidiPlaybackTrack[] | MidiNoteEvent[],
    options?: MidiPlaybackOptions,
  ) => void;
  /** Re-schedule audible notes from the current transport position. */
  refresh: (
    tracksOrNotes: MidiPlaybackTrack[] | MidiNoteEvent[],
    options?: MidiPlaybackOptions,
  ) => void;
  pause: () => void;
  stop: () => void;
  /** Seek to absolute timeline seconds (adds clip offset internally). */
  seek: (absoluteTime: number) => void;
  toggleMetronome: () => void;
  setMetronomeEnabled: (enabled: boolean) => void;
  isSupported: boolean;
}

const checkAudioSupport = (): boolean => {
  if (typeof window === "undefined") return false;
  return !!(
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext
  );
};

function normalizeTracks(
  input: MidiPlaybackTrack[] | MidiNoteEvent[],
): MidiPlaybackTrack[] {
  if (input.length === 0) return [];
  const first = input[0];
  if ("notes" in first && Array.isArray((first as MidiPlaybackTrack).notes)) {
    return input as MidiPlaybackTrack[];
  }
  return [{ notes: input as MidiNoteEvent[] }];
}

function flattenAudibleNotes(tracks: MidiPlaybackTrack[]): MidiNoteEvent[] {
  const hasSolo = tracks.some((t) => t.soloed);
  const audible: MidiNoteEvent[] = [];
  for (const track of tracks) {
    if (hasSolo && !track.soloed) continue;
    if (!hasSolo && track.muted) continue;
    audible.push(
      ...track.notes.filter(
        (note) => !(note as MidiNoteEvent & { muted?: boolean }).muted,
      ),
    );
  }
  return audible;
}

function clipBounds(notes: MidiNoteEvent[]): {
  clipOffset: number;
  duration: number;
} {
  if (!notes.length) return { clipOffset: 0, duration: 0 };
  const clipOffset = Math.min(...notes.map((n) => n.start));
  const maxEnd = Math.max(...notes.map((n) => n.start + n.duration));
  return { clipOffset, duration: Math.max(maxEnd - clipOffset, 0.01) };
}

function noteInLoop(
  note: MidiNoteEvent,
  loop: LoopRegion | undefined,
): boolean {
  if (!loop?.enabled || loop.end <= loop.start) return true;
  return note.start >= loop.start && note.start < loop.end;
}

export function useMidiPlayback(): UseMidiPlaybackReturn {
  const { getSynth, releaseAll, disposeAll } = useMidiInstruments();
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
  const playbackStartRelativeRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  const clipOffsetRef = useRef<number>(0);
  const scheduledEventsRef = useRef<number[]>([]);
  const metronomeEnabledRef = useRef(false);
  const pausedPositionRef = useRef<number>(0);
  const loopRegionRef = useRef<LoopRegion | undefined>(undefined);
  const isPausedRef = useRef(false);
  const tracksRef = useRef<MidiPlaybackTrack[]>([]);
  const bpmRef = useRef(120);
  const isPlayingRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRefreshRef = useRef<{
    tracks: MidiPlaybackTrack[];
    options?: MidiPlaybackOptions;
  } | null>(null);
  const syncedPlayerRef = useRef<Player | null>(null);

  const detachSyncedPlayer = useCallback(() => {
    const player = syncedPlayerRef.current;
    if (!player) return;
    player.stop();
    player.unsync();
  }, []);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    pendingRefreshRef.current = null;
  }, []);

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

  const ensureDefaultSynth = useCallback(async () => {
    await Tone.start();
    if (!synthRef.current) {
      synthRef.current = await getSynth("default", "piano");
    }
    return synthRef.current;
  }, [getSynth]);

  const scheduleMetronome = useCallback(
    (bpm: number, relativeStart: number, playDuration: number) => {
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
      const transport = Tone.getTransport();
      const clipOffset = clipOffsetRef.current;
      const startBeat = Math.floor((relativeStart + clipOffset) / beatSec);
      const endBeat =
        Math.ceil((relativeStart + playDuration + clipOffset) / beatSec) + 1;
      for (let i = startBeat; i <= endBeat; i++) {
        const absTime = i * beatSec;
        const relTime = absTime - clipOffset - relativeStart;
        if (relTime < 0) continue;
        const accent = i % 4 === 0;
        const eventId = transport.schedule((time: number) => {
          clickSynthRef.current?.triggerAttackRelease(
            accent ? "C5" : "G4",
            "32n",
            time,
            accent ? 0.8 : 0.5,
          );
        }, relTime);
        scheduledEventsRef.current.push(eventId);
      }
    },
    [],
  );

  const scheduleNotesFromRef = useRef<
    (relativeStart: number, onEnd: () => void) => Promise<void>
  >(async () => {});

  const scheduleNotesFrom = useCallback(
    async (relativeStart: number, onEnd: () => void) => {
      const transport = Tone.getTransport();
      const tracks = tracksRef.current;
      const loop = loopRegionRef.current;
      const clipOffset = clipOffsetRef.current;
      const duration = durationRef.current;
      const loopEnabled = loop?.enabled && loop.end > loop.start;
      const loopStartRel = loopEnabled ? loop.start - clipOffset : 0;
      const loopEndRel = loopEnabled ? loop.end - clipOffset : duration;
      const playEnd = loopEnabled ? loopEndRel : duration;

      const hasSolo = tracks.some((t) => t.soloed);
      const eventIds: number[] = [];

      for (const track of tracks) {
        if (hasSolo && !track.soloed) continue;
        if (!hasSolo && track.muted) continue;
        const instrument = track.instrument ?? "piano";
        const trackKey = track.id ?? `track-${instrument}`;
        const synth = await getSynth(trackKey, instrument);
        for (const note of track.notes) {
          if ((note as MidiNoteEvent & { muted?: boolean }).muted) continue;
          if (!noteInLoop(note, loop)) continue;
          const relStart = note.start - clipOffset;
          const scheduleAt = relStart - relativeStart;
          if (scheduleAt < -0.001) continue;
          const freq = Tone.Frequency(note.pitch, "midi").toFrequency();
          const dur = Math.max(note.duration, 0.01);
          const vel = Math.max(0.1, Math.min(1, note.velocity));
          const eventId = transport.schedule((time: number) => {
            synth.triggerAttackRelease(freq, dur, time, vel);
          }, scheduleAt);
          eventIds.push(eventId);
        }
      }
      scheduledEventsRef.current.push(...eventIds);

      scheduleMetronome(bpmRef.current, relativeStart, playEnd - relativeStart);

      if (loopEnabled) {
        const loopEventId = transport.schedule(
          () => {
            if (!isPlayingRef.current || isPausedRef.current) return;
            clearScheduled();
            releaseAll();
            playbackStartRelativeRef.current = loopStartRel;
            startTimeRef.current = Tone.now();
            setCurrentTime(loopStartRel);
            void scheduleNotesFromRef.current(loopStartRel, onEnd);
          },
          playEnd - relativeStart + 0.001,
        );
        scheduledEventsRef.current.push(loopEventId);
      } else {
        const endEventId = transport.schedule(
          () => {
            onEnd();
          },
          playEnd - relativeStart + 0.05,
        );
        scheduledEventsRef.current.push(endEventId);
      }
    },
    [clearScheduled, scheduleMetronome, getSynth, releaseAll],
  );

  useEffect(() => {
    scheduleNotesFromRef.current = scheduleNotesFrom;
  }, [scheduleNotesFrom]);

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const updatePlayhead = useCallback(() => {
    const tick = () => {
      if (isPausedRef.current || !isPlayingRef.current) return;
      const elapsed = Tone.now() - startTimeRef.current;
      let relPos = playbackStartRelativeRef.current + elapsed;
      const loop = loopRegionRef.current;
      const clipOffset = clipOffsetRef.current;

      if (loop?.enabled && loop.end > loop.start) {
        const loopStartRel = loop.start - clipOffset;
        const loopEndRel = loop.end - clipOffset;
        if (relPos >= loopEndRel) {
          relPos = loopStartRel;
        }
      } else if (relPos >= durationRef.current) {
        setCurrentTime(durationRef.current);
        return;
      }

      setCurrentTime(Math.max(0, relPos));
      rafRef.current = requestAnimationFrame(tick);
    };
    stopRaf();
    rafRef.current = requestAnimationFrame(tick);
  }, [stopRaf]);

  const stop = useCallback(() => {
    clearRefreshTimer();
    stopRaf();
    clearScheduled();
    detachSyncedPlayer();
    Tone.getTransport().stop();
    Tone.getTransport().position = 0;
    releaseAll();
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentTime(0);
    isPausedRef.current = false;
    pausedPositionRef.current = 0;
    playbackStartRelativeRef.current = 0;
    lastRefreshAtRef.current = 0;
  }, [clearRefreshTimer, clearScheduled, stopRaf, releaseAll, detachSyncedPlayer]);

  const pause = useCallback(() => {
    if (!isPlayingRef.current || isPausedRef.current) return;
    clearRefreshTimer();
    clearScheduled();
    detachSyncedPlayer();
    Tone.getTransport().stop();
    releaseAll();
    stopRaf();
    const elapsed = Tone.now() - startTimeRef.current;
    const relPos = playbackStartRelativeRef.current + elapsed;
    pausedPositionRef.current = relPos;
    setCurrentTime(relPos);
    isPausedRef.current = true;
    isPlayingRef.current = false;
    setIsPaused(true);
    setIsPlaying(false);
  }, [clearRefreshTimer, clearScheduled, stopRaf, releaseAll, detachSyncedPlayer]);

  const startSyncedAudioAt = useCallback((relativeStart: number) => {
    const player = syncedPlayerRef.current;
    if (!player?.loaded) return;
    player.stop();
    player.unsync();
    player.sync();
    player.start(0, relativeStart);
  }, []);

  const startPlaybackAt = useCallback(
    async (relativeStart: number) => {
      const notes = flattenAudibleNotes(tracksRef.current);
      if (!notes.length) return;

      const { clipOffset, duration } = clipBounds(notes);
      clipOffsetRef.current = clipOffset;
      durationRef.current = duration;
      playbackStartRelativeRef.current = relativeStart;

      await ensureDefaultSynth();
      pausePreviewForEditor();
      clearScheduled();
      Tone.getTransport().stop();
      Tone.getTransport().position = 0;
      releaseAll();

      const transport = Tone.getTransport();
      transport.bpm.value = bpmRef.current;

      await scheduleNotesFrom(relativeStart, () => {
        stop();
      });

      transport.start();
      startSyncedAudioAt(relativeStart);
      startTimeRef.current = Tone.now();
      isPausedRef.current = false;
      isPlayingRef.current = true;
      setIsPaused(false);
      setIsPlaying(true);
      setCurrentTime(relativeStart);
      updatePlayhead();
    },
    [
      clearScheduled,
      ensureDefaultSynth,
      scheduleNotesFrom,
      stop,
      updatePlayhead,
      releaseAll,
      startSyncedAudioAt,
    ],
  );

  const getCurrentRelativePosition = useCallback((): number => {
    if (isPausedRef.current) return pausedPositionRef.current;
    const elapsed = Tone.now() - startTimeRef.current;
    const relative = playbackStartRelativeRef.current + elapsed;
    return Math.max(0, Math.min(relative, durationRef.current));
  }, []);

  const performRefresh = useCallback(
    (
      tracks: MidiPlaybackTrack[],
      options?: MidiPlaybackOptions,
    ) => {
      const notes = flattenAudibleNotes(tracks);
      if (!notes.length) return;

      tracksRef.current = tracks;
      if (options?.bpm !== undefined) bpmRef.current = options.bpm;
      if (options?.loopRegion !== undefined) {
        loopRegionRef.current = options.loopRegion;
      }

      if (isPausedRef.current) {
        pausedPositionRef.current = getCurrentRelativePosition();
        return;
      }

      const resumePos = getCurrentRelativePosition();

      clearScheduled();
      releaseAll();
      playbackStartRelativeRef.current = resumePos;
      startTimeRef.current = Tone.now();
      setCurrentTime(resumePos);

      void scheduleNotesFromRef.current(resumePos, () => {
        stop();
      });
      startSyncedAudioAt(resumePos);
    },
    [clearScheduled, getCurrentRelativePosition, releaseAll, stop, startSyncedAudioAt],
  );

  const seek = useCallback(
    (absoluteTime: number) => {
      const notes = flattenAudibleNotes(tracksRef.current);
      const { clipOffset, duration } = clipBounds(notes);
      clipOffsetRef.current = clipOffset;
      durationRef.current = duration;

      const relative = Math.max(
        0,
        Math.min(absoluteTime - clipOffset, duration),
      );
      pausedPositionRef.current = relative;
      setCurrentTime(relative);

      if (isPlayingRef.current || isPausedRef.current) {
        void startPlaybackAt(relative);
      }
    },
    [startPlaybackAt],
  );

  const play = useCallback(
    (
      tracksOrNotes: MidiPlaybackTrack[] | MidiNoteEvent[],
      options?: MidiPlaybackOptions,
    ) => {
      if (!isSupported) return;

      const tracks = normalizeTracks(tracksOrNotes);
      const notes = flattenAudibleNotes(tracks);
      if (!notes.length) return;

      const wasPaused = isPausedRef.current;
      const resumePos = wasPaused ? pausedPositionRef.current : 0;

      if (!wasPaused) {
        stopRaf();
        clearScheduled();
        Tone.getTransport().stop();
        releaseAll();
        isPlayingRef.current = false;
        setIsPlaying(false);
        setIsPaused(false);
        playbackStartRelativeRef.current = 0;
        pausedPositionRef.current = 0;
      }

      tracksRef.current = tracks;
      bpmRef.current = options?.bpm ?? 120;
      loopRegionRef.current = options?.loopRegion;
      syncedPlayerRef.current = options?.syncedPlayer ?? null;

      const startPos = wasPaused
        ? resumePos
        : currentTime > 0 && !isPlayingRef.current
          ? currentTime
          : 0;
      void startPlaybackAt(startPos);
    },
    [
      isSupported,
      stopRaf,
      clearScheduled,
      startPlaybackAt,
      currentTime,
      releaseAll,
    ],
  );

  const refresh = useCallback(
    (
      tracksOrNotes: MidiPlaybackTrack[] | MidiNoteEvent[],
      options?: MidiPlaybackOptions,
    ) => {
      if (!isPlayingRef.current && !isPausedRef.current) return;

      const tracks = normalizeTracks(tracksOrNotes);
      const notes = flattenAudibleNotes(tracks);
      if (!notes.length) return;

      pendingRefreshRef.current = { tracks, options };

      if (isPausedRef.current) {
        clearRefreshTimer();
        performRefresh(tracks, options);
        return;
      }

      const now = performance.now();
      const elapsed = now - lastRefreshAtRef.current;

      if (elapsed >= MIN_REFRESH_INTERVAL_MS) {
        clearRefreshTimer();
        lastRefreshAtRef.current = now;
        performRefresh(tracks, options);
        return;
      }

      if (refreshTimerRef.current !== null) return;

      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        const pending = pendingRefreshRef.current;
        pendingRefreshRef.current = null;
        if (!pending) return;
        if (!isPlayingRef.current || isPausedRef.current) return;

        lastRefreshAtRef.current = performance.now();
        performRefresh(pending.tracks, pending.options);
      }, MIN_REFRESH_INTERVAL_MS - elapsed);
    },
    [clearRefreshTimer, performRefresh],
  );

  useEffect(() => {
    registerEditorTransportStopHandler(() => {
      stop();
    });
    return () => {
      registerEditorTransportStopHandler(null);
      clearRefreshTimer();
      stopRaf();
      clearScheduled();
      Tone.getTransport().stop();
      Tone.getTransport().position = 0;
      disposeAll();
      synthRef.current = null;
      if (clickSynthRef.current) {
        clickSynthRef.current.dispose();
        clickSynthRef.current = null;
      }
    };
  }, [clearRefreshTimer, clearScheduled, stopRaf, disposeAll, stop]);

  return {
    isPlaying,
    isPaused,
    currentTime,
    metronomeEnabled,
    play,
    refresh,
    pause,
    stop,
    seek,
    toggleMetronome,
    setMetronomeEnabled,
    isSupported,
  };
}
