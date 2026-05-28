import React, { createContext, useContext, useMemo } from "react";
import { useAudioPlayback } from "../hooks/useAudioPlayback";
import type { UseAudioPlaybackReturn } from "../hooks/useAudioPlayback";
import { useWorkflow } from "./WorkflowContext";

const AudioContext = createContext<UseAudioPlaybackReturn | null>(null);

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { stemStates } = useWorkflow();
  
  const audio = useAudioPlayback({
    stemStates,
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
