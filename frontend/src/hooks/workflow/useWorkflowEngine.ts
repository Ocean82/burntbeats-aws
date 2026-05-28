import { useCallback } from "react";
import { useAppStore } from "../../store/appStore";
import { useWorkflow } from "../../contexts/WorkflowContext";
import { useStemSplitting } from "../useStemSplitting";
import { useAudio } from "../../contexts/AudioContext";

/**
 * useWorkflowEngine — provides high-level workflow actions (upload, split, clear)
 * by orchestrating the appStore, workflowContext, and stemSplitting hook.
 */
export function useWorkflowEngine() {
  const { setUploadState, setSplitError, uploadedFile, isSplitting, splitResultStems } = useAppStore();
  const { resetStemStates } = useWorkflow();
  const { handleFile, triggerSplit, removeLoadedStem, handleLoadStems } = useStemSplitting({
    // We'll pass the required props from App.tsx or useAudio
    // Actually, useStemSplitting needs subscription info.
  } as any); 

  const resetProject = useCallback(() => {
    resetStemStates({});
    // Additional store resets...
  }, [resetStemStates]);

  return {
    handleFile,
    triggerSplit,
    resetProject,
  };
}
