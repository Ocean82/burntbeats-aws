/**
 * Shareable audio preview generation (watermarked or clean per entitlements).
 */
import { API_BASE } from "../config";
import { authHeaders } from "./auth";
import { downloadBlob } from "../utils/downloadHelper";
import { apiPost } from "./client";

export interface PreviewGenerateResponse {
  preview_id: string;
  job_id: string;
  watermarked: boolean;
  duration_seconds: number;
  download_url: string;
}

export async function generatePreview(jobId: string): Promise<PreviewGenerateResponse> {
  const result = await apiPost<PreviewGenerateResponse>("/api/preview/generate", { job_id: jobId });
  if (result.error || !result.data) {
    throw new Error(result.error || "Preview generation failed");
  }
  return result.data;
}

export async function downloadPreview(
  previewId: string,
  filename: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/preview/${previewId}/download`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error("Preview download failed");
  const blob = await res.blob();
  await downloadBlob(blob, filename);
}
