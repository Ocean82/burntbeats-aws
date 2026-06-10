import { useCallback, useEffect, useState } from "react";
import type { AppPhase, PhaseController } from "@/types/phases";

/** Key used in sessionStorage to persist split results. */
const SPLIT_RESULT_KEY = "burnt-beats-split-result";

/**
 * Manages the AppPhase state machine.
 *
 * On mount, checks sessionStorage for a prior split result:
 * - If found → initial phase is "workspace"
 * - Otherwise → initial phase is "upload"
 *
 * reset() first clears stem data from sessionStorage. Only if clearing
 * succeeds does it transition to "upload". If clearing fails, it remains
 * in "workspace" and sets an error message.
 */
export function usePhaseController(): PhaseController {
  const [phase, setPhase] = useState<AppPhase>(() => {
    try {
      const stored = sessionStorage.getItem(SPLIT_RESULT_KEY);
      return stored ? "workspace" : "upload";
    } catch {
      return "upload";
    }
  });

  const [error, setError] = useState<string | null>(null);

  // Re-check sessionStorage on mount (handles SSR hydration edge case)
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SPLIT_RESULT_KEY);
      if (stored) {
        setPhase("workspace");
      }
    } catch {
      // sessionStorage unavailable — stay in current phase
    }
  }, []);

  const transitionTo = useCallback((next: AppPhase) => {
    setError(null);
    setPhase(next);
  }, []);

  const reset = useCallback(() => {
    try {
      sessionStorage.removeItem(SPLIT_RESULT_KEY);
      setError(null);
      setPhase("upload");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to clear stem data";
      setError(message);
      // Remain in "workspace" — do not transition
    }
  }, []);

  return { phase, transitionTo, reset, error, setError };
}
