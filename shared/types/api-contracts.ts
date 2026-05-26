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
  job_type?: "split" | "expand";
  stem_count?: number;
  quality_mode?: "speed" | "quality";
  mode_name?: "2_stem_speed" | "2_stem_quality" | "4_stem_speed" | "4_stem_quality";
  progress_stage?: string;
  progress_stage_label?: string;
  artifact_delivery?: "local_ready" | "uploaded" | "upload_failed";
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
  queue_position: number;
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

export interface MidiAnalysis {
  estimated_key: string;
  scale: string;
  pitch_range: {
    min: number;
    max: number;
    min_name: string;
    max_name: string;
  };
  note_density: number;
  suggested_bpm: number | null;
  complexity_score: number;
  total_notes: number;
}

export interface MidiPostProcessSummary {
  quantization_applied?: boolean;
  quantize_strength?: number;
  notes_removed?: number;
  velocities_normalized?: boolean;
  max_note_duration_applied?: boolean;
  transposed_semitones?: number;
}

export interface MidiFileAnalysis {
  format: number;
  track_count: number;
  note_count: number;
  tempo_bpm?: number | null;
  time_signature?: [number, number] | null;
  has_drums: boolean;
  instrument_programs: number[];
}

export interface MidiJobResult {
  piano_roll_notes: MidiNote[];
  notes_detected: number;
  inference_time_seconds: number;
  duration_seconds: number;
  tracks: number;
  analysis?: MidiAnalysis | null;
  post_process?: MidiPostProcessSummary;
}

export interface MidiJobStatus {
  status: JobStatus;
  progress: number;
  job_id?: string;
  queue_depth?: number;
  error?: string;
  message?: string;
  result?: MidiJobResult;
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

export interface MidiArtifactMetadata {
  job_id: string;
  stem_job_id?: string | null;
  stem_name?: string | null;
  user_id?: string | null;
  notes_detected: number;
  duration_seconds: number;
  created_at: string;
  settings: {
    min_confidence: number;
    min_note_length_ms: number;
    include_pitch_bends: boolean;
    quantize: boolean;
    quantize_grid: string;
    quantize_bpm: number;
    normalize_velocity: boolean;
    target_velocity: number;
    max_note_length_ms: number;
    quantize_strength: number;
  };
  analysis?: MidiAnalysis | null;
  midi_file_analysis?: MidiFileAnalysis;
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
  status: "ok" | "degraded";
  version: string;
  uptime_seconds: number;
  queue_depth: number;
  last_job_completed_at: string | null;
  basic_pitch_version?: string;
  storage?: {
    ok: boolean;
    output_dir: string;
    resolved_output_dir: string;
    can_read: boolean;
    can_write: boolean;
    sentinel_filename: string;
    error?: string;
  };
  auth?: {
    token_required: boolean;
  };
}
