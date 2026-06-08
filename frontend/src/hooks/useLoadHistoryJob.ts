import { useCallback, useState } from "react";
import { type StemHistoryJob } from "../api/stemHistory";
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
      const availableStemFiles = job.stem_files.filter(
        (f) =>
          f.available &&
          typeof f.file_url === "string" &&
          f.file_url.length > 0,
      );
      if (job.status !== "completed" || availableStemFiles.length === 0) {
        callbacks.onError?.("This job has no stems available to load.");
        return;
      }
      setLoadingJobId(job.job_id);
      try {
        const stems: StemResult[] = availableStemFiles.map((f) => ({
          id: f.stem_name,
          url: f.file_url,
        }));
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
