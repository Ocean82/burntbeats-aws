import type React from "react";
import type { SplitIntent } from "@shared/types";

export interface LoadedStem {
  id: string;
  label: string;
  url: string;
  file: File;
}

/** Session-owned actions; upload/split state comes from stores via useProcessingSettingsData. */
export interface ProcessingSettingsPanelProps {
  sourceMode: "split" | "load";
  onSourceModeChange: (mode: "split" | "load") => void;

  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  loadStemsInputRef: React.MutableRefObject<HTMLInputElement | null>;
  onBrowseUpload: () => void;
  onClearUpload: () => void;
  onDropUpload: (file: File | null) => void;
  onUploadFileInput: (file: File | null) => void;

  onLoadStems: (files: FileList | null) => void;
  onRemoveLoadedStem: (id: string) => void;
  onSplit: (intent: SplitIntent, isSample?: boolean) => void;

  onNewSplit?: () => void;
  onAddToQueue?: () => void;
  onOpenWaitingGame?: () => void;
  onExpandToFourStems?: () => void;
}
