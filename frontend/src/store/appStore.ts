import { create } from "zustand";
import type { SplitQuality, StemResult } from "../api";
import type { StemId } from "../types";

export interface AppState {
  quality: SplitQuality;
  selectedStems: Record<StemId, boolean>;
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
  quality: "quality" as SplitQuality,
  selectedStems: {
    vocals: true,
    drums: true,
    bass: true,
    melody: true,
    instrumental: true,
    other: true,
  } as Record<StemId, boolean>,
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
