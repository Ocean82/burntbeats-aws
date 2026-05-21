import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocation } from "wouter";

const importHelpModal = () => import("./components/HelpModal");
const importExportOptionsModal = () =>
  import("./components/ExportOptionsModal");
const importOnboardingTour = () => import("./components/OnboardingTour");
const OnboardingTour = lazy(() =>
  importOnboardingTour().then((m) => ({ default: m.OnboardingTour })),
);
import { useAppSubscription } from "./hooks/useAppSubscription";
import type { StemDefinition, StemId, MixerState, TrimState } from "./types";
import { useAudioPlayback } from "./hooks/useAudioPlayback";
import { useWaveformCompute } from "./hooks/useWaveformCompute";
import { useExport } from "./hooks/useExport";
import { useBatchQueue } from "./hooks/useBatchQueue";
import { useHistory } from "./hooks/useHistory";
import { useMixerWorkspace } from "./hooks/useMixerWorkspace";
import { useStemSplitting } from "./hooks/useStemSplitting";
import { useStemLoading } from "./hooks/useStemLoading";
import { useLoadHistoryJob } from "./hooks/useLoadHistoryJob";
import {
  stemDefinitions,
  getStemDefinition,
  getLoadedStemDefinition,
} from "./data/stemDefinitions";
import type { MixerPreset } from "./components/MixerPresetsModal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { isLocalDevFullApp } from "./config";
import type { StemEditorState } from "./stem-editor-state";

import { useAppStore } from "./store/appStore";
import { useToast } from "./store/toastStore";
import { useEventBus, useAppEvent } from "./store/eventBus";
import { useUiModals } from "./hooks/useUiModals";
import { useGuidanceSystem } from "./hooks/useGuidanceSystem";
import { useAppKeyboardShortcuts } from "./hooks/useAppKeyboardShortcuts";
import { useExportCompare } from "./hooks/useExportCompare";
import { useExportModalAction } from "./hooks/useExportModalAction";
import {
  useUiLatencyMonitor,
  startUiLatencyMark,
} from "./hooks/useUiLatencyMonitor";
import { PricingPage } from "./components/PricingPage";
import { MyStemsPage } from "./components/MyStemsPage";
import { UpsellModal } from "./components/UpsellModal";
import { FeedbackChip } from "./components/FeedbackChip";
import {
  ENABLE_ONBOARDING_QUEST,
} from "./config/uiFlags";
import { useAudioFileDuration } from "./hooks/useAudioFileDuration";
import { computeTokensFromDurationSeconds } from "./utils/tokenCost";
import { EditorHeader } from "./app/editor-header.component";
import { WaitingGamePanel } from "./app/waiting-game-panel.component";
import { DevLatencyPanel } from "./app/dev-latency-panel.component";
import { LazyModalLayer } from "./app/lazy-modal-layer.component";
import { AppBackgroundOrbs } from "./app/app-background-orbs.component";
import { EditorFloatingOverlays } from "./app/editor-floating-overlays.component";
import { EditorMainView } from "./app/editor-main-view.component";
import { SpeechCleanPage } from "./pages/SpeechCleanPage";
import { MidiConvertPage } from "./pages/MidiConvertPage";
import { useHeaderVisibility } from "./hooks/useHeaderVisibility";

type StemWithOptionalUrl = StemDefinition & { url?: string };
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

export function App() {
  const localDevFullApp = isLocalDevFullApp();
  const reduceMotion = useReducedMotion();
  const emit = useEventBus((s) => s.emit);

  // ── Smart Sticky Header State ─────────────────────────────────────────────
  const { headerVisible } = useHeaderVisibility();
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);

  useEffect(() => {
    const msg = window.sessionStorage.getItem("burntbeats_checkout_notice");
    if (!msg) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from sessionStorage
    setCheckoutNotice(msg);
    window.sessionStorage.removeItem("burntbeats_checkout_notice");
  }, []);

  // ── Upload / split state ──────────────────────────────────────────────────
  const uploadState = useAppStore();
  const {
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
    beatGrid,
    splitProgress,
    uploadProgress,
    isUploading,
    queuePosition,
    splitElapsedSeconds,
    masterLimiterEnabled: persistedMasterLimiterEnabled,
    setUploadState,
    setSplitError,
    setMasterLimiterEnabled: setPersistedMasterLimiterEnabled,
  } = uploadState;

  const uploadDurationSec = useAudioFileDuration(uploadedFile);
  const estimatedSplitTokens = useMemo(
    () => computeTokensFromDurationSeconds(uploadDurationSec),
    [uploadDurationSec],
  );

  // ── Subscription / billing ────────────────────────────────────────────────
  const {
    subscription,
    usageBalance,
    usageLoading,
    isBasicPlan,
    stemQualityOptions,
    canExpandToFourStems,
    canUseBatchQueue,
  } = useAppSubscription({
    localDevFullApp,
    splitResultStemsLength: splitResultStems.length,
  });
  const splitQuality = useMemo(
    () => (isBasicPlan ? "speed" : quality),
    [isBasicPlan, quality],
  );

  // ── Stem data state ───────────────────────────────────────────────────────
  const {
    state: stemStates,
    set: setStemStates,
    undo: undoStemStates,
    redo: redoStemStates,
    canUndo,
    canRedo,
    reset: resetStemStates,
  } = useHistory<Record<string, StemEditorState>>({});

  // ── Audio playback hook ───────────────────────────────────────────────────
  const {
    isPlayingMix,
    playingStem,
    loadingPreviewStemId,
    getPlayheadPosition,
    subscribePlayheadPosition,
    audioContextRef,
    handlePlayMix,
    handleSeekMix,
    handleStopMix,
    handlePreviewStem,
    stopPreview,
    getMasterAnalyserTimeDomainData,
    getMasterAnalyserTimeDomainDataLeft,
    getMasterAnalyserTimeDomainDataRight,
    getMasterAnalyserFrequencyData,
    getStemAnalyserTimeDomainData,
    masterVolume,
    setMasterVolume,
    masterLimiterEnabled,
    setMasterLimiterEnabled: setRuntimeMasterLimiterEnabled,
    loopEnabled,
    setLoopEnabled,
  } = useAudioPlayback({
    onError: (message) => setSplitError(message),
    stemStates,
  });

  useEffect(() => {
    setRuntimeMasterLimiterEnabled(persistedMasterLimiterEnabled);
  }, [persistedMasterLimiterEnabled, setRuntimeMasterLimiterEnabled]);

  const handleMasterLimiterEnabledChange = useCallback(
    (enabled: boolean) => {
      setRuntimeMasterLimiterEnabled(enabled);
      setPersistedMasterLimiterEnabled(enabled);
    },
    [setPersistedMasterLimiterEnabled, setRuntimeMasterLimiterEnabled],
  );

  // ── Export hook ───────────────────────────────────────────────────────────
  const {
    isExporting,
    handleExportWithOptions,
    compareMasterExportServerAndClient,
  } = useExport();

  // ── Batch queue hook ──────────────────────────────────────────────────────
  const {
    batchQueue,
    batchQueueExpanded,
    setBatchQueueExpanded,
    addToBatchQueue,
    removeFromBatchQueue,
    clearCompletedFromQueue,
    processNextInQueue,
  } = useBatchQueue();

  // ── Stem splitting (file handling + split + expand) ────────────────────────
  const {
    handleFile,
    handleLoadStems,
    removeLoadedStem,
    triggerSplit,
    triggerExpand,
  } = useStemSplitting({
    subscription,
    stopPreview,
    splitQuality,
    isBasicPlan,
  });

  // ── All stems (split + loaded) for mixer ───────────────────────────────────
  const allStemEntries = useMemo(
    () => [
      ...splitResultStems.map((s) => ({ id: s.id, url: s.url })),
      ...loadedStems.map((s) => ({ id: s.id, url: s.url })),
    ],
    [splitResultStems, loadedStems],
  );

  const mixStems = useMemo(
    () =>
      [...splitResultStems, ...loadedStems] as Array<{
        id: string;
        url: string;
      }>,
    [splitResultStems, loadedStems],
  );

  /** Per-stem file export only works for job-backed URLs from separation — not blob-loaded files. */
  const exportAllowStemBundleTargets = useMemo(
    () => mixStems.some((s) => s.url.includes("/api/stems/file/")),
    [mixStems],
  );

  // ── Stem loading (fetch WAVs → AudioBuffers) ──────────────────────────────
  const {
    stemBuffers,
    setStemBuffers,
    isLoadingStems,
    clearStemLoadingState,
    loadingError,
    retryLoadStems,
  } = useStemLoading({
    allStemEntries,
    audioContextRef,
    setStemStates,
    setSplitError,
  });

  const { isComparingExport, exportCompareSummary, onCompareExport } =
    useExportCompare({
      compareMasterExportServerAndClient,
      loadedStemCount: loadedStems.length,
      splitJobId,
      splitResultStems,
      stemBuffers,
      stemStates,
      uploadName,
    });
  const handleExportFromModal = useExportModalAction({
    handleExportWithOptions,
    stemBuffers,
    mixStems,
    stemStates,
    uploadName,
    setSplitError,
    closeExportModal: () => closeModal("export"),
    loadedStemCount: loadedStems.length,
    splitJobId,
    splitResultStems,
    onSuccessfulExport: () => {
      setExportNotice(
        "Download started — check your browser’s downloads folder.",
      );
      setHasCompletedFirstExport(true);
    },
  });

  // ── Mixer workspace ───────────────────────────────────────────────────────
  const {
    activeStemId,
    setActiveStemId,
    handleStemStateChange,
    handlePreviewStemFromMixer,
    resetTrackAdjustments,
    resetSingleStem,
  } = useMixerWorkspace({
    playingStem,
    mixStems,
    stemStates,
    stemBuffers,
    setStemBuffers,
    setStemStates,
    handlePreviewStem,
  });

  // ── UI state ──────────────────────────────────────────────────────────────
  const {
    showHelp: showHelpModal,
    showExport: showExportModal,
    showPresets: showPresetsModal,
    showGame,
    openModal,
    closeModal,
    toggleGame,
  } = useUiModals();
  const { latencyStats, resetLatencyStats } = useUiLatencyMonitor();
  const { toast } = useToast();
  const [sourceMode, setSourceMode] = useState<"split" | "load">("split");

  const inputRef = useRef<HTMLInputElement | null>(null);
  const loadStemsInputRef = useRef<HTMLInputElement | null>(null);

  // Derived shims for modals (single pass over stemStates)
  const { trimMap, mixerState, mutedStems, pitchMap, timeStretchMap, fadeMap } =
    useMemo(() => {
      const trim: Record<string, TrimState> = {};
      const mixer: Record<string, MixerState> = {};
      const muted: Record<string, boolean> = {};
      const pitch: Record<string, number> = {};
      const stretch: Record<string, number> = {};
      const fades: Record<string, { fadeIn: number; fadeOut: number }> = {};
      for (const [id, s] of Object.entries(stemStates)) {
        trim[id] = s.trim;
        mixer[id] = s.mixer;
        muted[id] = s.muted;
        pitch[id] = s.pitchSemitones ?? 0;
        stretch[id] = s.timeStretch ?? 1;
        fades[id] = { fadeIn: s.fadeIn ?? 0, fadeOut: s.fadeOut ?? 0 };
      }
      return {
        trimMap: trim,
        mixerState: mixer,
        mutedStems: muted,
        pitchMap: pitch,
        timeStretchMap: stretch,
        fadeMap: fades,
      };
    }, [stemStates]);

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
      // Light, likely-next interactions after initial paint.
      void importOnboardingTour();
      void importHelpModal();
      void importExportOptionsModal();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  const [stemWaveforms, setStemWaveformsState] = useState<
    Record<string, number[]>
  >({});

  const clearStemWaveforms = useCallback(() => {
    setStemWaveformsState({});
  }, []);

  useWaveformCompute(stemBuffers, allStemEntries, setStemWaveformsState);

  const visibleStems = useMemo(() => {
    const fromSplit = splitResultStems.map((s) => ({
      ...getStemDefinition(s.id),
      id: s.id as StemId,
      url: s.url,
    }));
    const fromLoaded = loadedStems.map((s) => ({
      ...getLoadedStemDefinition(s.id, s.label),
      id: s.id as StemId,
      url: s.url,
    }));
    if (fromSplit.length > 0 || fromLoaded.length > 0)
      return [...fromSplit, ...fromLoaded];
    // Before splitting, show the full default rack (helps solo/mute keyboard shortcuts).
    return stemDefinitions.map((s) => ({ ...s, id: s.id as StemId }));
  }, [splitResultStems, loadedStems]);
  const resolvedActiveStemId = useMemo(
    () =>
      activeStemId && visibleStems.some((stem) => stem.id === activeStemId)
        ? activeStemId
        : visibleStems[0]?.id,
    [activeStemId, visibleStems],
  );

  const [location, navigate] = useLocation();
  const activeView: "editor" | "speech" | "midi" | "pricing" | "my-stems" =
    location === "/pricing" ? "pricing" :
    location === "/my-stems" ? "my-stems" :
    location === "/speech" ? "speech" :
    location === "/midi" ? "midi" :
    "editor";
  const setActiveView = useCallback((view: "editor" | "speech" | "midi" | "pricing" | "my-stems") => {
    navigate(view === "editor" ? "/" : `/${view}`);
  }, [navigate]);
  const [pricingInitialTab, setPricingInitialTab] = useState<"subscriptions" | "packs">("subscriptions");

  // ── Upsell modal state ────────────────────────────────────────────────────
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [upsellTrigger, setUpsellTrigger] = useState<"sample_complete" | "low_balance">("sample_complete");

  // Track previous splitting/sample state to detect completion
  const prevSplittingRef = useRef(false);
  const prevIsSampleRef = useRef(false);

  useEffect(() => {
    const wasSplitting = prevSplittingRef.current;
    const wasSample = prevIsSampleRef.current;
    prevSplittingRef.current = isSplitting;
    prevIsSampleRef.current = isSample;

    // Detect split just completed
    if (wasSplitting && !isSplitting && splitResultStems.length > 0) {
      if (wasSample) {
        // Sample split completed — prompt to upgrade
        setUpsellTrigger("sample_complete");
        setUpsellOpen(true);
      } else if (usageBalance !== null && usageBalance < 2) {
        // Paid split completed but balance is low — prompt to add more
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: detecting state transition to trigger upsell UI
        setUpsellTrigger("low_balance");
        setUpsellOpen(true);
      }
    }
  }, [isSplitting, isSample, splitResultStems.length, usageBalance]);

  // Ref for auto-scrolling to the mixer when a split completes
  const mixerSectionRef = useRef<HTMLDivElement | null>(null);
  // Track previous splitting state to detect the transition
  const wasSplittingRef = useRef(false);

  useEffect(() => {
    if (wasSplittingRef.current && !isSplitting && splitResultStems.length > 0) {
      // Small delay lets the collapse animation start first
      const t = window.setTimeout(() => {
        mixerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 320);
      return () => window.clearTimeout(t);
    }
    wasSplittingRef.current = isSplitting;
  }, [isSplitting, splitResultStems.length]);

  // Subscribe to app-wide "open-pricing" event via typed event bus
  useAppEvent("open-pricing", () => setActiveView("pricing"));

  const [hasCompletedFirstExport, setHasCompletedFirstExport] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!exportNotice) return;
    const t = window.setTimeout(() => setExportNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, [exportNotice]);

  const onboardingSteps = useMemo(() => {
    const base = [
      {
        id: 1,
        label: "Upload a track",
        done: !!uploadedFile,
      },
      {
        id: 2,
        label: "Split into stems",
        done: splitResultStems.length > 0,
      },
      {
        id: 3,
        label: "Mix & tweak",
        done: mixStems.length > 0,
      },
    ];
    if (!ENABLE_ONBOARDING_QUEST) return base;
    return [
      ...base,
      {
        id: 4,
        label: "Export a master mix",
        done: hasCompletedFirstExport,
      },
    ];
  }, [
    uploadedFile,
    splitResultStems.length,
    mixStems.length,
    hasCompletedFirstExport,
  ]);

  // Pipeline index is now driven by real progress from the SSE stream (useStemSplitting).
  // The old timer-based animation has been removed to avoid conflicting with real data.

  // ── File input handlers ───────────────────────────────────────────────────
  const handleFileFromInput = useCallback(
    (file: File | null) => {
      handleFile(file);
      if (!file) return;
      clearStemLoadingState();
      clearStemWaveforms();
      resetStemStates({});
    },
    [handleFile, clearStemLoadingState, clearStemWaveforms, resetStemStates],
  );

  const handleBrowseUpload = useCallback(() => inputRef.current?.click(), []);
  const handleClearUpload = useCallback(
    () => handleFileFromInput(null),
    [handleFileFromInput],
  );

  const applyHistoryStemsToStore = useCallback(
    ({
      stems,
      jobId,
      uploadName: historyName,
    }: {
      stems: import("./types").StemResult[];
      jobId: string;
      uploadName: string;
    }) => {
      clearStemLoadingState();
      clearStemWaveforms();
      resetStemStates({});
      setUploadState((prev) => ({
        ...prev,
        uploadName: historyName,
        uploadedFile: null,
        splitResultStems: stems,
        splitJobId: jobId,
        loadedStems: [],
        splitError: null,
        isSplitting: false,
        splitProgress: 100,
        pipelineIndex: 3,
      }));
    },
    [clearStemLoadingState, clearStemWaveforms, resetStemStates, setUploadState],
  );

  const { loadHistoryJob, loadingJobId } = useLoadHistoryJob({
    onLoaded: (payload) => {
      applyHistoryStemsToStore(payload);
      setActiveView("editor");
      window.setTimeout(() => {
        mixerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    },
    onError: (msg) => setSplitError(msg),
  });

  const { loadHistoryJob: loadHistoryJobToMidi, loadingJobId: loadingMidiJobId } =
    useLoadHistoryJob({
      onLoaded: (payload) => {
        applyHistoryStemsToStore(payload);
        setActiveView("midi");
      },
      onError: (msg) => setSplitError(msg),
    });

  const exportTrackDurationSec = useMemo(() => {
    let max = 0;
    for (const s of visibleStems) {
      const d = stemBuffers[s.id]?.duration ?? 0;
      if (d > max) max = d;
    }
    return max;
  }, [visibleStems, stemBuffers]);

  const handleLoadPreset = useCallback((preset: MixerPreset) => {
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
  }, [setStemStates]);

  const handleResetSingleStem = useCallback(
    (stemId: string) => {
      resetSingleStem(stemId);
      toast("Channel reset", { type: "undo" });
    },
    [resetSingleStem, toast],
  );

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useAppKeyboardShortcuts({
    visibleStems,
    resolvedActiveStemId,
    mixStems,
    stemStates,
    stemBuffers,
    setStemStates,
    handlePlayMix,
    handleStopMix,
    openModal,
    closeModal,
    showHelpModal,
    showExportModal,
    showPresetsModal,
    isPlayingMix,
    undoStemStates,
    redoStemStates,
    loopEnabled,
    setLoopEnabled,
    setActiveView,
    onTriggerSplit: () => {
      if (
        uploadedFile &&
        !isSplitting &&
        splitResultStems.length === 0 &&
        activeView === "editor"
      ) {
        void triggerSplit(2, isSample);
      }
    },
  });

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--bg)] text-white">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[100] -translate-y-[130%] rounded-xl border border-amber-400/50 bg-[#1a1412]/95 px-4 py-2.5 text-sm font-medium text-white shadow-lg outline-none transition-transform duration-200 focus-visible:translate-y-0 focus-visible:ring-2 focus-visible:ring-amber-400/50"
      >
        Skip to main content
      </a>
      <ErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <OnboardingTour />
        </Suspense>
      </ErrorBoundary>
      <LazyModalLayer
        showHelpModal={showHelpModal}
        showExportModal={showExportModal}
        showPresetsModal={showPresetsModal}
        closeModal={closeModal}
        handleExportFromModal={handleExportFromModal}
        isExporting={isExporting}
        mixStemsLength={mixStems.length}
        exportAllowStemBundleTargets={exportAllowStemBundleTargets}
        isSample={isSample}
        exportTrackDurationSec={exportTrackDurationSec}
        handleLoadPreset={handleLoadPreset}
        mixerState={mixerState}
        trimMap={trimMap}
        mutedStems={mutedStems}
        pitchMap={pitchMap}
        timeStretchMap={timeStretchMap}
        fadeMap={fadeMap}
        batchQueue={batchQueue}
        batchQueueExpanded={batchQueueExpanded}
        setBatchQueueExpanded={setBatchQueueExpanded}
        removeFromBatchQueue={removeFromBatchQueue}
        clearCompletedFromQueue={clearCompletedFromQueue}
        canUseBatchQueue={canUseBatchQueue}
        processNextInQueue={processNextInQueue}
        canExpandToFourStems={canExpandToFourStems}
        splitQuality={splitQuality}
        setUploadState={setUploadState}
        setSplitError={setSplitError}
      />

      <AppBackgroundOrbs />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <EditorHeader
          headerVisible={headerVisible}
          activeView={activeView}
          setActiveView={setActiveView}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={() => {
            undoStemStates();
            toast("Changes undone", { type: "undo" });
          }}
          onRedo={() => {
            redoStemStates();
            toast("Changes redone", { type: "undo" });
          }}
          openModal={openModal}
          localDevFullApp={localDevFullApp}
          subscription={subscription}
          usageBalance={usageBalance}
          usageLoading={usageLoading}
          openFeedback={() => emit("open-feedback")}
          openOnboarding={() => emit("open-onboarding")}
        />

        <main
          id="main-content"
          tabIndex={-1}
          aria-label="Main content"
          className="outline-none focus-visible:ring-2 focus-visible:ring-amber-400/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] rounded-[2rem]"
        >
          {/* Either show the main editor view or the dedicated pricing page */}
          {activeView === "pricing" ? (
            <motion.section
              {...(reduceMotion
                ? {
                    initial: false,
                    animate: { opacity: 1, y: 0 },
                    transition: { duration: 0 },
                  }
                : {
                    initial: { opacity: 0, y: 16 },
                    animate: { opacity: 1, y: 0 },
                    transition: { duration: 0.4 },
                  })}
            >
              <PricingPage
                subscription={subscription}
                onClose={() => setActiveView("editor")}
                initialTab={pricingInitialTab}
                usageContext={{
                  hasCompletedFirstExport,
                  splitsThisSession: splitResultStems.length,
                }}
              />
            </motion.section>
          ) : activeView === "my-stems" ? (
            <MyStemsPage
              onClose={() => setActiveView("editor")}
              onOpenInMixer={(job) => void loadHistoryJob(job)}
              onOpenInMidi={(job) => void loadHistoryJobToMidi(job)}
              loadingMixerJobId={loadingJobId}
              loadingMidiJobId={loadingMidiJobId}
            />
          ) : activeView === "speech" ? (
            <SpeechCleanPage
              reduceMotion={Boolean(reduceMotion)}
              subscription={subscription}
              usageBalance={usageBalance}
              usageLoading={usageLoading}
              checkoutNotice={checkoutNotice}
              onViewPlans={() => setActiveView("pricing")}
            />
          ) : activeView === "midi" ? (
            <MidiConvertPage
              reduceMotion={Boolean(reduceMotion)}
              subscription={subscription}
              usageBalance={usageBalance}
              usageLoading={usageLoading}
              checkoutNotice={checkoutNotice}
              onViewPlans={() => setActiveView("pricing")}
            />
          ) : (
            <EditorMainView
              reduceMotion={Boolean(reduceMotion)}
              chrome={{
                guidanceTarget,
                guidanceRingClass,
                handleGuidancePanelInteract,
                subscription,
                checkoutNotice,
                uploadedFile,
                isSplitting,
                mixStemsLength: mixStems.length,
                isExporting,
                onViewPlans: () => setActiveView("pricing"),
              }}
              processingProps={{
                sourceMode,
                onSourceModeChange: setSourceMode,
                uploadName,
                loadedStemCount: loadedStems.length,
                isDragging,
                onSetIsDragging: (next) =>
                  setUploadState((prev) => ({ ...prev, isDragging: next })),
                loadStemsInputRef,
                onLoadStems: handleLoadStems,
                loadedStems,
                onRemoveLoadedStem: removeLoadedStem,
                uploadedFile,
                onBrowseUpload: handleBrowseUpload,
                onClearUpload: handleClearUpload,
                onDropUpload: (file) => handleFileFromInput(file),
                inputRef,
                onUploadFileInput: (file) => handleFileFromInput(file),
                quality,
                onQualityChange: (next) =>
                  setUploadState((prev) => ({ ...prev, quality: next })),
                stemQualityOptions,
                canExpandToFourStems,
                canUseBatchQueue,
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
                onSplit: (requestedStemMode, sample) => {
                  startUiLatencyMark("mixer-ready-after-stems");
                  void triggerSplit(requestedStemMode, sample);
                },
                isSplitting,
                splitProgress,
                uploadProgress,
                isUploading,
                queuePosition,
                splitElapsedSeconds,
                onOpenWaitingGame: toggleGame,
                splitResultStemsLength: splitResultStems.length,
                isExpanding,
                onExpand: () => void triggerExpand(),
                splitError,
                onDismissError: () => setSplitError(null),
                onAddToQueue: () => addToBatchQueue(uploadedFile),
                subscriptionInactive: subscription.status === "inactive",
                usageBalance,
                usageLoading,
                uploadDurationSec,
                estimatedSplitTokens,
                estimatedExpandTokens: estimatedSplitTokens,
                isCollapsed: splitResultStems.length > 0 && !isSplitting,
                onNewSplit: handleClearUpload,
              }}
              mixerProps={{
                mixerSectionRef,
                onPointerDownMixer: handleGuidancePanelInteract,
                guidanceTarget,
                guidanceRingClass,
                reduceMotion: reduceMotion ?? false,
                onboardingSteps,
                hasCompletedFirstExport,
                subscription,
                setActiveView,
                splitResultStemsLength: splitResultStems.length,
                mixStemsLength: mixStems.length,
                uploadedFile,
                onBrowseUpload: handleBrowseUpload,
                mixStemCount: mixStems.length,
                splitStemCount:
                  splitResultStems.length === 2 || splitResultStems.length === 4
                    ? (splitResultStems.length as 2 | 4)
                    : null,
                isPlayingMix,
                onPlayStop: () =>
                  void handlePlayMix(mixStems, stemStates, stemBuffers),
                onStopMix: handleStopMix,
                onSeekMix: handleSeekMix,
                isExporting,
                onExport: () => {
                  if (isSample) {
                    setActiveView("pricing");
                  } else {
                    openModal("export");
                  }
                },
                isComparingExport,
                onCompareExport,
                onResetLevels: resetTrackAdjustments,
                onResetSingleStem: handleResetSingleStem,
                hasStemBuffers: Object.keys(stemBuffers).length > 0,
                stems: visibleStems as StemWithOptionalUrl[],
                waveforms: stemWaveforms,
                durations: Object.fromEntries(
                  visibleStems.map((s) => [
                    s.id,
                    stemBuffers[s.id]?.duration ?? 0,
                  ]),
                ),
                stemStates,
                getPlayheadPosition,
                subscribePlayheadPosition,
                isLoadingStems,
                loadingError,
                onRetryLoadStems: retryLoadStems,
                activeStemId: resolvedActiveStemId,
                onActiveStemChange: setActiveStemId,
                onStemStateChange: handleStemStateChange,
                onPreviewStem: handlePreviewStemFromMixer,
                playingStemId: playingStem,
                loadingPreviewStemId,
                getMasterAnalyserTimeDomainData,
                getMasterAnalyserTimeDomainDataLeft,
                getMasterAnalyserTimeDomainDataRight,
                getMasterAnalyserFrequencyData,
                getStemAnalyserTimeDomainData,
                masterVolume,
                onMasterVolumeChange: setMasterVolume,
                masterLimiterEnabled,
                onMasterLimiterEnabledChange:
                  handleMasterLimiterEnabledChange,
                beatGrid,
                loopEnabled,
                onLoopToggle: setLoopEnabled,
                exportCompareSummary,
                undoToast: null,
              }}
            />
          )}
        </main>
      </div>

      <WaitingGamePanel
        showGame={showGame}
        isSplitting={isSplitting}
        reduceMotion={Boolean(reduceMotion)}
        onToggle={toggleGame}
        onClose={() => closeModal("game")}
      />
      <DevLatencyPanel
        latencyStats={latencyStats}
        onResetLatencyStats={resetLatencyStats}
      />

      <EditorFloatingOverlays
        reduceMotion={Boolean(reduceMotion)}
        exportNotice={exportNotice}
        headerVisible={headerVisible}
        uploadedFile={uploadedFile}
        splitResultCount={splitResultStems.length}
        isSplitting={isSplitting}
      />
      {activeView === "editor" && <FeedbackChip />}

      {/* Upsell modal — shown after sample split or when balance is low */}
      <UpsellModal
        open={upsellOpen}
        onClose={() => setUpsellOpen(false)}
        trigger={upsellTrigger}
        balance={usageBalance}
        onViewSubscriptions={() => {
          setUpsellOpen(false);
          setPricingInitialTab("subscriptions");
          setActiveView("pricing");
        }}
        onBuyCredits={() => {
          setUpsellOpen(false);
          setPricingInitialTab("packs");
          setActiveView("pricing");
        }}
      />
    </div>
  );
}
