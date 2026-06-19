import { create } from "zustand";
import type { SplitIntent } from "@shared/types";
import type { SplitQuality } from "../api";
import type { StemResult } from "../types";
import type { BeatGridMetadata } from "../api";
import { DEFAULT_SPLIT_INTENT } from "../utils/splitIntent";

const VALID_QUALITIES: readonly SplitQuality[] = ["speed", "quality"] as const;

/** Coerce persisted/legacy quality strings to canonical SplitQuality. */
function normalizeStoredQuality(raw: unknown): SplitQuality {
  const q = typeof raw === "string" ? raw : "";
  if (q === "balanced" || q === "ultra") return "quality";
  if (VALID_QUALITIES.includes(q as SplitQuality)) return q as SplitQuality;
  return "quality";
}

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
  if (update.quality !== undefined) {
    sanitized.quality = normalizeStoredQuality(update.quality);
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
  /** Jobs ahead in queue when status is queued (derived from backend jobs_ahead). */
  jobsAhead: number | null;
  /** Elapsed processing seconds from job status (running state). */
  splitElapsedSeconds: number | null;
  /** Backend-reported stage label for the current split job. */
  splitStageLabel: string | null;
  /** Master limiter toggle preference (UI state). */
  masterLimiterEnabled: boolean;

  /** Global project BPM for metronome and tempo-synced FX. */
  globalBpm: number;
  /** Global pitch shift in semitones (-12 to +12). */
  globalPitchSemitones: number;
  /** Metronome click track enabled. */
  metronomeEnabled: boolean;
  /** Count-in before playback starts. */
  countIn: "off" | "1bar" | "2bars" | "4bars";

  setUploadState: (update: Partial<AppState> | ((prev: AppState) => Partial<AppState>)) => void;
  setSplitError: (msg: string | null) => void;
  setMasterLimiterEnabled: (enabled: boolean) => void;
  setGlobalBpm: (bpm: number) => void;
  setGlobalPitchSemitones: (semitones: number) => void;
  setMetronomeEnabled: (enabled: boolean) => void;
  setCountIn: (countIn: "off" | "1bar" | "2bars" | "4bars") => void;
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
  jobsAhead: null,
  splitElapsedSeconds: null,
  splitStageLabel: null,
  masterLimiterEnabled: false,
  globalBpm: 120,
  globalPitchSemitones: 0,
  metronomeEnabled: false,
  countIn: "off" as const,

  setUploadState: (update) =>
    set((state) => {
      const next = typeof update === "function" ? update(state) : update;
      return sanitizePartialState(next);
    }),
  setSplitError: (msg) => set({ splitError: msg }),
  setMasterLimiterEnabled: (enabled) => set({ masterLimiterEnabled: enabled }),
  setGlobalBpm: (bpm) => set({ globalBpm: Math.max(40, Math.min(300, bpm)) }),
  setGlobalPitchSemitones: (semitones) => set({ globalPitchSemitones: Math.max(-12, Math.min(12, semitones)) }),
  setMetronomeEnabled: (enabled) => set({ metronomeEnabled: enabled }),
  setCountIn: (countIn) => set({ countIn }),
}));
