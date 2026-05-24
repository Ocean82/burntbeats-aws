/**
 * Shared API contract types for all Burnt Beats services.
 *
 * These types define the shape of requests and responses between:
 * - Frontend ↔ Backend (Express)
 * - Backend ↔ Python services (stem, speech, MIDI)
 *
 * Import from "@shared/types/api-contracts" in frontend (via Vite alias).
 */

// ── Common ───────────────────────────────────────────────────────────────────

export type JobStatus =
  | "queued"
  | "running"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

// ── Stem Service ─────────────────────────────────────────────────────────────

export interface StemJobStatus {
  status: JobStatus;
  progress: number;
  job_id?: string;
  stems?: Array<{ id: string; url: string }>;
  error?: string;
  queue_position?: number;
  elapsed_seconds?: number;
  beat_grid?: {
    bpm: number;
    beat_offset_seconds: number;
    confidence: number;
  };
  log?: string;
}

export interface StemSplitAcceptResponse {
  job_id: string;
  status: "accepted";
  queue_position: number;
  job_token?: string;
  status_url?: string;
}

export interface StemExpandAcceptResponse {
  job_id: string;
  status: "accepted";
  job_token?: string;
}

// ── Speech Service ───────────────────────────────────────────────────────────

export interface SpeechJobStatus {
  status: JobStatus;
  progress: number;
  job_id?: string;
  queue_depth?: number;
  output_url?: string;
  error?: string;
}

export interface SpeechEnhanceAcceptResponse {
  job_id: string;
  status: "queued";
  job_token?: string;
  output_url?: string;
  status_url?: string;
}

// ── MIDI Service ─────────────────────────────────────────────────────────────

export interface MidiNote {
  pitch: number;
  start: number;
  duration: number;
  velocity: number;
}

export interface MidiJobStatus {
  status: JobStatus;
  progress: number;
  job_id?: string;
  queue_depth?: number;
  error?: string;
  result?: {
    piano_roll_notes: MidiNote[];
    notes_detected: number;
    inference_time_seconds: number;
    duration_seconds: number;
  };
}

export interface MidiConvertAcceptResponse {
  job_id: string;
  status: "queued";
  job_token?: string;
  file_url?: string;
  status_url?: string;
}

export interface MidiMergeRequest {
  jobs: Array<{
    job_id: string;
    stem_name?: string;
    program?: number;
    transpose?: number;
    is_drum?: boolean;
  }>;
  bpm?: number;
}

// ── Health ───────────────────────────────────────────────────────────────────

export interface ServiceHealth {
  reachable: boolean;
  latencyMs?: number;
  status?: string;
  error?: string;
}

export interface BackendHealthResponse {
  status: "ok" | "degraded";
  version: string;
  uptime_seconds: number;
  database: {
    connected: boolean;
    latencyMs: number;
    error?: string;
  };
  services: {
    stem: ServiceHealth;
    speech: ServiceHealth;
    midi: ServiceHealth;
  };
  circuits: {
    stem: "closed" | "open" | "half-open";
    speech: "closed" | "open" | "half-open";
    midi: "closed" | "open" | "half-open";
  };
}

export interface PythonServiceHealthResponse {
  status: "ok";
  version: string;
  uptime_seconds: number;
  queue_depth: number;
  last_job_completed_at: string | null;
}
