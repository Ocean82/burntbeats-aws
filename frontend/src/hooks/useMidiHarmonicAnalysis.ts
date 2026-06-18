import { useCallback, useRef, useState } from "react";
import { authHeaders } from "../api/auth";
import { API_BASE } from "../config";

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

      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      authHeaders()
        .then((headers) =>
          fetch(`${API_BASE}/api/midi/analyze`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...headers,
            },
            body: JSON.stringify({ notes, bpm, time_signature: timeSignature }),
            signal: controller.signal,
          }),
        )
        .then(async (res) => {
          clearTimeout(timeout);
          if (!res.ok) {
            const text = await res.text().catch(() => "Unknown error");
            throw new Error(`Analysis failed (${res.status}): ${text}`);
          }
          return res.json() as Promise<HarmonicAnalysisResult>;
        })
        .then((data) => {
          if (!controller.signal.aborted) {
            setResult(data);
            setLoading(false);
          }
        })
        .catch((err) => {
          if (err.name === "AbortError") return;
          clearTimeout(timeout);
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        });
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
