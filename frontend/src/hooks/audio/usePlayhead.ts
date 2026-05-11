/**
 * usePlayhead — playhead position tracking via requestAnimationFrame.
 *
 * Manages the 0–100 progress value, subscription-based listeners (avoids re-renders),
 * and the animation frame lifecycle for both mix and preview playback.
 */
import { useCallback, useRef } from "react";
import { createPlayheadTracker } from "../../utils/playheadTracker";

export interface UsePlayheadReturn {
  /** Current playhead position (0–100). Read via ref for perf. */
  playheadPositionRef: React.MutableRefObject<number>;
  /** Get current playhead position (stable callback). */
  getPlayheadPosition: () => number;
  /** Subscribe to playhead position changes (returns unsubscribe fn). */
  subscribePlayheadPosition: (listener: () => void) => () => void;
  /** Emit a new playhead position to all subscribers. */
  emitPlayheadPosition: (next: number) => void;
  /** Cancel the current playhead animation frame tracker. */
  cancelPlayheadTracker: () => void;
  /** Start a new playhead tracker for a given context/duration/startTime. */
  startPlayheadTracker: (
    context: AudioContext,
    duration: number,
    startTime: number,
    isActive: () => boolean,
  ) => void;
}

export function usePlayhead(): UsePlayheadReturn {
  const playheadPositionRef = useRef<number>(0);
  const playheadListenersRef = useRef<Set<() => void>>(new Set());
  const playheadIntervalRef = useRef<number | null>(null);
  const playheadTrackerStopRef = useRef<(() => void) | null>(null);

  const emitPlayheadPosition = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(100, next));
    if (Math.abs(playheadPositionRef.current - clamped) < 0.001) return;
    playheadPositionRef.current = clamped;
    playheadListenersRef.current.forEach((listener) => listener());
  }, []);

  const subscribePlayheadPosition = useCallback((listener: () => void) => {
    playheadListenersRef.current.add(listener);
    return () => {
      playheadListenersRef.current.delete(listener);
    };
  }, []);

  const getPlayheadPosition = useCallback(
    () => playheadPositionRef.current,
    [],
  );

  const cancelPlayheadTracker = useCallback(() => {
    playheadTrackerStopRef.current?.();
    playheadTrackerStopRef.current = null;
    if (playheadIntervalRef.current !== null) {
      cancelAnimationFrame(playheadIntervalRef.current);
      playheadIntervalRef.current = null;
    }
  }, []);

  const startPlayheadTracker = useCallback(
    (
      context: AudioContext,
      duration: number,
      startTime: number,
      isActive: () => boolean,
    ) => {
      cancelPlayheadTracker();
      const tracker = createPlayheadTracker({
        context,
        duration,
        startTime,
        onUpdate: emitPlayheadPosition,
        isActive,
      });
      playheadTrackerStopRef.current = tracker.stop;
      playheadIntervalRef.current = tracker.start();
    },
    [cancelPlayheadTracker, emitPlayheadPosition],
  );

  return {
    playheadPositionRef,
    getPlayheadPosition,
    subscribePlayheadPosition,
    emitPlayheadPosition,
    cancelPlayheadTracker,
    startPlayheadTracker,
  };
}
