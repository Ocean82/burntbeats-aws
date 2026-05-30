import React, { createContext, useContext, useMemo } from "react";
import { useHistory } from "../hooks/useHistory";
import type { StemEditorState } from "../stem-editor-state";
import { useAppStore } from "../store/appStore";
import { useStemLoading } from "../hooks/useStemLoading";

interface WorkflowContextValue {
  stemStates: Record<string, StemEditorState>;
  setStemStates: (newState: Record<string, StemEditorState> | ((prev: Record<string, StemEditorState>) => Record<string, StemEditorState>)) => void;
  undoStemStates: () => void;
  redoStemStates: () => void;
  canUndo: boolean;
  canRedo: boolean;
  resetStemStates: (initialState: Record<string, StemEditorState>) => void;
  
  // Stem loading state
  stemBuffers: Record<string, AudioBuffer>;
  isLoadingStems: boolean;
  loadingError: string | null;
  retryLoadStems: () => void;
  clearStemLoadingState: () => void;
}

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

export const WorkflowProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { splitResultStems, loadedStems, setSplitError } = useAppStore();
  
  const {
    state: stemStates,
    set: setStemStates,
    undo: undoStemStates,
    redo: redoStemStates,
    canUndo,
    canRedo,
    reset: resetStemStates,
  } = useHistory<Record<string, StemEditorState>>({});

  // Temporary ref for audioContext until we can properly inject it
  // Actually, useAudio() might cause circular dependency if we're not careful.
  // Let's use a local ref for decoding if needed, or pass it in.
  const audioContextRef = React.useRef<AudioContext | null>(null);

  const allStemEntries = useMemo(() => [
    ...splitResultStems.map((s) => ({ id: s.id, url: s.url })),
    ...loadedStems.map((s) => ({ id: s.id, url: s.url, file: s.file })),
  ], [splitResultStems, loadedStems]);

  const {
    stemBuffers,
    isLoadingStems,
    loadingError,
    retryLoadStems,
    clearStemLoadingState,
  } = useStemLoading({
    allStemEntries,
    audioContextRef,
    setStemStates,
    setSplitError,
  });

  const value = useMemo(() => ({
    stemStates,
    setStemStates,
    undoStemStates,
    redoStemStates,
    canUndo,
    canRedo,
    resetStemStates,
    stemBuffers,
    isLoadingStems,
    loadingError,
    retryLoadStems,
    clearStemLoadingState,
  }), [
    stemStates, 
    setStemStates, 
    undoStemStates, 
    redoStemStates, 
    canUndo, 
    canRedo, 
    resetStemStates,
    stemBuffers,
    isLoadingStems,
    loadingError,
    retryLoadStems,
    clearStemLoadingState,
  ]);

  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  );
};

export const useWorkflow = () => {
  const context = useContext(WorkflowContext);
  if (!context) {
    throw new Error("useWorkflow must be used within a WorkflowProvider");
  }
  return context;
};
