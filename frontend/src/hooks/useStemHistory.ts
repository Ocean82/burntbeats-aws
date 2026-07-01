/**
 * Hook for fetching and managing the user's stem separation history.
 * Powers the "My Stems" page with job data, computed stats, and refetch capability.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchStemHistory,
  type StemHistoryJob,
} from "../api/stemHistory";

export interface UseStemHistoryReturn {
  jobs: StemHistoryJob[];
  isLoading: boolean;
  error: string | null;
  totalJobs: number;
  totalStems: number;
  totalStorageBytes: number;
  refetch: () => void;
}

export function useStemHistory(): UseStemHistoryReturn {
  const [jobs, setJobs] = useState<StemHistoryJob[]>([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchStemHistory({ limit: 200 });
        if (!cancelled) {
          setJobs(data?.jobs ?? []);
          setTotalJobs(data?.total ?? 0);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load stem history");
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
      const data = await fetchStemHistory({ limit: 200 });
      if (mountedRef.current) {
        setJobs(data?.jobs ?? []);
        setTotalJobs(data?.total ?? 0);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load stem history");
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const totalStems = useMemo(
    () => jobs.reduce((sum, job) => sum + job.stem_files.length, 0),
    [jobs],
  );

  const totalStorageBytes = useMemo(
    () =>
      jobs.reduce(
        (sum, job) =>
          sum +
          job.stem_files.reduce(
            (s, f) => s + (f.file_size_bytes ?? 0),
            0,
          ),
        0,
      ),
    [jobs],
  );

  return {
    jobs,
    isLoading,
    error,
    totalJobs,
    totalStems,
    totalStorageBytes,
    refetch,
  };
}
