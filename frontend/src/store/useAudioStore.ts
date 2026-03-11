import { create } from 'zustand';
import type { MixerState, TrimState, StemResult } from '../types';
import { defaultTrim, defaultMixer } from '../types';

export type PipelineStep = 'upload' | 'split' | 'mix' | 'export';

export interface SplitJob {
  id: string;
  progress: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  stems?: StemResult[];
  error?: string;
}

interface AudioState {
  // File state
  uploadName: string;
  uploadedFile: File | null;
  
  // Split state
  splitResultStems: StemResult[];
  splitError: string | null;
  isSplitting: boolean;
  splitProgress: number;
  pipelineIndex: number;
  
  // Track state
  stemBuffers: Record<string, AudioBuffer>;
  stemWaveforms: Record<string, number[]>;
  loadedTracks: Record<string, boolean>;
  isLoadingStems: boolean;
  
  // Mixer state
  trimMap: Record<string, TrimState>;
  mixerState: Record<string, MixerState>;
  mutedStems: Record<string, boolean>;
  soloStems: Record<string, boolean>;
  
  // Playback state
  isPlayingMix: boolean;
  playingStem: string | null;
  playheadPosition: number;
  
  // Export state
  isExporting: boolean;
  
  // UI state
  showHelpModal: boolean;
  showPresetsModal: boolean;
  showExportModal: boolean;
  selectedStemIndex: number;
  
  // Actions
  setUploadedFile: (file: File | null) => void;
  setUploadName: (name: string) => void;
  setSplitResultStems: (stems: StemResult[]) => void;
  setSplitError: (error: string | null) => void;
  setIsSplitting: (splitting: boolean) => void;
  setSplitProgress: (progress: number) => void;
  setPipelineIndex: (index: number) => void;
  setStemBuffer: (id: string, buffer: AudioBuffer) => void;
  setStemBuffers: (buffers: Record<string, AudioBuffer>) => void;
  setStemWaveform: (id: string, waveform: number[]) => void;
  setLoadedTrack: (id: string, loaded: boolean) => void;
  setIsLoadingStems: (loading: boolean) => void;
  setTrimMap: (trim: Record<string, TrimState>) => void;
  setTrimForStem: (id: string, trim: TrimState) => void;
  setMixerState: (mixer: Record<string, MixerState>) => void;
  setMixerForStem: (id: string, mixer: MixerState) => void;
  setMutedStems: (muted: Record<string, boolean>) => void;
  toggleMute: (id: string) => void;
  setSoloStems: (solo: Record<string, boolean>) => void;
  toggleSolo: (id: string) => void;
  setIsPlayingMix: (playing: boolean) => void;
  setPlayingStem: (stem: string | null) => void;
  setPlayheadPosition: (position: number) => void;
  setIsExporting: (exporting: boolean) => void;
  setShowHelpModal: (show: boolean) => void;
  setShowPresetsModal: (show: boolean) => void;
  setShowExportModal: (show: boolean) => void;
  setSelectedStemIndex: (index: number) => void;
  reset: () => void;
}

const initialTrim: Record<string, TrimState> = {
  vocals: { start: 8, end: 92 },
  drums: { start: 4, end: 96 },
  bass: { start: 6, end: 89 },
  melody: { start: 12, end: 90 },
  instrumental: defaultTrim,
  other: defaultTrim,
};

const initialMixer: Record<string, MixerState> = {
  vocals: { gain: 1.8, pan: 2, width: 82, send: 46 },
  drums: { gain: 0.6, pan: 0, width: 64, send: 24 },
  bass: { gain: -1.4, pan: -3, width: 38, send: 16 },
  melody: { gain: 1.2, pan: 7, width: 88, send: 42 },
  instrumental: defaultMixer,
  other: defaultMixer,
};

const initialMutedStems: Record<string, boolean> = {
  vocals: false,
  drums: false,
  bass: false,
  melody: false,
  instrumental: false,
  other: false,
};

export const useAudioStore = create<AudioState>((set) => ({
  // Initial state
  uploadName: 'nightdrive_demo_master.wav',
  uploadedFile: null,
  splitResultStems: [],
  splitError: null,
  isSplitting: false,
  splitProgress: 100,
  pipelineIndex: 3,
  stemBuffers: {},
  stemWaveforms: {},
  loadedTracks: {},
  isLoadingStems: false,
  trimMap: initialTrim,
  mixerState: initialMixer,
  mutedStems: initialMutedStems,
  soloStems: {},
  isPlayingMix: false,
  playingStem: null,
  playheadPosition: 0,
  isExporting: false,
  showHelpModal: false,
  showPresetsModal: false,
  showExportModal: false,
  selectedStemIndex: 0,

  // Actions
  setUploadedFile: (file) => set({ uploadedFile: file }),
  setUploadName: (name) => set({ uploadName: name }),
  setSplitResultStems: (stems) => set({ splitResultStems: stems }),
  setSplitError: (error) => set({ splitError: error }),
  setIsSplitting: (splitting) => set({ isSplitting: splitting }),
  setSplitProgress: (progress) => set({ splitProgress: progress }),
  setPipelineIndex: (index) => set({ pipelineIndex: index }),
  
  setStemBuffer: (id, buffer) => set((state) => ({
    stemBuffers: { ...state.stemBuffers, [id]: buffer }
  })),
  
  setStemBuffers: (buffers) => set({ stemBuffers: buffers }),
  
  setStemWaveform: (id, waveform) => set((state) => ({
    stemWaveforms: { ...state.stemWaveforms, [id]: waveform }
  })),
  
  setLoadedTrack: (id, loaded) => set((state) => ({
    loadedTracks: { ...state.loadedTracks, [id]: loaded }
  })),
  
  setIsLoadingStems: (loading) => set({ isLoadingStems: loading }),
  
  setTrimMap: (trim) => set({ trimMap: trim }),
  
  setTrimForStem: (id, trim) => set((state) => ({
    trimMap: { ...state.trimMap, [id]: trim }
  })),
  
  setMixerState: (mixer) => set({ mixerState: mixer }),
  
  setMixerForStem: (id, mixer) => set((state) => ({
    mixerState: { ...state.mixerState, [id]: mixer }
  })),
  
  setMutedStems: (muted) => set({ mutedStems: muted }),
  
  toggleMute: (id) => set((state) => ({
    mutedStems: { ...state.mutedStems, [id]: !state.mutedStems[id] }
  })),
  
  setSoloStems: (solo) => set({ soloStems: solo }),
  
  toggleSolo: (id) => set((state) => ({
    soloStems: { ...state.soloStems, [id]: !state.soloStems[id] }
  })),
  
  setIsPlayingMix: (playing) => set({ isPlayingMix: playing }),
  setPlayingStem: (stem) => set({ playingStem: stem }),
  setPlayheadPosition: (position) => set({ playheadPosition: position }),
  setIsExporting: (exporting) => set({ isExporting: exporting }),
  setShowHelpModal: (show) => set({ showHelpModal: show }),
  setShowPresetsModal: (show) => set({ showPresetsModal: show }),
  setShowExportModal: (show) => set({ showExportModal: show }),
  setSelectedStemIndex: (index) => set({ selectedStemIndex: index }),
  
  reset: () => set({
    uploadedFile: null,
    uploadName: '',
    splitResultStems: [],
    splitError: null,
    isSplitting: false,
    splitProgress: 100,
    pipelineIndex: 0,
    stemBuffers: {},
    stemWaveforms: {},
    loadedTracks: {},
    isLoadingStems: false,
    trimMap: initialTrim,
    mixerState: initialMixer,
    mutedStems: initialMutedStems,
    soloStems: {},
    isPlayingMix: false,
    playingStem: null,
    playheadPosition: 0,
    isExporting: false,
  }),
}));
