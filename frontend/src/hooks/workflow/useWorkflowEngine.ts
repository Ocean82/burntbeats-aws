import { useCallback } from "react";
import { useWorkflow } from "../../contexts/WorkflowContext";

/**
 * useWorkflowEngine — provides high-level workflow actions (upload, split, clear)
 * by orchestrating the appStore, workflowContext, and stemSplitting hook.
 *
 * WIP: full orchestration is not wired yet; App.tsx still owns upload/split flows.
 */
export function useWorkflowEngine() {
  const { resetStemStates } = useWorkflow();

  const resetProject = useCallback(() => {
    resetStemStates({});
  }, [resetStemStates]);

  return {
    handleFile: () => {},
    triggerSplit: async () => {},
    resetProject,
  };
}
