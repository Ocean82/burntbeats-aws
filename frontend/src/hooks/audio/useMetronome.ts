import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "../../store/appStore";

const COUNT_IN_BARS: Record<string, number> = {
  off: 0,
  "1bar": 4,
  "2bars": 8,
  "4bars": 16,
};

function scheduleClick(ctx: AudioContext, time: number, gain: number) {
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
}

export function useMetronome(
  audioContextRef: React.MutableRefObject<AudioContext | null>,
) {
  const metronomeEnabled = useAppStore((s) => s.metronomeEnabled);
  const countIn = useAppStore((s) => s.countIn);
  const globalBpm = useAppStore((s) => s.globalBpm);

  const nextBeatTimeRef = useRef(0);
  const beatCountRef = useRef(0);
  const timerIdRef = useRef<number | null>(null);
  const bpmRef = useRef(globalBpm);
  const scheduleFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    bpmRef.current = globalBpm;
  }, [globalBpm]);

  const stopMetronome = useCallback(() => {
    if (timerIdRef.current !== null) {
      clearTimeout(timerIdRef.current);
      timerIdRef.current = null;
    }
  }, []);

  const schedulerLoop = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    const bpm = bpmRef.current;
    const beatDuration = 60 / bpm;
    const lookAheadSec = 0.1;
    const scheduleIntervalMs = 25;

    while (nextBeatTimeRef.current < ctx.currentTime + lookAheadSec) {
      const isDownbeat = beatCountRef.current % 4 === 0;
      const gain = isDownbeat ? 0.5 : 0.25;
      scheduleClick(ctx, nextBeatTimeRef.current, gain);
      nextBeatTimeRef.current += beatDuration;
      beatCountRef.current++;
    }

    const timeToNext = (nextBeatTimeRef.current - ctx.currentTime) * 1000;
    timerIdRef.current = window.setTimeout(
      () => scheduleFnRef.current?.(),
      Math.min(scheduleIntervalMs, timeToNext - 50),
    );
  }, [audioContextRef]);

  useEffect(() => {
    scheduleFnRef.current = schedulerLoop;
  }, [schedulerLoop]);

  const startMetronome = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx || !metronomeEnabled) return;
    nextBeatTimeRef.current = ctx.currentTime;
    beatCountRef.current = 0;
    schedulerLoop();
  }, [audioContextRef, metronomeEnabled, schedulerLoop]);

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
