/**
 * MIDI conversion job status polling and SSE streaming.
 */
import { API_BASE } from "../config";
import { authHeaders } from "./auth";
import { fetchWithRetry } from "./retry";
import { userFacingHttpError } from "../userFacingError";

const STATUS_POLL_INTERVAL_MS =
  Number(import.meta.env.VITE_MIDI_STATUS_POLL_INTERVAL_MS) || 1500;
const STATUS_POLL_MAX_MS =
  Number(import.meta.env.VITE_MIDI_STATUS_POLL_MAX_MS) || 30 * 60 * 1000;

export interface MidiPollStatus {
  status: string;
  job_id?: string;
  progress: number;
  message?: string;
  error?: string;
  empty_transcription?: boolean;
  warning?: string;
  result?: {
    notes_detected: number;
    duration_seconds: number;
    tracks: number;
    inference_time_seconds: number;
    piano_roll_notes: Array<{
      pitch: number;
      start: number;
      duration: number;
      velocity: number;
    }>;
    analysis?: Record<string, unknown>;
    midi_file_analysis?: Record<string, unknown>;
  };
}

function waitForOnline(): Promise<void> {
  if (typeof navigator === "undefined" || navigator.onLine) return Promise.resolve();
  return new Promise((resolve) => {
    const handler = () => {
      window.removeEventListener("online", handler);
      resolve();
    };
    window.addEventListener("online", handler);
  });
}

export async function getMidiJobStatus(
  jobId: string,
  token: string,
): Promise<MidiPollStatus> {
  await waitForOnline();
  const res = await fetchWithRetry(
    `${API_BASE}/api/midi/status/${jobId}`,
    { headers: { ...(await authHeaders()), "x-job-token": token } },
    { maxAttempts: 3, baseDelay: 1000, retryOn: [502, 503, 504] },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const bodyError =
      typeof data.error === "string" ? data.error : null;
    throw new Error(userFacingHttpError(res.status, bodyError, `Status failed (${res.status})`));
  }
  return (await res.json()) as MidiPollStatus;
}

export async function pollMidiJobUntilDone(
  jobId: string,
  token: string,
  onProgress: (status: MidiPollStatus) => void,
): Promise<MidiPollStatus> {
  const start = Date.now();
  while (Date.now() - start < STATUS_POLL_MAX_MS) {
    await waitForOnline();
    const status = await getMidiJobStatus(jobId, token);
    onProgress(status);
    if (status.status === "completed" || status.status === "failed" || status.status === "cancelled") {
      return status;
    }
    await new Promise((r) => setTimeout(r, STATUS_POLL_INTERVAL_MS));
  }
  throw new Error("MIDI conversion timed out");
}

export async function streamMidiJobUntilDone(
  jobId: string,
  token: string,
  onProgress: (status: MidiPollStatus) => void,
): Promise<MidiPollStatus> {
  await waitForOnline();
  const url = `${API_BASE}/api/midi/status/${jobId}/stream`;
  const headers: Record<string, string> = {
    ...(await authHeaders()),
    "x-job-token": token,
    Accept: "text/event-stream",
  };

  let response: Response;
  try {
    response = await fetchWithRetry(
      url,
      { headers },
      { maxAttempts: 2, baseDelay: 500, retryOn: [502, 503, 504] },
    );
  } catch {
    return pollMidiJobUntilDone(jobId, token, onProgress);
  }

  if (!response.ok || !response.body) {
    return pollMidiJobUntilDone(jobId, token, onProgress);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const start = Date.now();

  try {
    while (Date.now() - start < STATUS_POLL_MAX_MS) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
        if (!dataLine) continue;
        let status: MidiPollStatus;
        try {
          status = JSON.parse(dataLine.slice("data: ".length)) as MidiPollStatus;
        } catch {
          continue;
        }
        onProgress(status);
        if (
          status.status === "completed" ||
          status.status === "failed" ||
          status.status === "cancelled"
        ) {
          return status;
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  return pollMidiJobUntilDone(jobId, token, onProgress);
}
