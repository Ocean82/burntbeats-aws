/**
 * Shareable audio preview generation (watermarked or clean per entitlements).
 */
import { API_BASE } from "../config";
import { authHeaders } from "./auth";
import { downloadBlob } from "../utils/downloadHelper";

export interface PreviewGenerateResponse {
  preview_id: string;
  job_id: string;
  watermarked: boolean;
  duration_seconds: number;
  download_url: string;
}

export async function generatePreview(jobId: string): Promise<PreviewGenerateResponse> {
  const res = await fetch(`${API_BASE}/api/preview/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify({ job_id: jobId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      typeof data.error === "string" ? data.error : "Preview generation failed",
    );
  }
  return res.json() as Promise<PreviewGenerateResponse>;
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
