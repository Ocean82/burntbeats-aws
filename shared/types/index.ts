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

export interface SpeechJobStatus {
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  job_id?: string;
  error?: string;
  output?: string;
  output_url?: string;
  message?: string;
  queue_depth?: number;
}

export interface MidiJobStatus {
  status: JobStatus | "processing";
  progress: number;
  job_id?: string;
  message?: string;
  error?: string;
  result?: Record<string, unknown>;
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

export interface ExpandRequest {
  job_id: string;
  quality?: SplitQuality;
}

export interface ConvertRequest {
  min_confidence?: string;
  min_note_length_ms?: string;
  include_pitch_bends?: string;
  quantize?: string;
  quantize_grid?: string;
  quantize_bpm?: string;
  quantize_strength?: string;
  normalize_velocity?: string;
  target_velocity?: string;
  max_note_length_ms?: string;
  transpose?: string;
  stem_job_id?: string;
  stem_name?: string;
}

export interface ErrorResponse {
  error: string;
}

/** Boolean presence flags for critical runtime secrets (backend /api/health). */
export interface HealthSecrets {
  clerk: boolean;
  job_token: boolean;
  stripe: boolean;
}

export interface ServiceReachability {
  reachable: boolean;
  status?: string;
  latencyMs?: number;
  error?: string;
}

/** Backend GET /api/health contract (enriched dependency probe). */
export interface BackendHealthResponse {
  status: "ok" | "degraded";
  version: string;
  uptime_seconds: number;
  database: {
    connected: boolean;
    latencyMs?: number;
    error?: string;
  };
  redis: {
    enabled: boolean;
    connected: boolean;
    error?: string;
  };
  services: {
    stem: ServiceReachability;
    speech: ServiceReachability;
    midi: ServiceReachability;
  };
  secrets: HealthSecrets;
}

/** Minimal health payload from Python microservices. */
export interface HealthResponse {
  status: "ok" | "degraded";
  repo_root?: string;
}


