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

/**
 * Canonical client/API quality tier (2-tier product model).
 * The server also accepts legacy aliases `balanced` and `ultra` and normalizes them to `quality`.
 * Clients should only send `speed` or `quality`.
 */
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


