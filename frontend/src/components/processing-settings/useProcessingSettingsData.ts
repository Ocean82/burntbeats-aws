import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../store/appStore";
import { useAppSubscription } from "../../hooks/useAppSubscription";
import { useAudioFileDuration } from "../../hooks/useAudioFileDuration";
import { computeTokensFromDurationSeconds } from "../../utils/tokenCost";
import { isLocalDevFullApp } from "../../config";

export function useProcessingSettingsData() {
  const localDevFullApp = isLocalDevFullApp();

  const {
    uploadName,
    uploadedFile,
    loadedStems,
    quality,
    isDragging,
    isSplitting,
    isExpanding,
    splitProgress,
    uploadProgress,
    isUploading,
    queuePosition,
    jobsAhead,
    splitElapsedSeconds,
    splitStageLabel,
    splitResultStems,
    splitError,
    splitJobId,
    isSample,
    setUploadState,
    setSplitError,
  } = useAppStore(
    useShallow((s) => ({
      uploadName: s.uploadName,
      uploadedFile: s.uploadedFile,
      loadedStems: s.loadedStems,
      quality: s.quality,
      isDragging: s.isDragging,
      isSplitting: s.isSplitting,
      isExpanding: s.isExpanding,
      splitProgress: s.splitProgress,
      uploadProgress: s.uploadProgress,
      isUploading: s.isUploading,
      queuePosition: s.queuePosition,
      jobsAhead: s.jobsAhead,
      splitElapsedSeconds: s.splitElapsedSeconds,
      splitStageLabel: s.splitStageLabel,
      splitResultStems: s.splitResultStems,
      splitError: s.splitError,
      splitJobId: s.splitJobId,
      isSample: s.isSample,
      setUploadState: s.setUploadState,
      setSplitError: s.setSplitError,
    })),
  );

  const {
    subscription,
    usageBalance,
    usageLoading,
    stemQualityOptions,
    canSplitFourStems,
    canExpandToFourStems,
    canUseBatchQueue,
  } = useAppSubscription({
    localDevFullApp,
    splitResultStemsLength: splitResultStems.length,
  });

  const uploadDurationSec = useAudioFileDuration(uploadedFile);
  const estimatedSplitTokens = useMemo(
    () => computeTokensFromDurationSeconds(uploadDurationSec),
    [uploadDurationSec],
  );

  const isCollapsed = splitResultStems.length > 0 && !isSplitting;
  const subscriptionInactive = subscription.status === "inactive";

  return {
    uploadName,
    uploadedFile,
    loadedStems,
    loadedStemCount: loadedStems.length,
    quality,
    isDragging,
    isSplitting,
    isExpanding,
    splitProgress,
    uploadProgress,
    isUploading,
    queuePosition,
    jobsAhead,
    splitElapsedSeconds,
    splitStageLabel,
    splitResultStemsLength: splitResultStems.length,
    splitError,
    splitJobId,
    isSample,
    setUploadState,
    setSplitError,
    subscription,
    usageBalance,
    usageLoading,
    stemQualityOptions,
    canSplitFourStems,
    canExpandToFourStems,
    canUseBatchQueue,
    uploadDurationSec,
    estimatedSplitTokens,
    isCollapsed,
    subscriptionInactive,
    onQualityChange: (next: typeof quality) =>
      setUploadState((prev) => ({ ...prev, quality: next })),
    onSetIsDragging: (next: boolean) =>
      setUploadState((prev) => ({ ...prev, isDragging: next })),
    onDismissError: () => setSplitError(null),
    onUpgradeToPremium: () =>
      void subscription.startCheckout("premium", {
        source: "upgrade_prompt",
        intent: "four_stem_unlock",
      }),
    onContinueCheckout: () =>
      void subscription.startCheckout("basic", {
        source: "split_gate",
        intent: "continue_from_split_blocker",
      }),
  };
}
