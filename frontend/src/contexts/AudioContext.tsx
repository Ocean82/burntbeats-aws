import React, { createContext, useContext } from "react";
import { useAudioPlayback } from "../hooks/useAudioPlayback";
import type { UseAudioPlaybackReturn } from "../hooks/useAudioPlayback";
import { useWorkflow } from "./WorkflowContext";
import { useAppStore } from "../store/appStore";

const AudioContext = createContext<UseAudioPlaybackReturn | null>(null);

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { stemStates } = useWorkflow();
  const beatGrid = useAppStore((s) => s.beatGrid);

  const audio = useAudioPlayback({
    stemStates,
    playbackBpm: beatGrid?.bpm ?? null,
  });

  return (
    <AudioContext.Provider value={audio}>
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error("useAudio must be used within an AudioProvider");
  }
  return context;
};
