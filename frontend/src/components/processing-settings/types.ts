import type React from "react";
import type { SplitQuality } from "../../api";

export interface LoadedStem {
  id: string;
  label: string;
  url: string;
  file: File;
}

export interface ProcessingSettingsPanelProps {
  sourceMode: "split" | "load";
  onSourceModeChange: (mode: "split" | "load") => void;

  uploadName: string;
  uploadedFile: File | null;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  onBrowseUpload: () => void;
  onClearUpload: () => void;
  onDropUpload: (file: File | null) => void;
  onUploadFileInput: (file: File | null) => void;
  isDragging: boolean;
  onSetIsDragging: (isDragging: boolean) => void;

  loadedStemCount: number;
  loadStemsInputRef: React.MutableRefObject<HTMLInputElement | null>;
  onLoadStems: (files: FileList | null) => void;
  loadedStems: LoadedStem[];
  onRemoveLoadedStem: (id: string) => void;

  quality: SplitQuality;
  onQualityChange: (next: SplitQuality) => void;
  stemQualityOptions?: "speed_only" | "full";
  canSplitFourStems?: boolean;

  onSplit: (requestedStemMode: 2 | 4, isSample?: boolean) => void;
  isSplitting: boolean;
  splitProgress?: number;
  /** Upload progress (0–100) during file transfer to server. */
  uploadProgress?: number;
  /** Whether the file is currently being uploaded (before split processing begins). */
  isUploading?: boolean;
  /** Queue position when job is waiting (1 = next to run). */
  queuePosition?: number | null;
  splitElapsedSeconds?: number | null;
  splitStageLabel?: string | null;
  splitResultStemsLength: number;

  splitError: string | null;
  onDismissError: () => void;

  canUseBatchQueue?: boolean;
  onAddToQueue: () => void;
  onUpgradeToPremium?: () => void;

  /** When true, show copy that splitting requires an active plan (checkout opens from Split). */
  subscriptionInactive?: boolean;
  /** Explicit conversion CTA shown when split is blocked by inactive plan. */
  onContinueCheckout?: () => void;
  /** Called when user confirms they want to clear the current split and start fresh. */
  onNewSplit?: () => void;
  /** Metering: remaining tokens from Clerk (null = unknown / loading). */
  usageBalance?: number | null;
  usageLoading?: boolean;
  /** Duration of uploaded file in seconds (for upload bar + progress ETA). */
  uploadDurationSec?: number | null;
  /** Estimated tokens for the current split job (~minutes, ceil). */
  estimatedSplitTokens?: number | null;
  /**
   * When true, the panel renders in a compact collapsed bar.
   * The user can expand it by clicking "Edit Source".
   */
  isCollapsed?: boolean;
  onOpenWaitingGame?: () => void;
}
