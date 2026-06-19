import React, { createContext, useContext, useMemo } from "react";
import { useAudioPlayback } from "../hooks/useAudioPlayback";
import type { UseAudioPlaybackReturn } from "../hooks/useAudioPlayback";
import type { UseStemLoadingReturn } from "../hooks/useStemLoading";
import { useMasterProcessingSync } from "../hooks/audio/useMasterProcessingSync";
import { useStemMedia } from "./StemMediaContext";
import { useWorkflow } from "./WorkflowContext";
import { useAppStore } from "../store/appStore";
import { useMetronome } from "../hooks/audio/useMetronome";

export interface AudioContextMetronome {
  startMetronome: () => void;
  stopMetronome: () => void;
  getCountInBeats: () => number;
  metronomeEnabled: boolean;
}

export type AudioContextValue = UseAudioPlaybackReturn &
  Pick<
    UseStemLoadingReturn,
    | "stemBuffers"
    | "setStemBuffers"
    | "isLoadingStems"
    | "loadingError"
    | "retryLoadStems"
    | "clearStemLoadingState"
  > & {
    metronome: AudioContextMetronome;
  };

const AudioContext = createContext<AudioContextValue | null>(null);

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { stemStates } = useWorkflow();
  const beatGrid = useAppStore((s) => s.beatGrid);
  const stemMedia = useStemMedia();

  const globalBpm = useAppStore((s) => s.globalBpm);
  const globalPitchSemitones = useAppStore((s) => s.globalPitchSemitones);

  const audio = useAudioPlayback({
    stemStates,
    playbackBpm: globalBpm ?? beatGrid?.bpm ?? 120,
    globalPitchSemitones,
    audioContextRef: stemMedia.audioContextRef,
  });

  const metronome = useMetronome(stemMedia.audioContextRef);

  // Sync master processing store → live Web Audio nodes
  useMasterProcessingSync({
    applyMasterEq: audio.applyMasterEq,
    applyMasterCompressor: audio.applyMasterCompressor,
  });

  const value = useMemo<AudioContextValue>(
    () => ({
      ...audio,
      metronome,
      stemBuffers: stemMedia.stemBuffers,
      setStemBuffers: stemMedia.setStemBuffers,
      isLoadingStems: stemMedia.isLoadingStems,
      loadingError: stemMedia.loadingError,
      retryLoadStems: stemMedia.retryLoadStems,
      clearStemLoadingState: stemMedia.clearStemLoadingState,
    }),
    [audio, metronome, stemMedia],
  );

  return (
    <AudioContext.Provider value={value}>{children}</AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error("useAudio must be used within an AudioProvider");
  }
  return context;
};
