import { create } from "zustand";
import type { SplitIntent } from "@shared/types";
import type { SplitQuality } from "../api";
import type { StemResult } from "../types";
import type { BeatGridMetadata } from "../api";
import { DEFAULT_SPLIT_INTENT } from "../utils/splitIntent";

const VALID_QUALITIES: readonly SplitQuality[] = ["speed", "quality"] as const;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function sanitizePartialState(update: Partial<AppState>): Partial<AppState> {
  const sanitized: Partial<AppState> = { ...update };
  if (typeof update.splitProgress === "number") {
    sanitized.splitProgress = clampPercent(update.splitProgress);
  }
  if (typeof update.uploadProgress === "number") {
    sanitized.uploadProgress = clampPercent(update.uploadProgress);
  }
  if (typeof update.pipelineIndex === "number") {
    sanitized.pipelineIndex = Math.max(0, Math.round(update.pipelineIndex));
  }
  if (
    typeof update.quality === "string" &&
    !VALID_QUALITIES.includes(update.quality as SplitQuality)
  ) {
    sanitized.quality = "quality";
  }
  return sanitized;
}

export interface AppState {
  splitIntent: SplitIntent;
  quality: SplitQuality;
  uploadName: string;
  uploadedFile: File | null;
  splitResultStems: StemResult[];
  splitJobId: string | null;
  loadedStems: Array<{ id: string; label: string; url: string; file: File }>;
  splitError: string | null;
  isSample: boolean;
  isDragging: boolean;
  isSplitting: boolean;
  isExpanding: boolean;
  splitProgress: number;
  /** Upload progress (0–100) during file transfer to server. */
  uploadProgress: number;
  /** Whether the file is currently being uploaded (before split processing begins). */
  isUploading: boolean;
  pipelineIndex: number;
  beatGrid: BeatGridMetadata | null;
  /** Queue position when job is waiting (1 = next to run, null = not queued). */
  queuePosition: number | null;
  /** Elapsed processing seconds from job status (running state). */
  splitElapsedSeconds: number | null;
  /** Backend-reported stage label for the current split job. */
  splitStageLabel: string | null;
  /** Master limiter toggle preference (UI state). */
  masterLimiterEnabled: boolean;

  setUploadState: (update: Partial<AppState> | ((prev: AppState) => Partial<AppState>)) => void;
  setSplitError: (msg: string | null) => void;
  setMasterLimiterEnabled: (enabled: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  splitIntent: DEFAULT_SPLIT_INTENT,
  quality: "quality" as SplitQuality,
  uploadName: "",
  uploadedFile: null,
  splitResultStems: [],
  splitJobId: null,
  loadedStems: [],
  splitError: null,
  isSample: false,
  isDragging: false,
  isSplitting: false,
  isExpanding: false,
  splitProgress: 0,
  uploadProgress: 0,
  isUploading: false,
  pipelineIndex: 0,
  beatGrid: null,
  queuePosition: null,
  splitElapsedSeconds: null,
  splitStageLabel: null,
  masterLimiterEnabled: false,

  setUploadState: (update) =>
    set((state) => {
      const next = typeof update === "function" ? update(state) : update;
      return sanitizePartialState(next);
    }),
  setSplitError: (msg) => set({ splitError: msg }),
  setMasterLimiterEnabled: (enabled) => set({ masterLimiterEnabled: enabled }),
}));
