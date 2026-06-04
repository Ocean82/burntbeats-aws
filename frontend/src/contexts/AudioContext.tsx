import React, { createContext, useContext, useMemo } from "react";
import { useAudioPlayback } from "../hooks/useAudioPlayback";
import type { UseAudioPlaybackReturn } from "../hooks/useAudioPlayback";
import type { UseStemLoadingReturn } from "../hooks/useStemLoading";
import { useStemMedia } from "./StemMediaContext";
import { useWorkflow } from "./WorkflowContext";
import { useAppStore } from "../store/appStore";

export type AudioContextValue = UseAudioPlaybackReturn &
  Pick<
    UseStemLoadingReturn,
    | "stemBuffers"
    | "setStemBuffers"
    | "isLoadingStems"
    | "loadingError"
    | "retryLoadStems"
    | "clearStemLoadingState"
  >;

const AudioContext = createContext<AudioContextValue | null>(null);

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { stemStates } = useWorkflow();
  const beatGrid = useAppStore((s) => s.beatGrid);
  const stemMedia = useStemMedia();

  const audio = useAudioPlayback({
    stemStates,
    playbackBpm: beatGrid?.bpm ?? null,
    audioContextRef: stemMedia.audioContextRef,
  });

  const value = useMemo<AudioContextValue>(
    () => ({
      ...audio,
      stemBuffers: stemMedia.stemBuffers,
      setStemBuffers: stemMedia.setStemBuffers,
      isLoadingStems: stemMedia.isLoadingStems,
      loadingError: stemMedia.loadingError,
      retryLoadStems: stemMedia.retryLoadStems,
      clearStemLoadingState: stemMedia.clearStemLoadingState,
    }),
    [audio, stemMedia],
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
