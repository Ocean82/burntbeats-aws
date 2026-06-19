import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "../../store/appStore";

const COUNT_IN_BARS: Record<string, number> = {
  off: 0,
  "1bar": 4,
  "2bars": 8,
  "4bars": 16,
};

/**
 * useMetronome — metronome click track scheduled via AudioContext.
 * Produces a short click sound at the given BPM, with optional count-in.
 */
export function useMetronome(
  audioContextRef: React.MutableRefObject<AudioContext | null>,
) {
  const metronomeEnabled = useAppStore((s) => s.metronomeEnabled);
  const countIn = useAppStore((s) => s.countIn);
  const globalBpm = useAppStore((s) => s.globalBpm);

  const metronomeNodesRef = useRef<{
    nextBeatTime: number;
    beatCount: number;
    timerId: number | null;
  }>({ nextBeatTime: 0, beatCount: 0, timerId: null });

  const scheduledBeatsRef = useRef<
    Array<{ time: number; gain: number }>
  >([]);

  const stopMetronome = useCallback(() => {
    const state = metronomeNodesRef.current;
    if (state.timerId !== null) {
      clearTimeout(state.timerId);
      state.timerId = null;
    }
    scheduledBeatsRef.current = [];
  }, []);

  const scheduleClick = useCallback(
    (ctx: AudioContext, time: number, gain: number) => {
      const osc = ctx.createOscillator();
      const clickGain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = gain > 0.5 ? 1000 : 800;
      clickGain.gain.setValueAtTime(gain, time);
      clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      osc.connect(clickGain);
      clickGain.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + 0.05);
    },
    [],
  );

  const schedulerRef = useCallback(
    (ctx: AudioContext, lookAheadSec: number, scheduleIntervalMs: number) => {
      const state = metronomeNodesRef.current;
      const bpm = globalBpm;
      const beatDuration = 60 / bpm;

      while (state.nextBeatTime < ctx.currentTime + lookAheadSec) {
        const isDownbeat = state.beatCount % 4 === 0;
        const gain = isDownbeat ? 0.5 : 0.25;
        scheduleClick(ctx, state.nextBeatTime, gain);
        scheduledBeatsRef.current.push({
          time: state.nextBeatTime,
          gain,
        });
        state.nextBeatTime += beatDuration;
        state.beatCount++;
      }

      const timeToNext =
        (state.nextBeatTime - ctx.currentTime) * 1000;
      state.timerId = window.setTimeout(
        () => schedulerRef(ctx, lookAheadSec, scheduleIntervalMs),
        Math.min(scheduleIntervalMs, timeToNext - 50),
      );
    },
    [globalBpm, scheduleClick],
  );

  const startMetronome = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx || !metronomeEnabled) return;
    const state = metronomeNodesRef.current;
    state.nextBeatTime = ctx.currentTime;
    state.beatCount = 0;
    schedulerRef(ctx, 0.1, 25);
  }, [audioContextRef, metronomeEnabled, schedulerRef]);

  const getCountInBeats = useCallback(() => {
    return COUNT_IN_BARS[countIn] ?? 0;
  }, [countIn]);

  useEffect(() => {
    return () => {
      stopMetronome();
    };
  }, [stopMetronome]);

  return {
    startMetronome,
    stopMetronome,
    getCountInBeats,
    metronomeEnabled,
  };
}
