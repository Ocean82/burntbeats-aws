/**
 * API client for the "My Stems" history endpoints.
 * Fetches user's past stem separation jobs and generates presigned download URLs.
 */
import { API_BASE } from "../config";
import { authHeaders } from "./auth";

export interface StemFileRecord {
  stem_name: string;
  s3_key: string | null;
  file_size_bytes: number | null;
  available: boolean;
  file_url: string;
}

export interface StemHistoryJob {
  job_id: string;
  status: string;
  stems: number;
  quality: string | null;
  original_filename: string | null;
  duration_seconds: number | null;
  token_cost: number;
  model_name: string | null;
  created_at: string;
  completed_at: string | null;
  stem_files: StemFileRecord[];
}

export interface StemHistoryResponse {
  jobs: StemHistoryJob[];
  total: number;
}

/**
 * Fetch the authenticated user's stem separation history with nested stem metadata.
 */
export async function fetchStemHistory(opts?: {
  limit?: number;
  offset?: number;
}): Promise<StemHistoryResponse> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));

  const qs = params.toString();
  const url = `${API_BASE}/api/stems/history${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    headers: await authHeaders(),
  });

  if (!res.ok) {
    if (res.status === 401)
      throw new Error("Please sign in to view your stems");
    throw new Error(`Failed to load stem history (HTTP ${res.status})`);
  }

  return res.json();
}

/**
 * Legacy history download helper.
 *
 * The backend may return either a presigned S3 URL or the canonical
 * authenticated `/api/stems/file/:job/:stem.wav` URL when the stem is served
 * from local/shared storage.
 */
export async function fetchStemDownloadUrl(
  jobId: string,
  stemName: string,
): Promise<string> {
  const params = new URLSearchParams({ job_id: jobId, stem_name: stemName });
  const url = `${API_BASE}/api/stems/history/download?${params.toString()}`;

  const res = await fetch(url, {
    headers: await authHeaders(),
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error("Stem not available for download");
    if (res.status === 401) throw new Error("Please sign in to download stems");
    throw new Error(`Download failed (HTTP ${res.status})`);
  }

  const data = await res.json();
  return data.url;
}
