import { useMemo } from "react";

export const MIDI_WORKFLOW_STEPS = [
  { id: "source", label: "Source" },
  { id: "settings", label: "Settings" },
  { id: "convert", label: "Convert" },
  { id: "result", label: "Result" },
] as const;

export type MidiWorkflowStepId = (typeof MIDI_WORKFLOW_STEPS)[number]["id"];

export interface MidiWorkflowInput {
  hasSourceSelected: boolean;
  isConverting: boolean;
  isUploading: boolean;
  hasResult: boolean;
  isBatchInProgress: boolean;
}

export function useMidiWorkflowSteps({
  hasSourceSelected,
  isConverting,
  isUploading,
  hasResult,
  isBatchInProgress,
}: MidiWorkflowInput) {
  return useMemo(() => {
    const completedStepIds: string[] = [];
    if (hasSourceSelected) completedStepIds.push("source");
    if (hasSourceSelected && !isConverting && !isUploading) {
      completedStepIds.push("settings");
    }
    if (hasResult || isBatchInProgress) {
      completedStepIds.push("convert");
    }

    let activeStepId: MidiWorkflowStepId = "source";
    if (hasResult) activeStepId = "result";
    else if (isConverting || isUploading || isBatchInProgress) activeStepId = "convert";
    else if (hasSourceSelected) activeStepId = "settings";

    return {
      steps: MIDI_WORKFLOW_STEPS,
      activeStepId,
      completedStepIds,
    };
  }, [
    hasSourceSelected,
    isConverting,
    isUploading,
    hasResult,
    isBatchInProgress,
  ]);
}
