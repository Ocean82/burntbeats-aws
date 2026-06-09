/**
 * MIDI render API — submit MIDI-to-audio render jobs and poll status.
 */
import { API_BASE } from "../config";
import { authHeaders } from "./auth";

export interface RenderNote {
  pitch: number;
  start: number;
  duration: number;
  velocity?: number;
  channel?: number;
}

export interface RenderTrack {
  stem_name?: string;
  instrument?: number;
  volume?: number;
  pan?: number;
  channel?: number;
}

export interface RenderRequest {
  source_job_id?: string;
  notes?: RenderNote[];
  bpm?: number;
  format?: "wav" | "mp3";
  sample_rate?: number;
  soundfont?: string;
  instrument?: number;
  tracks?: RenderTrack[];
  master_gain?: number;
  normalize?: boolean;
}

export interface RenderJobStatus {
  job_id: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  message: string;
  result?: {
    filename: string;
    format: string;
    sample_rate: number;
    soundfont: string;
    render_time_seconds: number;
  };
  error?: string;
}

export interface RenderJobAccepted {
  job_id: string;
  status: string;
  status_url: string;
  download_url: string;
}

export async function submitRenderJob(request: RenderRequest): Promise<RenderJobAccepted> {
  const res = await fetch(`${API_BASE}/api/midi/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let detail: string;
    try {
      const parsed = JSON.parse(body);
      detail = parsed.error || parsed.detail || body;
    } catch {
      detail = body || `HTTP ${res.status}`;
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function getRenderJobStatus(jobId: string): Promise<RenderJobStatus> {
  const res = await fetch(`${API_BASE}/api/midi/render/status/${jobId}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Render status failed: HTTP ${res.status}`);
  }
  return res.json();
}

export function getRenderDownloadUrl(jobId: string): string {
  return `${API_BASE}/api/midi/render/file/${jobId}`;
}
