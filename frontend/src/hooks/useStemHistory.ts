/**
 * Hook for fetching and managing the user's stem separation history.
 * Powers the "My Stems" page with job data, computed stats, and refetch capability.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
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

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchStemHistory({ limit: 200 });
      setJobs(data.jobs);
      setTotalJobs(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stem history");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

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
    refetch: loadHistory,
  };
}
