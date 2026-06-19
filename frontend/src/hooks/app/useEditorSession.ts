import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useReducedMotion } from "framer-motion";
import { useShallow } from "zustand/react/shallow";

import { useWaveformCompute } from "../useWaveformCompute";
import { useBatchQueue } from "../useBatchQueue";
import { useMixerWorkspace } from "../useMixerWorkspace";
import { useStemSplitting } from "../useStemSplitting";
import { useStemStateMaps } from "../useStemStateMaps";
import type { MixerPreset } from "../../components/MixerPresetsModal";
import { useAppStore } from "../../store/appStore";
import { useToast } from "../../store/toastStore";
import { getBurntQuip } from "../../utils/burntQuips";
import { useEventBus, useAppEvent, type AppEvent } from "../../store/eventBus";
import { useGuidanceSystem } from "../useGuidanceSystem";
import { useAppKeyboardShortcuts } from "../useAppKeyboardShortcuts";
import {
  useUiLatencyMonitor,
  startUiLatencyMark,
} from "../useUiLatencyMonitor";
import { useAudio } from "../../contexts/AudioContext";
import { useWorkflow } from "../../contexts/WorkflowContext";
import { useUiStore, type ModalKey } from "../../store/uiStore";
import { useResolvedStems } from "../workflow/useResolvedStems";
import { useEditorViewRouting } from "../workflow/useEditorViewRouting";
import { useUpsellTriggers } from "../ui/useUpsellTriggers";
import { useSessionRecoveryCoordinator } from "./useSessionRecoveryCoordinator";
import { useSubscriptionCoordinator } from "./useSubscriptionCoordinator";
import { useProcessingWorkflowCoordinator } from "./useProcessingWorkflowCoordinator";
import { useExportCoordinator } from "./useExportCoordinator";
import { useHeaderVisibility } from "../useHeaderVisibility";
import { useCheckoutNotice } from "../ui/useCheckoutNotice";
import { isLocalDevFullApp } from "../../config";
import { DEFAULT_SPLIT_INTENT } from "../../utils/splitIntent";
import type { EditorMainViewProps } from "../../app/editor-main-view.component";
import type { AppView } from "../workflow/useEditorViewRouting";

const importHelpModal = () => import("../../components/HelpModal");
const importExportOptionsModal = () =>
  import("../../components/ExportOptionsModal");
const importOnboardingTour = () => import("../../components/OnboardingTour");

const PRELOAD_CHUNK_DELAY_MS = 1200;

type NavigatorConnection = {
  saveData?: boolean;
  effectiveType?: string;
};

function canPreloadChunks(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (
    navigator as Navigator & { connection?: NavigatorConnection }
  ).connection;
  if (!connection) return true;
  if (connection.saveData) return false;
  return (
    connection.effectiveType !== "2g" && connection.effectiveType !== "slow-2g"
  );
}

export interface SessionModals {
  activeModals: Partial<Record<ModalKey, boolean>>;
  openModal: (key: ModalKey) => void;
  closeModal: (key: ModalKey) => void;
  showHelpModal: boolean;
  showExportModal: boolean;
  showPresetsModal: boolean;
  showGame: boolean;
  toggleGame: () => void;
}

export interface SessionWorkflow {
  stemStates: ReturnType<typeof useWorkflow>["stemStates"];
  setStemStates: ReturnType<typeof useWorkflow>["setStemStates"];
  undoStemStates: ReturnType<typeof useWorkflow>["undoStemStates"];
  redoStemStates: ReturnType<typeof useWorkflow>["redoStemStates"];
  canUndo: boolean;
  canRedo: boolean;
}

export interface SessionSplit {
  splitIntent: ReturnType<typeof useAppStore.getState>["splitIntent"];
  quality: ReturnType<typeof useAppStore.getState>["quality"];
  uploadName: string | null;
  uploadedFile: File | null;
  splitResultStems: ReturnType<typeof useAppStore.getState>["splitResultStems"];
  splitJobId: string | null;
  loadedStems: ReturnType<typeof useAppStore.getState>["loadedStems"];
  splitError: string | null;
  isSample: boolean;
  isDragging: boolean;
  isSplitting: boolean;
  isExpanding: boolean;
  splitProgress: number;
  uploadProgress: number;
  isUploading: boolean;
  queuePosition: number | null;
  splitElapsedSeconds: number | null;
  splitStageLabel: string | null;
  setUploadState: ReturnType<typeof useAppStore.getState>["setUploadState"];
  setSplitError: ReturnType<typeof useAppStore.getState>["setSplitError"];
  handleFile: ReturnType<typeof useStemSplitting>["handleFile"];
  handleLoadStems: ReturnType<typeof useStemSplitting>["handleLoadStems"];
  removeLoadedStem: ReturnType<typeof useStemSplitting>["removeLoadedStem"];
  triggerSplit: ReturnType<typeof useStemSplitting>["triggerSplit"];
  triggerExpand: ReturnType<typeof useStemSplitting>["triggerExpand"];
}

export interface SessionSubscription {
  subscription: ReturnType<typeof useSubscriptionCoordinator>["subscription"];
  usageBalance: ReturnType<typeof useSubscriptionCoordinator>["usageBalance"];
  usageLoading: boolean;
  stemQualityOptions: ReturnType<typeof useSubscriptionCoordinator>["stemQualityOptions"];
  canSplitFourStems: boolean;
  canExpandToFourStems: boolean;
  canUsePremiumStemQualities: boolean;
  canUseBatchQueue: boolean;
  uploadDurationSec: number | null;
  estimatedSplitTokens: number | null;
  splitQuality: ReturnType<typeof useSubscriptionCoordinator>["splitQuality"];
}

export interface SessionBatch {
  batchQueue: ReturnType<typeof useBatchQueue>["batchQueue"];
  batchQueueExpanded: boolean;
  setBatchQueueExpanded: ReturnType<typeof useBatchQueue>["setBatchQueueExpanded"];
  addToBatchQueue: ReturnType<typeof useBatchQueue>["addToBatchQueue"];
  removeFromBatchQueue: ReturnType<typeof useBatchQueue>["removeFromBatchQueue"];
  clearCompletedFromQueue: ReturnType<typeof useBatchQueue>["clearCompletedFromQueue"];
  processNextInQueue: ReturnType<typeof useBatchQueue>["processNextInQueue"];
}

export interface SessionMixer {
  mixStems: ReturnType<typeof useResolvedStems>["mixStems"];
  visibleStems: ReturnType<typeof useResolvedStems>["visibleStems"];
  activeStemId: string | undefined;
  setActiveStemId: ReturnType<typeof useMixerWorkspace>["setActiveStemId"];
  handleStemStateChange: ReturnType<typeof useMixerWorkspace>["handleStemStateChange"];
  handlePreviewStemFromMixer: ReturnType<typeof useMixerWorkspace>["handlePreviewStemFromMixer"];
  resetTrackAdjustments: ReturnType<typeof useMixerWorkspace>["resetTrackAdjustments"];
  resetSingleStem: ReturnType<typeof useMixerWorkspace>["resetSingleStem"];
  trimMap: ReturnType<typeof useStemStateMaps>["trimMap"];
  mixerState: ReturnType<typeof useStemStateMaps>["mixerState"];
  mutedStems: ReturnType<typeof useStemStateMaps>["mutedStems"];
  pitchMap: ReturnType<typeof useStemStateMaps>["pitchMap"];
  timeStretchMap: ReturnType<typeof useStemStateMaps>["timeStretchMap"];
  fadeMap: ReturnType<typeof useStemStateMaps>["fadeMap"];
  stemWaveforms: Record<string, number[]>;
  mixerSectionRef: React.RefObject<HTMLDivElement | null>;
  handleLoadPreset: (preset: MixerPreset) => void;
  handleResetSingleStem: (stemId: string) => void;
}

export interface SessionExport {
  isExporting: boolean;
  isComparingExport: boolean;
  exportCompareSummary: string | null;
  onCompareExport: ReturnType<typeof useExportCoordinator>["onCompareExport"];
  handleExportFromModal: ReturnType<typeof useExportCoordinator>["handleExportFromModal"];
  exportTrackDurationSec: ReturnType<typeof useExportCoordinator>["exportTrackDurationSec"];
  exportAllowStemBundleTargets: ReturnType<typeof useExportCoordinator>["exportAllowStemBundleTargets"];
  hasCompletedFirstExport: boolean;
  exportNotice: string | null;
}

export interface SessionUpload {
  sourceMode: ReturnType<typeof useProcessingWorkflowCoordinator>["sourceMode"];
  setSourceMode: ReturnType<typeof useProcessingWorkflowCoordinator>["setSourceMode"];
  inputRef: ReturnType<typeof useProcessingWorkflowCoordinator>["inputRef"];
  loadStemsInputRef: ReturnType<typeof useProcessingWorkflowCoordinator>["loadStemsInputRef"];
  handleFileFromInput: ReturnType<typeof useProcessingWorkflowCoordinator>["handleFileFromInput"];
  handleBrowseUpload: ReturnType<typeof useProcessingWorkflowCoordinator>["handleBrowseUpload"];
  handleClearUpload: ReturnType<typeof useProcessingWorkflowCoordinator>["handleClearUpload"];
}

export interface SessionRecovery {
  loadingJobId: string | null;
  loadingMidiJobId: string | null;
  loadHistoryJob: ReturnType<typeof useSessionRecoveryCoordinator>["loadHistoryJob"];
  loadHistoryJobToMidi: ReturnType<typeof useSessionRecoveryCoordinator>["loadHistoryJobToMidi"];
}

export interface SessionUi {
  localDevFullApp: boolean;
  reduceMotion: boolean;
  headerVisible: boolean;
  checkoutNotice: string | null;
  activeView: AppView;
  setActiveView: (view: AppView) => void;
  pricingInitialTab: "subscriptions" | "packs";
  setPricingInitialTab: (tab: "subscriptions" | "packs") => void;
  guidanceTarget: ReturnType<typeof useGuidanceSystem>["guidanceTarget"];
  guidanceRingClass: ReturnType<typeof useGuidanceSystem>["ringClass"];
  handleGuidancePanelInteract: ReturnType<typeof useGuidanceSystem>["handlePanelInteract"];
  upsellOpen: boolean;
  setUpsellOpen: (open: boolean) => void;
  upsellTrigger: ReturnType<typeof useUpsellTriggers>["upsellTrigger"];
}

export interface SessionDev {
  emit: (event: AppEvent) => void;
  latencyStats: ReturnType<typeof useUiLatencyMonitor>["latencyStats"];
  resetLatencyStats: ReturnType<typeof useUiLatencyMonitor>["resetLatencyStats"];
  toast: ReturnType<typeof useToast>["toast"];
}

// ---------------------------------------------------------------------------
// Main grouped interface
// ---------------------------------------------------------------------------
export interface EditorSession {
  audio: ReturnType<typeof useAudio>;
  modals: SessionModals;
  workflow: SessionWorkflow;
  split: SessionSplit;
  subscription: SessionSubscription;
  batch: SessionBatch;
  mixer: SessionMixer;
  export: SessionExport;
  upload: SessionUpload;
  recovery: SessionRecovery;
  ui: SessionUi;
  dev: SessionDev;
  /** Pre-composed props for EditorMainView — avoids re-computing in the shell. */
  editorMainViewProps: EditorMainViewProps;
  /** Audio stem media loading state (from AudioContext). */
  isLoadingStems: boolean;
  loadingError: string | null;
  retryLoadStems: () => void;
  resetStemMediaState: () => void;
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------
export function useEditorSession(): EditorSession {
  const localDevFullApp = isLocalDevFullApp();
  const reduceMotion = useReducedMotion() ?? false;
  const emit = useEventBus((s) => s.emit);

  const audio = useAudio();
  const {
    stemBuffers,
    setStemBuffers,
    isLoadingStems,
    clearStemLoadingState,
    loadingError,
    retryLoadStems,
  } = audio;
  const {
    stemStates,
    setStemStates,
    undoStemStates,
    redoStemStates,
    canUndo,
    canRedo,
    resetStemStates,
  } = useWorkflow();
  const {
    activeModals,
    openModal,
    closeModal,
    pricingInitialTab,
    setPricingInitialTab,
  } = useUiStore();

  const showHelpModal = !!activeModals.help;
  const showExportModal = !!activeModals.export;
  const showPresetsModal = !!activeModals.presets;
  const showGame = !!activeModals.game;
  const toggleGame = useCallback(() => closeModal("game"), [closeModal]);

  const { headerVisible } = useHeaderVisibility();
  const { checkoutNotice } = useCheckoutNotice();

  const {
    splitIntent,
    quality,
    uploadName,
    uploadedFile,
    splitResultStems,
    splitJobId,
    loadedStems,
    splitError,
    isSample,
    isDragging,
    isSplitting,
    isExpanding,
    splitProgress,
    uploadProgress,
    isUploading,
    queuePosition,
    splitElapsedSeconds,
    splitStageLabel,
    masterLimiterEnabled: persistedMasterLimiterEnabled,
    setUploadState,
    setSplitError,
  } = useAppStore(
    useShallow((s) => ({
      splitIntent: s.splitIntent,
      quality: s.quality,
      uploadName: s.uploadName,
      uploadedFile: s.uploadedFile,
      splitResultStems: s.splitResultStems,
      splitJobId: s.splitJobId,
      loadedStems: s.loadedStems,
      splitError: s.splitError,
      isSample: s.isSample,
      isDragging: s.isDragging,
      isSplitting: s.isSplitting,
      isExpanding: s.isExpanding,
      splitProgress: s.splitProgress,
      uploadProgress: s.uploadProgress,
      isUploading: s.isUploading,
      queuePosition: s.queuePosition,
      splitElapsedSeconds: s.splitElapsedSeconds,
      splitStageLabel: s.splitStageLabel,
      masterLimiterEnabled: s.masterLimiterEnabled,
      setUploadState: s.setUploadState,
      setSplitError: s.setSplitError,
    })),
  );

  const {
    subscription,
    usageBalance,
    paidBalance,
    freeMonthlyRemaining,
    usageLoading,
    stemQualityOptions,
    canSplitFourStems,
    canExpandToFourStems,
    canUsePremiumStemQualities,
    canUseBatchQueue,
    uploadDurationSec,
    estimatedSplitTokens,
    splitQuality,
  } = useSubscriptionCoordinator({
    localDevFullApp,
    splitResultStemsLength: splitResultStems.length,
    uploadedFile,
    quality,
  });

  useEffect(() => {
    audio.setMasterLimiterEnabled(persistedMasterLimiterEnabled);
  }, [persistedMasterLimiterEnabled, audio]);

  const {
    batchQueue,
    batchQueueExpanded,
    setBatchQueueExpanded,
    addToBatchQueue,
    removeFromBatchQueue,
    clearCompletedFromQueue,
    processNextInQueue,
  } = useBatchQueue();

  const {
    handleFile,
    handleLoadStems,
    removeLoadedStem,
    triggerSplit,
    triggerExpand,
  } = useStemSplitting({
    subscription,
    stopPreview: audio.stopPreview,
    splitQuality,
    canSplitFourStems,
    canExpandToFourStems,
    canUsePremiumStemQualities,
  });

  const { mixStems, visibleStems } = useResolvedStems();

  const stemEntries = useMemo(
    () => [
      ...splitResultStems.map((s) => ({ id: s.id, url: s.url })),
      ...loadedStems.map((s) => ({ id: s.id, url: s.url, file: s.file })),
    ],
    [splitResultStems, loadedStems],
  );

  const {
    activeStemId,
    setActiveStemId,
    handleStemStateChange,
    handlePreviewStemFromMixer,
    resetTrackAdjustments,
    resetSingleStem,
  } = useMixerWorkspace({
    playingStem: audio.playingStem,
    mixStems,
    stemStates,
    stemBuffers,
    setStemBuffers,
    setStemStates,
    handlePreviewStem: audio.handlePreviewStem,
  });

  const { latencyStats, resetLatencyStats } = useUiLatencyMonitor();
  const { toast } = useToast();
  const { trimMap, mixerState, mutedStems, pitchMap, timeStretchMap, fadeMap } =
    useStemStateMaps(stemStates);

  const {
    guidanceTarget,
    ringClass: guidanceRingClass,
    handlePanelInteract: handleGuidancePanelInteract,
  } = useGuidanceSystem({
    splitError,
    isSplitting,
    isExpanding,
    isLoadingStems,
    splitResultStemsLength: splitResultStems.length,
    mixStemsLength: mixStems.length,
  });

  useEffect(() => {
    if (!canPreloadChunks()) return;
    const timer = window.setTimeout(() => {
      void importOnboardingTour();
      void importHelpModal();
      void importExportOptionsModal();
    }, PRELOAD_CHUNK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const [stemWaveforms, setStemWaveformsState] = useState<
    Record<string, number[]>
  >({});

  const clearStemWaveforms = useCallback(() => {
    setStemWaveformsState({});
  }, []);

  const resetStemMediaState = useCallback(() => {
    clearStemLoadingState();
    clearStemWaveforms();
    resetStemStates({});
  }, [clearStemLoadingState, clearStemWaveforms, resetStemStates]);

  const mixerSectionRef = useRef<HTMLDivElement | null>(null);
  const focusMixerSection = useCallback(() => {
    mixerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    mixerSectionRef.current?.focus({ preventScroll: true });
  }, []);

  useWaveformCompute(stemBuffers, stemEntries, setStemWaveformsState);

  const resolvedActiveStemId = useMemo(
    () =>
      activeStemId && visibleStems.some((stem) => stem.id === activeStemId)
        ? activeStemId
        : visibleStems[0]?.id,
    [activeStemId, visibleStems],
  );

  const { activeView, setActiveView } = useEditorViewRouting();

  const {
    hasCompletedFirstExport,
    exportNotice,
    markSuccessfulExport,
    loadingJobId,
    loadingMidiJobId,
    loadHistoryJob,
    loadHistoryJobToMidi,
  } = useSessionRecoveryCoordinator({
    isSplitting,
    splitResultStemsLength: splitResultStems.length,
    splitJobId,
    resetStemMediaState,
    focusMixerSection,
    setSplitError,
    setActiveView,
    setUploadState,
  });

  const {
    sourceMode,
    setSourceMode,
    inputRef,
    loadStemsInputRef,
    handleFileFromInput,
    handleBrowseUpload,
    handleClearUpload,
  } = useProcessingWorkflowCoordinator({
    handleFile,
    resetStemMediaState,
  });

  const {
    isExporting,
    isComparingExport,
    exportCompareSummary,
    onCompareExport,
    handleExportFromModal,
    exportTrackDurationSec,
    exportAllowStemBundleTargets,
  } = useExportCoordinator({
    splitJobId,
    splitResultStems,
    loadedStemsLength: loadedStems.length,
    stemBuffers,
    stemStates,
    uploadName,
    mixStems,
    visibleStems,
    setSplitError,
    closeExportModal: () => closeModal("export"),
    onSuccessfulExport: markSuccessfulExport,
  });

  const { upsellOpen, setUpsellOpen, upsellTrigger } = useUpsellTriggers({
    isSplitting,
    splitResultStemsLength: splitResultStems.length,
    usageBalance,
    freeMonthlyRemaining,
    paidBalance,
    subscriptionActive: subscription.status === "active",
  });

  useAppEvent("open-pricing", () => setActiveView("pricing"));

  const handleLoadPreset = useCallback(
    (preset: MixerPreset) => {
      setStemStates((p) => {
        const next = { ...p };
        for (const id of Object.keys(next)) {
          if (preset.mixerState[id])
            next[id] = { ...next[id], mixer: preset.mixerState[id] };
          if (preset.trimMap[id])
            next[id] = { ...next[id], trim: preset.trimMap[id] };
          if (preset.mutedStems[id] !== undefined)
            next[id] = { ...next[id], muted: preset.mutedStems[id] };
          if (preset.pitchMap?.[id] !== undefined)
            next[id] = { ...next[id], pitchSemitones: preset.pitchMap[id] };
          if (preset.timeStretchMap?.[id] !== undefined)
            next[id] = { ...next[id], timeStretch: preset.timeStretchMap[id] };
          if (preset.fadeMap?.[id])
            next[id] = {
              ...next[id],
              fadeIn: preset.fadeMap[id].fadeIn,
              fadeOut: preset.fadeMap[id].fadeOut,
            };
        }
        return next;
      });
    },
    [setStemStates],
  );

  const handleResetSingleStem = useCallback(
    (stemId: string) => {
      resetSingleStem(stemId);
      toast(getBurntQuip("reset"), { type: "undo" });
    },
    [resetSingleStem, toast],
  );

  useAppKeyboardShortcuts({
    visibleStems,
    resolvedActiveStemId,
    mixStems,
    stemStates,
    stemBuffers,
    setStemStates,
    handlePlayMix: audio.handlePlayMix,
    handleStopMix: audio.handleStopMix,
    openModal,
    closeModal,
    showHelpModal,
    showExportModal,
    showPresetsModal,
    isPlayingMix: audio.isPlayingMix,
    undoStemStates,
    redoStemStates,
    loopEnabled: audio.loopEnabled,
    setLoopEnabled: audio.setLoopEnabled,
    setActiveView,
    onTriggerSplit: () => {
      if (
        uploadedFile &&
        !isSplitting &&
        splitResultStems.length === 0 &&
        activeView === "editor"
      ) {
        void triggerSplit(splitIntent ?? DEFAULT_SPLIT_INTENT, isSample);
      }
    },
  });

  const editorMainViewProps = useMemo<EditorMainViewProps>(
    () => ({
      reduceMotion,
      visibleStems,
      stemStates,
      onConfigureStemChange: handleStemStateChange,
      chrome: {
        guidanceTarget,
        guidanceRingClass,
        handleGuidancePanelInteract,
        subscription,
        checkoutNotice,
        uploadedFile,
        isSplitting,
        mixStemsLength: mixStems.length,
        isExporting,
      },
      processingProps: {
        sourceMode,
        onSourceModeChange: setSourceMode,
        loadStemsInputRef,
        onLoadStems: handleLoadStems,
        onRemoveLoadedStem: removeLoadedStem,
        onBrowseUpload: handleBrowseUpload,
        onClearUpload: handleClearUpload,
        onDropUpload: (file) => handleFileFromInput(file),
        inputRef,
        onUploadFileInput: (file) => handleFileFromInput(file),
        onSplit: (intent, sample) => {
          startUiLatencyMark("mixer-ready-after-stems");
          void triggerSplit(intent, sample);
        },
        onOpenWaitingGame: toggleGame,
        onAddToQueue: () => addToBatchQueue(uploadedFile),
        onNewSplit: handleClearUpload,
        onExpandToFourStems: () => void triggerExpand(),
      },
      mixerProps: {
        mixerSectionRef,
        onPointerDownMixer: handleGuidancePanelInteract,
        guidanceTarget,
        guidanceRingClass,
        onResetLevels: resetTrackAdjustments,
        onResetSingleStem: handleResetSingleStem,
        stemWaveforms,
        activeStemId,
        onActiveStemChange: setActiveStemId,
        onStemStateChange: handleStemStateChange,
        onPreviewStem: handlePreviewStemFromMixer,
        onExport: () => {
          if (isSample) {
            setActiveView("pricing");
          } else {
            openModal("export");
          }
        },
        isExporting,
        isComparingExport,
        onCompareExport,
        exportCompareSummary,
        onLoadGenrePreset: handleLoadPreset,
      },
    }),
    [
      reduceMotion,
      guidanceTarget,
      guidanceRingClass,
      handleGuidancePanelInteract,
      subscription,
      checkoutNotice,
      uploadedFile,
      isSplitting,
      mixStems.length,
      visibleStems,
      stemStates,
      isExporting,
      sourceMode,
      setSourceMode,
      loadStemsInputRef,
      handleLoadStems,
      removeLoadedStem,
      handleBrowseUpload,
      handleClearUpload,
      handleFileFromInput,
      inputRef,
      triggerSplit,
      toggleGame,
      addToBatchQueue,
      triggerExpand,
      mixerSectionRef,
      resetTrackAdjustments,
      handleResetSingleStem,
      stemWaveforms,
      activeStemId,
      setActiveStemId,
      handleStemStateChange,
      handlePreviewStemFromMixer,
      isSample,
      openModal,
      setActiveView,
      isComparingExport,
      onCompareExport,
      exportCompareSummary,
      handleLoadPreset,
    ],
  );

  return {
    audio,
    modals: {
      activeModals,
      openModal,
      closeModal,
      showHelpModal,
      showExportModal,
      showPresetsModal,
      showGame,
      toggleGame,
    },
    workflow: {
      stemStates,
      setStemStates,
      undoStemStates,
      redoStemStates,
      canUndo,
      canRedo,
    },
    split: {
      splitIntent,
      quality,
      uploadName,
      uploadedFile,
      splitResultStems,
      splitJobId,
      loadedStems,
      splitError,
      isSample,
      isDragging,
      isSplitting,
      isExpanding,
      splitProgress,
      uploadProgress,
      isUploading,
      queuePosition,
      splitElapsedSeconds,
      splitStageLabel,
      setUploadState,
      setSplitError,
      handleFile,
      handleLoadStems,
      removeLoadedStem,
      triggerSplit,
      triggerExpand,
    },
    subscription: {
      subscription,
      usageBalance,
      usageLoading,
      stemQualityOptions,
      canSplitFourStems,
      canExpandToFourStems,
      canUsePremiumStemQualities,
      canUseBatchQueue,
      uploadDurationSec,
      estimatedSplitTokens,
      splitQuality,
    },
    batch: {
      batchQueue,
      batchQueueExpanded,
      setBatchQueueExpanded,
      addToBatchQueue,
      removeFromBatchQueue,
      clearCompletedFromQueue,
      processNextInQueue,
    },
    mixer: {
      mixStems,
      visibleStems,
      activeStemId,
      setActiveStemId,
      handleStemStateChange,
      handlePreviewStemFromMixer,
      resetTrackAdjustments,
      resetSingleStem,
      trimMap,
      mixerState,
      mutedStems,
      pitchMap,
      timeStretchMap,
      fadeMap,
      stemWaveforms,
      mixerSectionRef,
      handleLoadPreset,
      handleResetSingleStem,
    },
    export: {
      isExporting,
      isComparingExport,
      exportCompareSummary,
      onCompareExport,
      handleExportFromModal,
      exportTrackDurationSec,
      exportAllowStemBundleTargets,
      hasCompletedFirstExport,
      exportNotice,
    },
    upload: {
      sourceMode,
      setSourceMode,
      inputRef,
      loadStemsInputRef,
      handleFileFromInput,
      handleBrowseUpload,
      handleClearUpload,
    },
    recovery: {
      loadingJobId,
      loadingMidiJobId,
      loadHistoryJob,
      loadHistoryJobToMidi,
    },
    ui: {
      localDevFullApp,
      reduceMotion,
      headerVisible,
      checkoutNotice,
      activeView,
      setActiveView,
      pricingInitialTab,
      setPricingInitialTab,
      guidanceTarget,
      guidanceRingClass,
      handleGuidancePanelInteract,
      upsellOpen,
      setUpsellOpen,
      upsellTrigger,
    },
    dev: {
      emit,
      latencyStats,
      resetLatencyStats,
      toast,
    },
    editorMainViewProps,
    isLoadingStems,
    loadingError,
    retryLoadStems,
    resetStemMediaState,
  };
}
