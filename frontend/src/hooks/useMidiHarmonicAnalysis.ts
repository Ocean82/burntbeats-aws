import { useCallback, useRef, useState } from "react";
import { apiPost } from "../api/client";

export interface HarmonicBarChord {
  bar: number;
  chord: string;
  confidence: number;
  pitches: number[];
  note_count: number;
  root: string | null;
  quality: string | null;
}

export interface HarmonicAnalysisResult {
  key: string;
  key_confidence: number;
  mode: string;
  bar_count: number;
  bars: HarmonicBarChord[];
  chord_progression: string;
  total_notes: number;
}

export interface MidiNoteInput {
  pitch: number;
  start: number;
  duration: number;
  velocity: number;
}

export interface UseMidiHarmonicAnalysisReturn {
  analyze: (notes: MidiNoteInput[], bpm: number, timeSignature: string) => void;
  result: HarmonicAnalysisResult | null;
  loading: boolean;
  error: string | null;
  clear: () => void;
}

const FETCH_TIMEOUT_MS = 10000;

export function useMidiHarmonicAnalysis(): UseMidiHarmonicAnalysisReturn {
  const [result, setResult] = useState<HarmonicAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const analyze = useCallback(
    (notes: MidiNoteInput[], bpm: number, timeSignature: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      void (async () => {
        try {
          const apiResult = await apiPost<HarmonicAnalysisResult>(
            "/api/midi/analyze",
            { notes, bpm, time_signature: timeSignature },
            { signal: controller.signal, timeout: FETCH_TIMEOUT_MS },
          );
          if (controller.signal.aborted) return;
          if (apiResult.error || !apiResult.data) {
            throw new Error(
              apiResult.error ?? `Analysis failed (${apiResult.status})`,
            );
          }
          setResult(apiResult.data);
        } catch (e) {
          if (controller.signal.aborted) return;
          setError(e instanceof Error ? e.message : "Analysis failed");
          setResult(null);
        } finally {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        }
      })();
    },
    [],
  );

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  return { analyze, result, loading, error, clear };
}
