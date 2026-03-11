import { useState, useCallback, useRef } from "react";

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

interface UseHistoryReturn<T> {
  state: T;
  set: (newState: T | ((prev: T) => T)) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  reset: (initialState: T) => void;
  historyLength: number;
}

const MAX_HISTORY_LENGTH = 50;

export function useHistory<T>(initialState: T): UseHistoryReturn<T> {
  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initialState,
    future: [],
  });

  // Use ref to batch rapid changes (e.g., slider dragging)
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingStateRef = useRef<T | null>(null);

  const set = useCallback((newState: T | ((prev: T) => T)) => {
    setHistory((prev) => {
      const resolvedState =
        typeof newState === "function"
          ? (newState as (prev: T) => T)(prev.present)
          : newState;

      // Don't add to history if state hasn't changed
      if (JSON.stringify(resolvedState) === JSON.stringify(prev.present)) {
        return prev;
      }

      const newPast = [...prev.past, prev.present].slice(-MAX_HISTORY_LENGTH);
      return {
        past: newPast,
        present: resolvedState,
        future: [], // Clear future on new change
      };
    });
  }, []);

  // Batched set for rapid updates (sliders)
  const setBatched = useCallback((newState: T | ((prev: T) => T)) => {
    // Store pending state
    setHistory((prev) => {
      const resolvedState =
        typeof newState === "function"
          ? (newState as (prev: T) => T)(prev.present)
          : newState;
      pendingStateRef.current = resolvedState;
      return { ...prev, present: resolvedState };
    });

    // Clear existing timeout
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
    }

    // Commit to history after 300ms of inactivity
    batchTimeoutRef.current = setTimeout(() => {
      if (pendingStateRef.current !== null) {
        setHistory((prev) => ({
          past: [...prev.past, prev.present].slice(-MAX_HISTORY_LENGTH),
          present: prev.present,
          future: [],
        }));
        pendingStateRef.current = null;
      }
    }, 300);
  }, []);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;

      const previous = prev.past[prev.past.length - 1];
      const newPast = prev.past.slice(0, -1);

      return {
        past: newPast,
        present: previous,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;

      const next = prev.future[0];
      const newFuture = prev.future.slice(1);

      return {
        past: [...prev.past, prev.present],
        present: next,
        future: newFuture,
      };
    });
  }, []);

  const reset = useCallback((initialState: T) => {
    setHistory({
      past: [],
      present: initialState,
      future: [],
    });
  }, []);

  return {
    state: history.present,
    set,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    reset,
    historyLength: history.past.length,
  };
}
