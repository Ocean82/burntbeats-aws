/** Speech enhancement job status (LavaSR service). */

export type SpeechJobStatusValue =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export interface SpeechJobStatus {
  status: SpeechJobStatusValue;
  progress: number;
  job_id?: string;
  error?: string;
  output?: string;
  output_url?: string;
  message?: string;
  queue_depth?: number;
}

export interface SpeechEnhanceResponse {
  job_id: string;
  status: string;
  output_url?: string;
  status_url?: string;
}
