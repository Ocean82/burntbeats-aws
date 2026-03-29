import { useState, useEffect, useCallback } from "react";

export type GuidanceTarget = "source" | "mixer" | "none";

const GREEN_RING_BASE = "ring-2 ring-emerald-300/40 ring-offset-1 ring-offset-black/30 shadow-[0_0_16px_rgba(52,211,153,0.12)]";
const GREEN_RING_PULSE = `${GREEN_RING_BASE} animate-pulse`;

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

  const handlePanelInteract = useCallback(() => {
    if (guidanceTarget === "source") {
      setPulseOff((p) => (p.source ? p : { ...p, source: true }));
    } else if (guidanceTarget === "mixer") {
      setPulseOff((p) => (p.mixer ? p : { ...p, mixer: true }));
    }
  }, [guidanceTarget]);

  const isActive = guidanceTarget === "source" || guidanceTarget === "mixer";
  const isPulsing = isActive && !pulseOff[guidanceTarget as "source" | "mixer"];
  const ringClass = isActive ? (isPulsing ? GREEN_RING_PULSE : GREEN_RING_BASE) : "";

  return { guidanceTarget, ringClass, handlePanelInteract };
}
