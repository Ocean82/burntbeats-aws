/**
 * Hook for MIDI-to-audio render with polling.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  submitRenderJob,
  getRenderJobStatus,
  getRenderDownloadUrl,
  type RenderRequest,
  type RenderJobStatus,
} from "../api/midiRender";

export interface UseMidiRenderReturn {
  /** Submit a render job. */
  submit: (request: RenderRequest) => Promise<void>;
  /** Current job status. */
  status: RenderJobStatus | null;
  /** Whether a render is in progress (queued or processing). */
  busy: boolean;
  /** Error message if the job failed. */
  error: string | null;
  /** Download URL when complete. */
  downloadUrl: string | null;
  /** Reset state to allow a new render. */
  reset: () => void;
}

const POLL_INTERVAL_MS = 1500;

export function useMidiRender(): UseMidiRenderReturn {
  const [status, setStatus] = useState<RenderJobStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;

    try {
      const s = await getRenderJobStatus(jobId);
      setStatus(s);

      if (s.status === "completed") {
        stopPolling();
        setBusy(false);
        setDownloadUrl(getRenderDownloadUrl(jobId));
      } else if (s.status === "failed" || s.status === "cancelled") {
        stopPolling();
        setBusy(false);
        setError(s.error || s.message || "Render failed");
      }
    } catch (e) {
      stopPolling();
      setBusy(false);
      setError(e instanceof Error ? e.message : "Polling failed");
    }
  }, [stopPolling]);

  const submit = useCallback(
    async (request: RenderRequest) => {
      stopPolling();
      setStatus(null);
      setError(null);
      setDownloadUrl(null);
      setBusy(true);

      try {
        const accepted = await submitRenderJob(request);
        jobIdRef.current = accepted.job_id;
        setStatus({
          job_id: accepted.job_id,
          status: "queued",
          progress: 0,
          message: "Queued",
        });
        intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
      } catch (e) {
        setBusy(false);
        setError(e instanceof Error ? e.message : "Submit failed");
      }
    },
    [poll, stopPolling],
  );

  const reset = useCallback(() => {
    stopPolling();
    jobIdRef.current = null;
    setStatus(null);
    setBusy(false);
    setError(null);
    setDownloadUrl(null);
  }, [stopPolling]);

  // Cleanup on unmount
  useEffect(() => stopPolling, [stopPolling]);

  return { submit, status, busy, error, downloadUrl, reset };
}
