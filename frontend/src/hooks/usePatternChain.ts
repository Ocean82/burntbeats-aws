/**
 * usePatternChain — arrange and export multi-bar pattern chains.
 *
 * A "chain" is an ordered list of `{ preset, repeatCount }` entries.
 * Each entry represents a pattern that plays for N consecutive bars
 * before the chain advances to the next entry.
 *
 * This hook is UI-agnostic: it owns state and mutations only.
 */

import { useCallback, useMemo, useState } from "react";
import type { BeatPreset } from "./useBeatMaker";

export interface ChainEntry {
  id: string;
  preset: BeatPreset;
  repeatCount: number;
}

export interface UsePatternChainReturn {
  chain: ChainEntry[];
  addToChain: (preset: BeatPreset) => void;
  removeFromChain: (id: string) => void;
  moveUp: (id: string) => void;
  moveDown: (id: string) => void;
  setRepeat: (id: string, repeatCount: number) => void;
  clearChain: () => void;
  totalBars: number;
  totalSteps: number;
  /** Flatten the chain into a single pattern repeated for export. */
  exportFlattened: () => { pattern: import("../audio/types").VelocityPattern; steps: number; bpm: number; swing: number };
}

export function usePatternChain(
  options: { maxEntries?: number } = {},
): UsePatternChainReturn {
  const { maxEntries = 32 } = options;

  const [chain, setChain] = useState<ChainEntry[]>([]);

  const addToChain = useCallback((preset: BeatPreset) => {
    setChain((prev) => {
      if (prev.length >= maxEntries) return prev;
      const entry: ChainEntry = {
        id: `chain_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        preset: { ...preset, pattern: preset.pattern.map((r) => [...r]) },
        repeatCount: 1,
      };
      return [...prev, entry];
    });
  }, [maxEntries]);

  const removeFromChain = useCallback((id: string) => {
    setChain((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const moveUp = useCallback((id: string) => {
    setChain((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((id: string) => {
    setChain((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  const setRepeat = useCallback((id: string, repeatCount: number) => {
    setChain((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, repeatCount: Math.max(1, Math.min(16, repeatCount)) } : c,
      ),
    );
  }, []);

  const clearChain = useCallback(() => setChain([]), []);

  const { totalBars, totalSteps } = useMemo(() => {
    let bars = 0;
    let steps = 0;
    chain.forEach((entry) => {
      bars += entry.repeatCount * Math.ceil(entry.preset.steps / 16);
      steps = entry.preset.steps;
    });
    return { totalBars: bars, totalSteps: steps };
  }, [chain]);

  const exportFlattened = useCallback(() => {
    if (chain.length === 0) {
      return {
        pattern: [] as import("../audio/types").VelocityPattern,
        steps: 16,
        bpm: 120,
        swing: 0,
      };
    }

    const rows = chain[0].preset.pattern.length;
    const stepsPerPattern = chain[0].preset.steps;
    const bpmVal = chain[0].preset.bpm;
    const swingVal = chain[0].preset.swing ?? 0;

    const totalPatterns = chain.reduce((sum, entry) => sum + entry.repeatCount, 0);
    const flattened: import("../audio/types").VelocityPattern = Array.from(
      { length: rows },
      () => Array(stepsPerPattern * totalPatterns).fill(0),
    );

    let offset = 0;
    chain.forEach((entry) => {
      for (let r = 0; r < entry.repeatCount; r++) {
        for (let row = 0; row < rows; row++) {
          for (let step = 0; step < entry.preset.steps; step++) {
            const srcIdx = step;
            const dstIdx = offset + step;
            flattened[row][dstIdx] = entry.preset.pattern[row][srcIdx];
          }
        }
        offset += entry.preset.steps;
      }
    });

    return {
      pattern: flattened,
      steps: stepsPerPattern * totalPatterns,
      bpm: bpmVal,
      swing: swingVal,
    };
  }, [chain]);

  return {
    chain,
    addToChain,
    removeFromChain,
    moveUp,
    moveDown,
    setRepeat,
    clearChain,
    totalBars,
    totalSteps,
    exportFlattened,
  };
}
