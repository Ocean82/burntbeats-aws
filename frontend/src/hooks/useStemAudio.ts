/**
 * useStemAudio — manages stem AudioBuffers, waveform data, and loading state.
 * Extracted from App.tsx to keep audio data management separate from UI.
 */
import { useCallback, useEffect, useState } from "react";
import type { StemResult } from "../types";
import { computeWaveformFromBuffer } from "../utils/audio";
import { getStemWaveform, setStemWaveform } from "../services/waveformCache";

const WAVEFORM_BINS = 512;

interface UseStemAudioReturn {
  stemBuffers: Record<string, AudioBuffer>;
  stemWaveforms: Record<string, number[]>;
  loadedTracks: Record<string, boolean>;
  isLoadingStems: boolean;
  loadError: string | null;
  setStemBuffers: React.Dispatch<React.SetStateAction<Record<string, AudioBuffer>>>;
  loadStemsIntoBuffers: (
    splitResultStems: StemResult[],
    audioContextRef: React.MutableRefObject<AudioContext | null>,
    onInitStemStates: (ids: string[]) => void
  ) => Promise<void>;
  clearStemData: () => void;
  clearLoadError: () => void;
}

export function useStemAudio(): UseStemAudioReturn {
  const [stemBuffers, setStemBuffers] = useState<Record<string, AudioBuffer>>({});
  const [stemWaveforms, setStemWaveforms] = useState<Record<string, number[]>>({});
  const [loadedTracks, setLoadedTracks] = useState<Record<string, boolean>>({});
  const [isLoadingStems, setIsLoadingStems] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadStemsIntoBuffers = useCallback(async (
    splitResultStems: StemResult[],
    audioContextRef: React.MutableRefObject<AudioContext | null>,
    onInitStemStates: (ids: string[]) => void
  ) => {
    // Reset any previous load error
    setLoadError(null);
    if (splitResultStems.length === 0) return;
    setIsLoadingStems(true);

    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) { 
      setIsLoadingStems(false); 
      setLoadError("AudioContext not supported in this browser");
      return; 
    }

    if (!audioContextRef.current) audioContextRef.current = new AudioContextCtor();
    const context = audioContextRef.current;
    await context.resume();

    const newBuffers: Record<string, AudioBuffer> = {};
    const newLoaded: Record<string, boolean> = {};

    const stemsToLoad = splitResultStems.filter((s) => !stemBuffers[s.id]);
    if (stemsToLoad.length > 0) {
      try {
        const results = await Promise.all(
          stemsToLoad.map(async (stem) => {
            const res = await fetch(stem.url);
            if (!res.ok) throw new Error(`HTTP ${res.status} loading stem ${stem.id}`);
            const arr = await res.arrayBuffer();
            const buffer = await context.decodeAudioData(arr);
            return { id: stem.id, buffer };
          })
        );
        for (const { id, buffer } of results) {
          newBuffers[id] = buffer;
          newLoaded[id] = true;
        }
      } catch (e) {
        console.error("Failed to load stems:", e);
        setLoadError(e instanceof Error ? e.message : "Unknown error loading stems");
      }
    }

    // Preserve already-loaded buffers
    for (const stem of splitResultStems) {
      if (stemBuffers[stem.id]) {
        newBuffers[stem.id] = stemBuffers[stem.id];
        newLoaded[stem.id] = true;
      }
    }

    setStemBuffers((prev) => ({ ...prev, ...newBuffers }));
    setLoadedTracks((prev) => ({ ...prev, ...newLoaded }));
    onInitStemStates(splitResultStems.map((s) => s.id));
    setIsLoadingStems(false);
  }, [stemBuffers]);

  const clearStemData = useCallback(() => {
    setStemBuffers({});
    setStemWaveforms({});
    setLoadedTracks({});
  }, []);

  const clearLoadError = useCallback(() => {
    setLoadError(null);
  }, []);

  return {
    stemBuffers,
    stemWaveforms,
    loadedTracks,
    isLoadingStems,
    loadError,
    setStemBuffers,
    loadStemsIntoBuffers,
    clearStemData,
    clearLoadError,
  };
}

/**
 * useWaveformCompute — computes waveforms from AudioBuffers using idle callbacks.
 * Separated so it can run without blocking the main thread.
 */
export function useWaveformCompute(
  stemBuffers: Record<string, AudioBuffer>,
  stemEntries: Array<{ id: string; url: string }>,
  setStemWaveforms: React.Dispatch<React.SetStateAction<Record<string, number[]>>>
) {
  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(stemBuffers);
    if (entries.length === 0) return;

    const next: Record<string, number[]> = {};
    let index = 0;

    const processOne = async () => {
      if (cancelled || index >= entries.length) {
        if (!cancelled && Object.keys(next).length > 0) {
          setStemWaveforms((prev) => ({ ...prev, ...next }));
        }
        return;
      }
      const [id, buffer] = entries[index++];
      const url = stemEntries.find((s) => s.id === id)?.url;
      let data: number[] | null = url ? await getStemWaveform(url, WAVEFORM_BINS) : null;
      if (cancelled) return;
      if (!data || data.length !== WAVEFORM_BINS) {
        data = computeWaveformFromBuffer(buffer, WAVEFORM_BINS);
        if (url) void setStemWaveform(url, WAVEFORM_BINS, data);
      }
      next[id] = data;
      if (!cancelled) setStemWaveforms((prev) => ({ ...prev, [id]: data! }));
      const schedule = typeof requestIdleCallback !== "undefined"
        ? () => requestIdleCallback(() => void processOne())
        : () => setTimeout(() => void processOne(), 0);
      schedule();
    };

    const scheduleFirst = typeof requestIdleCallback !== "undefined"
      ? () => requestIdleCallback(() => void processOne())
      : () => setTimeout(() => void processOne(), 0);
    scheduleFirst();

    return () => { cancelled = true; };
  }, [stemBuffers, stemEntries, setStemWaveforms]);
}
