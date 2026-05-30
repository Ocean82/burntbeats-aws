/**
 * Shared types for BurntBeats API.
 * This file should be used by both frontend and backend to ensure type consistency.
 */

export type StemId =
  | "vocals"
  | "drums"
  | "bass"
  | "other"
  | "guitar"
  | "instrumental";

export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type SplitQuality = "speed" | "quality";

export type SplitTask = "extract" | "remove" | "full_separation";

export type SplitTarget =
  | "vocals"
  | "drums"
  | "bass"
  | "guitar"
  | "other"
  | "instrumental";

/** Intent-driven split request (mirrors stem_service.routing.schema). */
export interface SplitIntent {
  task: SplitTask;
  targets?: SplitTarget[];
  mode?: "2" | "4";
  quality?: "fast" | "high";
}

export interface StemResult {
  id: StemId;
  url: string;
  path?: string;
}

export interface SplitRequest {
  file: File;
  stems: 2 | 4;
  quality?: SplitQuality;
}

export interface SplitResponse {
  job_id: string;
  status: "accepted";
}

export interface JobStatusResponse {
  status: JobStatus;
  progress: number;
  stems?: StemResult[];
  error?: string;
  /** Optional beat-grid metadata emitted by the backend after separation. */
  beat_grid?: BeatGridMetadata;
}

export interface BeatGridMetadata {
  bpm: number;
  beat_offset_seconds: number;
  confidence: number;
}

export interface CancelResponse {
  job_id: string;
  status: JobStatus;
  message?: string;
}

export interface ErrorResponse {
  error: string;
}

export interface HealthResponse {
  status: "ok";
  repo_root?: string;
}

// API Endpoints
export const API_ENDPOINTS = {
  SPLIT: "/api/stems/split",
  STATUS: (jobId: string) => `/api/stems/status/${jobId}`,
  CANCEL: (jobId: string) => `/api/stems/${jobId}`,
  FILE: (jobId: string, stemId: string) => `/api/stems/file/${jobId}/${stemId}.wav`,
  CLEANUP: "/api/stems/cleanup",
  HEALTH: "/api/health",
} as const;

// Validation
export const VALIDATION = {
  SUPPORTED_FORMATS: [".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aiff"],
  MAX_FILE_SIZE_MB: 500,
  MIN_SAMPLE_RATE: 8000,
  MAX_SAMPLE_RATE: 48000,
} as const;
