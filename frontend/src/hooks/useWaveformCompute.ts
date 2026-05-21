/**
 * useWaveformCompute — computes waveforms from AudioBuffers using idle callbacks.
 * Separated so it can run without blocking the main thread.
 * Invalidates IndexedDB cache when stem URL changes; prunes removed stem ids.
 */
import { useEffect } from "react";
import { computeWaveformFromBuffer } from "../utils/audio";
import { getStemWaveform, setStemWaveform } from "../services/waveformCache";

const WAVEFORM_BINS = 512;

export function useWaveformCompute(
  stemBuffers: Record<string, AudioBuffer>,
  stemEntries: Array<{ id: string; url: string }>,
  setStemWaveforms: React.Dispatch<React.SetStateAction<Record<string, number[]>>>,
) {
  useEffect(() => {
    let cancelled = false;
    const bufferIds = Object.keys(stemBuffers);
    const urlById = Object.fromEntries(
      stemEntries.map((s) => [s.id, s.url]),
    );

    setStemWaveforms((prev) => {
      const allowed = new Set(bufferIds);
      const next: Record<string, number[]> = {};
      for (const [id, data] of Object.entries(prev)) {
        if (allowed.has(id)) next[id] = data;
      }
      return next;
    });

    const entries = Object.entries(stemBuffers);
    if (entries.length === 0) return;

    let index = 0;

    const processOne = async () => {
      if (cancelled || index >= entries.length) return;
      const [id, buffer] = entries[index++];
      const url = urlById[id];
      let data: number[] | null = null;
      try {
        data = url ? await getStemWaveform(url, WAVEFORM_BINS) : null;
      } catch {
        // IndexedDB may be unavailable (private browsing, quota exceeded) — fall through to compute
      }
      if (cancelled) return;
      if (!data || data.length !== WAVEFORM_BINS) {
        data = computeWaveformFromBuffer(buffer, WAVEFORM_BINS);
        if (url) {
          try {
            void setStemWaveform(url, WAVEFORM_BINS, data);
          } catch {
            /* best-effort cache */
          }
        }
      }
      if (!cancelled) setStemWaveforms((prev) => ({ ...prev, [id]: data! }));
      const schedule =
        typeof requestIdleCallback !== "undefined"
          ? () => requestIdleCallback(() => void processOne())
          : () => setTimeout(() => void processOne(), 0);
      schedule();
    };

    const scheduleFirst =
      typeof requestIdleCallback !== "undefined"
        ? () => requestIdleCallback(() => void processOne())
        : () => setTimeout(() => void processOne(), 0);
    scheduleFirst();

    return () => {
      cancelled = true;
    };
  }, [stemBuffers, stemEntries, setStemWaveforms]);
}
