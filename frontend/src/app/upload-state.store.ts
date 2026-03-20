import { create } from "zustand";
import type { SplitQuality, StemResult } from "../api";
import type { StemId } from "../types";

export interface LoadedStem {
  id: string;
  label: string;
  url: string;
}

export interface UploadState {
  quality: SplitQuality;
  selectedStems: Record<StemId, boolean>;
  uploadName: string;
  uploadedFile: File | null;
  splitResultStems: StemResult[];
  splitJobId: string | null;
  splitJobToken: string | null;
  loadedStems: LoadedStem[];
  splitError: string | null;
  isDragging: boolean;
  isSplitting: boolean;
  isExpanding: boolean;
  splitProgress: number;
  pipelineIndex: number;
}

type UploadStateUpdater = UploadState | ((previous: UploadState) => UploadState);

interface UploadStateStore {
  uploadState: UploadState;
  setUploadState: (updater: UploadStateUpdater) => void;
}

const DEFAULT_UPLOAD_STATE: UploadState = {
  quality: "quality",
  selectedStems: {
    vocals: true,
    drums: true,
    bass: true,
    melody: true,
    instrumental: true,
    other: true,
  },
  uploadName: "nightdrive_demo_master.wav",
  uploadedFile: null,
  splitResultStems: [],
  splitJobId: null,
  splitJobToken: null,
  loadedStems: [],
  splitError: null,
  isDragging: false,
  isSplitting: false,
  isExpanding: false,
  splitProgress: 0,
  pipelineIndex: 0,
};

export const useUploadStateStore = create<UploadStateStore>((set) => ({
  uploadState: DEFAULT_UPLOAD_STATE,
  setUploadState: (updater) =>
    set((state) => ({
      uploadState: typeof updater === "function" ? updater(state.uploadState) : updater,
    })),
}));
