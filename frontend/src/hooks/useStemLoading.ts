/**
 * useStemLoading: fetches stem WAV URLs and decodes them into AudioBuffers.
 * Manages stemBuffers, loadedTracks, and isLoadingStems state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchStemWavAsArrayBuffer } from "../api";
import { defaultStemState } from "../stem-editor-state";

interface StemEntry {
  id: string;
  url: string;
}

interface UseStemLoadingArgs {
  allStemEntries: StemEntry[];
  audioContextRef: React.MutableRefObject<AudioContext | null>;
  setStemStates: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
  setSplitError: (msg: string) => void;
}

export function useStemLoading({
  allStemEntries,
  audioContextRef,
  setStemStates,
  setSplitError,
}: UseStemLoadingArgs) {
  const [stemBuffers, setStemBuffers] = useState<Record<string, AudioBuffer>>({});
  const stemBuffersRef = useRef<Record<string, AudioBuffer>>({});
  useEffect(() => { stemBuffersRef.current = stemBuffers; }, [stemBuffers]);
  const [loadedTracks, setLoadedTracks] = useState<Record<string, boolean>>({});
  const [isLoadingStems, setIsLoadingStems] = useState(false);

  const loadStemsIntoBuffers = useCallback(async () => {
    if (allStemEntries.length === 0) return;
    setIsLoadingStems(true);
    const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      setIsLoadingStems(false);
      return;
    }
    if (!audioContextRef.current) audioContextRef.current = new Ctor();
    const ctx = audioContextRef.current;
    await ctx.resume();

    const existing = stemBuffersRef.current;
    const newBuffers: Record<string, AudioBuffer> = {};
    const newLoaded: Record<string, boolean> = {};
    const toLoad = allStemEntries.filter((e) => !existing[e.id]);

    if (toLoad.length > 0) {
      try {
        const results = await Promise.all(toLoad.map(async (stem) => {
          const ab = await fetchStemWavAsArrayBuffer(stem.url);
          const buf = await ctx.decodeAudioData(ab);
          return { id: stem.id, buf };
        }));
        for (const { id, buf } of results) {
          newBuffers[id] = buf;
          newLoaded[id] = true;
        }
      } catch (e) {
        setSplitError("Failed to load stems for playback. Please try again.");
        if (import.meta.env.DEV) console.error("Failed to load stems:", e);
      }
    }

    for (const e of allStemEntries) {
      if (existing[e.id]) {
        newBuffers[e.id] = existing[e.id];
        newLoaded[e.id] = true;
      }
    }

    setStemBuffers((p) => ({ ...p, ...newBuffers }));
    setLoadedTracks((p) => ({ ...p, ...newLoaded }));
    setStemStates((p: Record<string, unknown>) => {
      const next = { ...p };
      for (const e of allStemEntries) {
        if (!next[e.id]) next[e.id] = defaultStemState();
      }
      return next;
    });
    setIsLoadingStems(false);
  }, [allStemEntries, audioContextRef]);

  useEffect(() => {
    if (allStemEntries.length > 0) void loadStemsIntoBuffers();
  }, [allStemEntries, loadStemsIntoBuffers]);

  const clearStemLoadingState = useCallback(() => {
    setStemBuffers({});
    setLoadedTracks({});
  }, []);

  return { stemBuffers, setStemBuffers, loadedTracks, isLoadingStems, clearStemLoadingState };
}
