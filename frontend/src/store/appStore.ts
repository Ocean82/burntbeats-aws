import { create } from "zustand";
import type { SplitQuality } from "../api";
import type { StemResult } from "../types";
import type { BeatGridMetadata } from "../api";

export interface AppState {
  quality: SplitQuality;
  uploadName: string;
  uploadedFile: File | null;
  splitResultStems: StemResult[];
  splitJobId: string | null;
  loadedStems: Array<{ id: string; label: string; url: string }>;
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
  /** Master limiter toggle preference (UI state). */
  masterLimiterEnabled: boolean;

  setUploadState: (update: Partial<AppState> | ((prev: AppState) => Partial<AppState>)) => void;
  setSplitError: (msg: string | null) => void;
  setMasterLimiterEnabled: (enabled: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  quality: "balanced" as SplitQuality,
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
  masterLimiterEnabled: false,

  setUploadState: (update) =>
    set((state) =>
      typeof update === "function" ? update(state) : update
    ),
  setSplitError: (msg) => set({ splitError: msg }),
  setMasterLimiterEnabled: (enabled) => set({ masterLimiterEnabled: enabled }),
}));
