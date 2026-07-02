/**
 * Fetch original source audio uploaded for a MIDI conversion job.
 */
import { API_BASE } from "../config";
import { authHeaders, jobTokenHeader } from "./auth";

export function midiSourceAudioUrl(jobId: string): string {
  return `${API_BASE}/api/midi/source/${jobId}`;
}

export async function fetchMidiSourceAudioBlob(
  jobId: string,
  jobToken?: string | null,
): Promise<Blob | null> {
  const headers: Record<string, string> = {
    ...(await authHeaders()),
    ...jobTokenHeader(jobId),
  };
  if (jobToken) headers["x-job-token"] = jobToken;

  const res = await fetch(midiSourceAudioUrl(jobId), { headers });
  if (!res.ok) return null;
  return res.blob();
}
