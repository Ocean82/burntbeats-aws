import { useCallback } from "react";
import type { ExportOptions } from "../components";
import type { StemEditorState } from "../stem-editor-state";

type ExportableStem = { id: string; url: string };

interface UseExportModalActionArgs {
  handleExportWithOptions: (
    options: ExportOptions,
    stemBuffers: Record<string, AudioBuffer>,
    splitResultStems: ExportableStem[],
    stemStates: Record<string, StemEditorState>,
    uploadName: string,
    onError: (msg: string) => void,
    onClose: () => void,
    serverExportJobId?: string | null,
    serverExportStemIds?: string[],
    onSuccess?: () => void,
  ) => Promise<void>;
  stemBuffers: Record<string, AudioBuffer>;
  mixStems: ExportableStem[];
  stemStates: Record<string, StemEditorState>;
  uploadName: string;
  setSplitError: (msg: string) => void;
  closeExportModal: () => void;
  loadedStemCount: number;
  splitJobId: string | null;
  splitResultStems: ExportableStem[];
  onSuccessfulExport: () => void;
}

export function useExportModalAction({
  handleExportWithOptions,
  stemBuffers,
  mixStems,
  stemStates,
  uploadName,
  setSplitError,
  closeExportModal,
  loadedStemCount,
  splitJobId,
  splitResultStems,
  onSuccessfulExport,
}: UseExportModalActionArgs) {
  return useCallback(
    async (opts: ExportOptions) => {
      await handleExportWithOptions(
        opts,
        stemBuffers,
        mixStems,
        stemStates,
        uploadName,
        setSplitError,
        closeExportModal,
        loadedStemCount === 0 ? splitJobId : null,
        loadedStemCount === 0 ? splitResultStems.map((s) => s.id) : [],
        onSuccessfulExport,
      );
    },
    [
      closeExportModal,
      handleExportWithOptions,
      loadedStemCount,
      mixStems,
      onSuccessfulExport,
      setSplitError,
      splitJobId,
      splitResultStems,
      stemBuffers,
      stemStates,
      uploadName,
    ],
  );
}
