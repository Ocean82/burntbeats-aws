/**
 * Hook for fetching the authenticated user's MIDI conversion history.
 * Used by MyStemsPage to display MIDI badges and download links on job cards.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { authHeaders } from "../api/auth";

export interface MidiHistoryRecord {
  job_id: string;
  stem_job_id: string | null;
  stem_name: string | null;
  notes_detected: number;
  duration_seconds: number;
  created_at: string | null;
  file_available: boolean;
}

const API_BASE = import.meta.env.VITE_API_URL || "";

export function useMidiHistory() {
  const [records, setRecords] = useState<MidiHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE}/api/midi/history`, { headers });
      if (!res.ok) throw new Error("Failed to load MIDI history");
      const data = await res.json();
      if (mountedRef.current) {
        setRecords(data.conversions || []);
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

  useEffect(() => {
    mountedRef.current = true;
    void fetchHistory();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchHistory]);

  return { records, isLoading, error, refetch: fetchHistory };
}
