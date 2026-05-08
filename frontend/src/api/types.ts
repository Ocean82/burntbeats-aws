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
  /** Queue position when status is "queued" (1 = next to run). */
  queue_position?: number;
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
