/**
 * Shared types for the API layer.
 */
import type { JobStatus, SplitQuality as SharedSplitQuality } from "@shared/types";
import type { StemResult } from "../types";
import type { StemEditorState } from "../stem-editor-state";

export interface SplitResponse {
  job_id: string;
  status: string;
  stems: StemResult[];
  beat_grid?: BeatGridMetadata;
}

export interface BeatGridMetadata {
  bpm: number;
  beat_offset_seconds: number;
  confidence: number;
}

export interface StemJobStatus {
  status: JobStatus;
  progress: number;
  stems?: StemResult[];
  error?: string;
  beat_grid?: BeatGridMetadata;
  job_type?: "split" | "expand";
  stem_count?: number;
  quality_mode?: "speed" | "quality";
  mode_name?: "2_stem_speed" | "2_stem_quality" | "4_stem_speed" | "4_stem_quality";
  progress_stage?: string;
  progress_stage_label?: string;
  artifact_delivery?: "local_ready" | "uploaded" | "upload_failed";
  /** Queue position when status is "queued" (1 = next to run). */
  queue_position?: number;
  /** Jobs ahead of this one in the queue (0 when position is 1). */
  jobs_ahead?: number;
  /** Elapsed processing seconds (emitted during running state). */
  elapsed_seconds?: number;
}

export type SplitQuality = SharedSplitQuality;

export interface ServerExportMasterRequest {
  job_id: string;
  stem_ids: string[];
  stem_states: Record<string, StemEditorState>;
  upload_name: string;
  normalize: boolean;
}
