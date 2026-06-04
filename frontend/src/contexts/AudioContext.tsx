import React, { createContext, useContext, useMemo } from "react";
import { useAudioPlayback } from "../hooks/useAudioPlayback";
import type { UseAudioPlaybackReturn } from "../hooks/useAudioPlayback";
import { useStemLoading } from "../hooks/useStemLoading";
import type { UseStemLoadingReturn } from "../hooks/useStemLoading";
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
  const { stemStates, setStemStates } = useWorkflow();
  const splitResultStems = useAppStore((s) => s.splitResultStems);
  const loadedStems = useAppStore((s) => s.loadedStems);
  const setSplitError = useAppStore((s) => s.setSplitError);
  const beatGrid = useAppStore((s) => s.beatGrid);

  const audio = useAudioPlayback({
    stemStates,
    playbackBpm: beatGrid?.bpm ?? null,
  });

  const allStemEntries = useMemo(
    () => [
      ...splitResultStems.map((s) => ({ id: s.id, url: s.url })),
      ...loadedStems.map((s) => ({
        id: s.id,
        url: s.url,
        file: s.file,
      })),
    ],
    [splitResultStems, loadedStems],
  );

  const stemMedia = useStemLoading({
    allStemEntries,
    audioContextRef: audio.audioContextRef,
    setStemStates,
    setSplitError,
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
