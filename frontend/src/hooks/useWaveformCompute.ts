/**
 * useWaveformCompute — computes waveforms from AudioBuffers using idle callbacks.
 * Separated so it can run without blocking the main thread.
 */
import { useEffect } from "react";
import { computeWaveformFromBuffer } from "../utils/audio";
import { getStemWaveform, setStemWaveform } from "../services/waveformCache";

const WAVEFORM_BINS = 512;

export function useWaveformCompute(
  stemBuffers: Record<string, AudioBuffer>,
  stemEntries: Array<{ id: string; url: string }>,
  setStemWaveforms: React.Dispatch<React.SetStateAction<Record<string, number[]>>>
) {
  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(stemBuffers);
    if (entries.length === 0) return;

    let index = 0;

    const processOne = async () => {
      if (cancelled || index >= entries.length) return;
      const [id, buffer] = entries[index++];
      const url = stemEntries.find((s) => s.id === id)?.url;
      let data: number[] | null = url ? await getStemWaveform(url, WAVEFORM_BINS) : null;
      if (cancelled) return;
      if (!data || data.length !== WAVEFORM_BINS) {
        data = computeWaveformFromBuffer(buffer, WAVEFORM_BINS);
        if (url) void setStemWaveform(url, WAVEFORM_BINS, data);
      }
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
