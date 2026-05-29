import { useMemo } from "react";

export const EDITOR_WORKFLOW_STEPS = [
  { id: "upload", label: "Upload" },
  { id: "split", label: "Split" },
  { id: "mix", label: "Mix" },
] as const;

export type EditorWorkflowStepId = (typeof EDITOR_WORKFLOW_STEPS)[number]["id"];

export interface EditorWorkflowInput {
  uploadedFile: File | null;
  isSplitting: boolean;
  mixStemsLength: number;
  isExporting: boolean;
}

export function useEditorWorkflowSteps({
  uploadedFile,
  isSplitting,
  mixStemsLength,
  isExporting,
}: EditorWorkflowInput) {
  return useMemo(() => {
    const completedStepIds: string[] = [];
    if (uploadedFile) completedStepIds.push("upload");
    if (mixStemsLength > 0) {
      completedStepIds.push("upload", "split");
    }

    let activeStepId: EditorWorkflowStepId = "upload";
    if (isExporting || mixStemsLength > 0) {
      activeStepId = "mix";
    } else if (isSplitting || uploadedFile) {
      activeStepId = "split";
    }

    return {
      steps: EDITOR_WORKFLOW_STEPS,
      activeStepId,
      completedStepIds,
    };
  }, [uploadedFile, isSplitting, mixStemsLength, isExporting]);
}
