import { useState, useEffect, useCallback } from "react";

export type GuidanceTarget = "source" | "mixer" | "none";

const GUIDANCE_CUE_BASE = "guidance-cue";
const GUIDANCE_CUE_PULSE = `${GUIDANCE_CUE_BASE} guidance-cue-pulse`;

export interface UseGuidanceSystemReturn {
  guidanceTarget: GuidanceTarget;
  ringClass: string;
  handlePanelInteract: () => void;
}

interface GuidanceState {
  splitError: string | null;
  isSplitting: boolean;
  isExpanding: boolean;
  isLoadingStems: boolean;
  splitResultStemsLength: number;
  mixStemsLength: number;
}

/**
 * Determines which panel to highlight with a guidance ring based on app state.
 */
export function useGuidanceSystem(state: GuidanceState): UseGuidanceSystemReturn {
  const { splitError, isSplitting, isExpanding, isLoadingStems, splitResultStemsLength, mixStemsLength } = state;

  const guidanceTarget: GuidanceTarget = (() => {
    if (splitError) return "source";
    if (isSplitting || isExpanding) return "none";
    if (isLoadingStems) return "none";
    if (splitResultStemsLength === 2) return "source";
    if (mixStemsLength > 0) return "mixer";
    return "source";
  })();

  const [pulseOff, setPulseOff] = useState<{ source: boolean; mixer: boolean }>({
    source: false,
    mixer: false,
  });

  // Reset pulse when guidance target changes
  useEffect(() => {
    setPulseOff({ source: false, mixer: false });
  }, [guidanceTarget]);

  // Keep attention cue brief: nudge once, then settle to a subtle static state.
  useEffect(() => {
    if (!(guidanceTarget === "source" || guidanceTarget === "mixer")) return;
    const key = guidanceTarget;
    if (pulseOff[key]) return;
    const timer = window.setTimeout(() => {
      setPulseOff((p) => (p[key] ? p : { ...p, [key]: true }));
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [guidanceTarget, pulseOff]);

  const handlePanelInteract = useCallback(() => {
    if (guidanceTarget === "source") {
      setPulseOff((p) => (p.source ? p : { ...p, source: true }));
    } else if (guidanceTarget === "mixer") {
      setPulseOff((p) => (p.mixer ? p : { ...p, mixer: true }));
    }
  }, [guidanceTarget]);

  const isActive = guidanceTarget === "source" || guidanceTarget === "mixer";
  const isPulsing = isActive && !pulseOff[guidanceTarget as "source" | "mixer"];
  const ringClass = isActive ? (isPulsing ? GUIDANCE_CUE_PULSE : GUIDANCE_CUE_BASE) : "";

  return { guidanceTarget, ringClass, handlePanelInteract };
}
