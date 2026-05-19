import { useCallback, useState } from "react";
import {
  fetchStemDownloadUrl,
  type StemHistoryJob,
} from "../api/stemHistory";
import type { StemResult } from "../types";

export interface LoadHistoryJobCallbacks {
  onLoaded: (payload: {
    stems: StemResult[];
    jobId: string;
    uploadName: string;
  }) => void;
  onError?: (message: string) => void;
}

export function useLoadHistoryJob(callbacks: LoadHistoryJobCallbacks) {
  const [loadingJobId, setLoadingJobId] = useState<string | null>(null);

  const loadHistoryJob = useCallback(
    async (job: StemHistoryJob) => {
      if (job.status !== "completed" || job.stem_files.length === 0) {
        callbacks.onError?.("This job has no stems available to load.");
        return;
      }
      setLoadingJobId(job.job_id);
      try {
        const stems: StemResult[] = await Promise.all(
          job.stem_files.map(async (f) => {
            const url = await fetchStemDownloadUrl(job.job_id, f.stem_name);
            return { id: f.stem_name, url };
          }),
        );
        callbacks.onLoaded({
          stems,
          jobId: job.job_id,
          uploadName: job.original_filename ?? "Loaded stems",
        });
      } catch (e) {
        callbacks.onError?.(
          e instanceof Error ? e.message : "Could not load stems into mixer",
        );
      } finally {
        setLoadingJobId(null);
      }
    },
    [callbacks],
  );

  return { loadHistoryJob, loadingJobId };
}
