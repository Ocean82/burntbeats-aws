/**
 * Hook for fetching the authenticated user's MIDI conversion history.
 * Used by MyStemsPage to display MIDI badges and download links on job cards.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { authHeaders } from "../api/auth";
import { API_BASE } from "../config";

export interface MidiHistoryRecord {
  job_id: string;
  stem_job_id: string | null;
  stem_name: string | null;
  notes_detected: number;
  duration_seconds: number;
  created_at: string | null;
  file_available: boolean;
  analysis?: { suggested_bpm?: number } | null;
}

async function fetchMidiHistoryRecords(): Promise<MidiHistoryRecord[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/midi/history`, { headers });
  if (!res.ok) throw new Error("Failed to load MIDI history");
  const data = await res.json();
  return data.conversions || [];
}

export function useMidiHistory() {
  const [records, setRecords] = useState<MidiHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function load() {
      try {
        const conversions = await fetchMidiHistoryRecords();
        if (!cancelled) {
          setRecords(conversions);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const conversions = await fetchMidiHistoryRecords();
      if (mountedRef.current) {
        setRecords(conversions);
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  return { records, isLoading, error, refetch };
}
