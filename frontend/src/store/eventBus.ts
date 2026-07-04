import { useEffect, useRef } from "react";
import { create } from "zustand";

export type AppEvent =
  | "open-pricing"
  | "open-feedback"
  | "open-onboarding"
  | "open-editor-onboarding";

interface EventBusState {
  /** Incremented each time an event fires — subscribers react to the change. */
  signals: Record<AppEvent, number>;
  emit: (event: AppEvent) => void;
}

export const useEventBus = create<EventBusState>((set) => ({
  signals: {
    "open-pricing": 0,
    "open-feedback": 0,
    "open-onboarding": 0,
    "open-editor-onboarding": 0,
  },
  emit: (event) =>
    set((state) => ({
      signals: { ...state.signals, [event]: state.signals[event] + 1 },
    })),
}));

/**
 * Hook to subscribe to a specific app event. Calls `handler` each time the event fires.
 * Uses a signal counter to detect new emissions without stale closure issues.
 */
export function useAppEvent(event: AppEvent, handler: () => void): void {
  const signal = useEventBus((s) => s.signals[event]);
  const handlerRef = useRef(handler);

  // Keep the handler ref fresh without updating during render
  useEffect(() => {
    handlerRef.current = handler;
  });

  const prevSignalRef = useRef(signal);
  useEffect(() => {
    if (signal !== prevSignalRef.current) {
      prevSignalRef.current = signal;
      handlerRef.current();
    }
  }, [signal]);
}
