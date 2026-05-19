/**
 * API response validation: type guards, JSON parsing helpers, and error extraction.
 */
import type { JobStatus } from "@shared/types";
import type { StemResult } from "../types";
import type { StemJobStatus } from "./types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function getApiErrorMessage(parsed: unknown): string | null {
  if (!isRecord(parsed)) return null;
  if (typeof parsed.error === "string") return parsed.error;
  if (typeof parsed.detail === "string") return parsed.detail;
  return null;
}

export function isJobStatusValue(value: unknown): value is JobStatus {
  return (
    value === "queued" ||
    value === "running" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled"
  );
}

export function isStemResultValue(value: unknown): value is StemResult {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.url !== "string") return false;
  if (value.path !== undefined && typeof value.path !== "string") return false;
  return true;
}

export function isStemJobStatusValue(value: unknown): value is StemJobStatus {
  if (!isRecord(value)) return false;
  if (!isJobStatusValue(value.status)) return false;
  if (typeof value.progress !== "number" || !Number.isFinite(value.progress)) return false;
  if (value.error !== undefined && typeof value.error !== "string") return false;
  if (value.stems !== undefined) {
    if (!Array.isArray(value.stems)) return false;
    if (!value.stems.every(isStemResultValue)) return false;
  }
  if (value.beat_grid !== undefined) {
    if (!isRecord(value.beat_grid)) return false;
    if (typeof value.beat_grid.bpm !== "number" || !Number.isFinite(value.beat_grid.bpm)) return false;
    if (typeof value.beat_grid.beat_offset_seconds !== "number" || !Number.isFinite(value.beat_grid.beat_offset_seconds)) return false;
    if (typeof value.beat_grid.confidence !== "number" || !Number.isFinite(value.beat_grid.confidence)) return false;
  }
  return true;
}

export function isAcceptedJobIdResponse(
  value: unknown,
): value is {
  job_id: string;
  status?: string;
  job_token?: string;
  output_url?: string;
  status_url?: string;
} {
  if (!isRecord(value)) return false;
  if (typeof value.job_id !== "string" || value.job_id.length === 0) return false;
  if (value.status !== undefined && typeof value.status !== "string") return false;
  return true;
}
