import { create } from "zustand";
import type { SplitQuality, StemResult } from "../api";

export interface AppState {
  quality: SplitQuality;
  uploadName: string;
  uploadedFile: File | null;
  splitResultStems: StemResult[];
  splitJobId: string | null;
  loadedStems: Array<{ id: string; label: string; url: string }>;
  splitError: string | null;
  isDragging: boolean;
  isSplitting: boolean;
  isExpanding: boolean;
  splitProgress: number;
  pipelineIndex: number;

  setUploadState: (update: Partial<AppState> | ((prev: AppState) => Partial<AppState>)) => void;
  setSplitError: (msg: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  quality: "balanced" as SplitQuality,
  uploadName: "",
  uploadedFile: null,
  splitResultStems: [],
  splitJobId: null,
  loadedStems: [],
  splitError: null,
  isDragging: false,
  isSplitting: false,
  isExpanding: false,
  splitProgress: 0,
  pipelineIndex: 0,

  setUploadState: (update) =>
    set((state) =>
      typeof update === "function" ? update(state) : update
    ),
  setSplitError: (msg) => set({ splitError: msg }),
}));
