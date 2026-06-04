import React, { createContext, useContext, useMemo } from "react";
import type { StemEditorState } from "../stem-editor-state";
import { useWorkflowStore } from "../store/workflowStore";

interface WorkflowContextValue {
  stemStates: Record<string, StemEditorState>;
  setStemStates: (
    newState:
      | Record<string, StemEditorState>
      | ((
          prev: Record<string, StemEditorState>,
        ) => Record<string, StemEditorState>),
  ) => void;
  undoStemStates: () => void;
  redoStemStates: () => void;
  canUndo: boolean;
  canRedo: boolean;
  resetStemStates: (initialState: Record<string, StemEditorState>) => void;
}

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

export const WorkflowProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const stemStates = useWorkflowStore((s) => s.stemStates);
  const setStemStates = useWorkflowStore((s) => s.setStemStates);
  const undoStemStates = useWorkflowStore((s) => s.undo);
  const redoStemStates = useWorkflowStore((s) => s.redo);
  const canUndo = useWorkflowStore((s) => s.canUndo);
  const canRedo = useWorkflowStore((s) => s.canRedo);
  const resetStemStates = useWorkflowStore((s) => s.reset);

  const value = useMemo(
    () => ({
      stemStates,
      setStemStates,
      undoStemStates,
      redoStemStates,
      canUndo,
      canRedo,
      resetStemStates,
    }),
    [
      stemStates,
      setStemStates,
      undoStemStates,
      redoStemStates,
      canUndo,
      canRedo,
      resetStemStates,
    ],
  );

  return (
    <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>
  );
};

export const useWorkflow = () => {
  const context = useContext(WorkflowContext);
  if (!context) {
    throw new Error("useWorkflow must be used within a WorkflowProvider");
  }
  return context;
};
