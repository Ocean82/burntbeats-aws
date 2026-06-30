/**
 * Mastering presets and FFmpeg render API.
 */
import { API_BASE } from "../config";
import { authHeaders, jobTokenHeader } from "./auth";
import { apiGet } from "./client";

export interface MasteringPresetSummary {
  id: string;
  name: string;
  genre: string;
  description: string;
}

export async function fetchMasteringPresets(): Promise<MasteringPresetSummary[]> {
  const result = await apiGet<{ presets: MasteringPresetSummary[] }>("/api/master/presets");
  if (result.error || !result.data) {
    throw new Error(result.error || "Failed to load mastering presets");
  }
  return result.data.presets ?? [];
}

export async function renderMasteredWav(params: {
  jobId: string;
  presetId: string;
}): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/master/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
      ...jobTokenHeader(params.jobId),
    },
    body: JSON.stringify({
      job_id: params.jobId,
      preset_id: params.presetId,
      source: "stem",
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `Mastering failed (${res.status})`;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.blob();
}
