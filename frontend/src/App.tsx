import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Gamepad2, Loader2, Sparkles } from "lucide-react";

const importStemFall = () => import("./components/stem-fall/StemFall");
const importHelpModal = () => import("./components/HelpModal");
const importExportOptionsModal = () =>
  import("./components/ExportOptionsModal");
const importMixerPresetsModal = () => import("./components/MixerPresetsModal");
const importOnboardingTour = () => import("./components/OnboardingTour");
const importBatchQueue = () => import("./components/BatchQueue");

const StemFall = lazy(() => importStemFall());
const HelpModal = lazy(() =>
  importHelpModal().then((m) => ({ default: m.HelpModal })),
);
const ExportOptionsModal = lazy(() =>
  importExportOptionsModal().then((m) => ({ default: m.ExportOptionsModal })),
);
const MixerPresetsModal = lazy(() =>
  importMixerPresetsModal().then((m) => ({ default: m.MixerPresetsModal })),
);
const OnboardingTour = lazy(() =>
  importOnboardingTour().then((m) => ({ default: m.OnboardingTour })),
);
const BatchQueue = lazy(() =>
  importBatchQueue().then((m) => ({ default: m.BatchQueue })),
);
import { useSubscription } from "./hooks/useSubscription";
import { PaywallBanner } from "./components/PaywallBanner";
import { cn } from "./utils/cn";
import type { StemDefinition, StemId, MixerState, TrimState } from "./types";
import { useAudioPlayback } from "./hooks/useAudioPlayback";
import { useWaveformCompute } from "./hooks/useWaveformCompute";
import { useExport } from "./hooks/useExport";
import { useBatchQueue } from "./hooks/useBatchQueue";
import { useHistory } from "./hooks/useHistory";
import { useMixerWorkspace } from "./hooks/useMixerWorkspace";
import { useStemSplitting } from "./hooks/useStemSplitting";
import { useStemLoading } from "./hooks/useStemLoading";
import {
  stemDefinitions,
  getStemDefinition,
  getLoadedStemDefinition,
} from "./data/stemDefinitions";
import type { MixerPreset } from "./components/MixerPresetsModal";
import {
  ErrorBoundary,
  SplitErrorBoundary,
} from "./components/ErrorBoundary";
import { ProcessingSettingsPanel } from "./components/ProcessingSettingsPanel";
import { PIPELINE_ANIMATION_DELAYS_MS, isLocalDevFullApp } from "./config";
import type { StemEditorState } from "./stem-editor-state";

import { useAppStore } from "./store/appStore";
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
import { FeedbackChip } from "./components/FeedbackChip";
import {
  ENABLE_ONBOARDING_QUEST,
} from "./config/uiFlags";
import { useAudioFileDuration } from "./hooks/useAudioFileDuration";
import { useUsageBalance } from "./hooks/useUsageBalance";
import { computeTokensFromDurationSeconds } from "./utils/tokenCost";
import { EditorHeader } from "./app/editor-header.component";
import { MixerWorkspace } from "./app/mixer-workspace.component";

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

  // ── Smart Sticky Header State ─────────────────────────────────────────────
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          
          if (currentScrollY < 10) {
            setHeaderVisible(true);
          } else if (currentScrollY > lastScrollY.current + 5) {
            setHeaderVisible(false);
          } else if (currentScrollY < lastScrollY.current - 5) {
            setHeaderVisible(true);
          }
          lastScrollY.current = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
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
    queuePosition,
    setUploadState,
    setSplitError,
  } = uploadState;

  const uploadDurationSec = useAudioFileDuration(uploadedFile);
  const estimatedSplitTokens = useMemo(
    () => computeTokensFromDurationSeconds(uploadDurationSec),
    [uploadDurationSec],
  );

  // ── Subscription / billing ────────────────────────────────────────────────
  const subscription = useSubscription();
  const {
    balance: usageBalance,
    loading: usageLoading,
    refetch: refetchUsage,
  } = useUsageBalance(subscription.status === "active" && !localDevFullApp);

  useEffect(() => {
    void refetchUsage();
  }, [
    splitResultStems.length,
    subscription.status,
    localDevFullApp,
    refetchUsage,
  ]);
  const isBasicPlan =
    subscription.status === "active" && subscription.plan === "basic";
  const stemQualityOptions = isBasicPlan ? "speed_only" : "full";
  const canExpandToFourStems = subscription.status === "active" && !isBasicPlan;
  const canUseBatchQueue = subscription.status === "active" && !isBasicPlan;
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
    getMasterAnalyserFrequencyData,
    masterVolume,
    setMasterVolume,
  } = useAudioPlayback({
    onError: (message) => setSplitError(message),
    stemStates,
  });

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
  const [undoToast, setUndoToast] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<"split" | "load">("split");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const loadStemsInputRef = useRef<HTMLInputElement | null>(null);

  // Derived shims for modals (single pass over stemStates)
  const { trimMap, mixerState, mutedStems, pitchMap, timeStretchMap } =
    useMemo(() => {
      const trim: Record<string, TrimState> = {};
      const mixer: Record<string, MixerState> = {};
      const muted: Record<string, boolean> = {};
      const pitch: Record<string, number> = {};
      const stretch: Record<string, number> = {};
      for (const [id, s] of Object.entries(stemStates)) {
        trim[id] = s.trim;
        mixer[id] = s.mixer;
        muted[id] = s.muted;
        pitch[id] = s.pitchSemitones ?? 0;
        stretch[id] = s.timeStretch ?? 1;
      }
      return {
        trimMap: trim,
        mixerState: mixer,
        mutedStems: muted,
        pitchMap: pitch,
        timeStretchMap: stretch,
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

  const [activeView, setActiveView] = useState<"editor" | "pricing">("editor");

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

  useEffect(() => {
    const handleOpenPricing = () => setActiveView("pricing");
    window.addEventListener("burntbeats:open-pricing", handleOpenPricing);
    return () =>
      window.removeEventListener("burntbeats:open-pricing", handleOpenPricing);
  }, []);

  const [hasCompletedFirstExport, setHasCompletedFirstExport] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [showDevLatencyPanel, setShowDevLatencyPanel] = useState(true);

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

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopPreview();
      handleStopMix();
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch {
          /* ignore */
        }
        audioContextRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      }
      return next;
    });
  }, []);

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
      <ErrorBoundary fallback={null}>
        {showHelpModal ? (
          <Suspense fallback={null}>
            <HelpModal
              isOpen={showHelpModal}
              onClose={() => closeModal("help")}
            />
          </Suspense>
        ) : null}
      </ErrorBoundary>
      <ErrorBoundary fallback={null}>
        {showExportModal ? (
          <Suspense fallback={null}>
            <ExportOptionsModal
              isOpen={showExportModal}
              onClose={() => closeModal("export")}
              onExport={handleExportFromModal}
              isExporting={isExporting}
              stemCount={mixStems.length}
              allowStemBundleTargets={exportAllowStemBundleTargets}
              isSample={isSample}
            />
          </Suspense>
        ) : null}
      </ErrorBoundary>
      <ErrorBoundary fallback={null}>
        {showPresetsModal ? (
          <Suspense fallback={null}>
            <MixerPresetsModal
              isOpen={showPresetsModal}
              onClose={() => closeModal("presets")}
              onLoadPreset={handleLoadPreset}
              currentMixerState={mixerState}
              currentTrimMap={trimMap}
              currentMutedStems={mutedStems}
              currentPitchMap={pitchMap}
              currentTimeStretchMap={timeStretchMap}
            />
          </Suspense>
        ) : null}
      </ErrorBoundary>
      {batchQueue.length > 0 && (
        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <BatchQueue
              items={batchQueue}
              isExpanded={batchQueueExpanded}
              onToggleExpand={() => setBatchQueueExpanded((e) => !e)}
              onRemoveItem={removeFromBatchQueue}
              onClearCompleted={clearCompletedFromQueue}
              allowProcess={canUseBatchQueue}
              onProcessQueue={() =>
                void processNextInQueue(
                  canExpandToFourStems ? 4 : 2,
                  splitQuality,
                  (stems) =>
                    setUploadState((prev) => ({
                      ...prev,
                      splitResultStems: stems,
                    })),
                  setSplitError,
                  (id) =>
                    setUploadState((prev) => ({ ...prev, splitJobId: id })),
                )
              }
            />
          </Suspense>
        </ErrorBoundary>
      )}

      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="fire-orb left-[-8rem] top-[-6rem] h-80 w-80" />
        <div className="fire-orb right-[-10rem] top-20 h-[26rem] w-[26rem] opacity-75" />
        <div className="fire-orb bottom-[-12rem] left-1/3 h-[30rem] w-[30rem] opacity-60" />
        <div className="mesh-overlay" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <EditorHeader
          headerVisible={headerVisible}
          activeView={activeView}
          setActiveView={setActiveView}
          uploadedFile={uploadedFile}
          isSplitting={isSplitting}
          mixStemsLength={mixStems.length}
          isExporting={isExporting}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={() => {
            undoStemStates();
            setUndoToast("Changes undone");
          }}
          onRedo={() => {
            redoStemStates();
            setUndoToast("Changes redone");
          }}
          openModal={openModal}
          localDevFullApp={localDevFullApp}
          subscription={subscription}
          usageBalance={usageBalance}
          usageLoading={usageLoading}
          openFeedback={() => {
            window.dispatchEvent(new Event("burntbeats:open-feedback"));
          }}
          openOnboarding={() => {
            window.dispatchEvent(new Event("burntbeats:open-onboarding"));
          }}
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
                usageContext={{
                  hasCompletedFirstExport,
                  splitsThisSession: splitResultStems.length,
                }}
              />
            </motion.section>
          ) : (
            <>
              {/* Marquee — static text on small screens to reduce motion noise */}
              <div className="overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] backdrop-blur-sm md:hidden">
                <p className="px-4 py-3 text-center text-[11px] uppercase leading-relaxed tracking-[0.18em] text-white/45">
                  Drop track · Split · Mix · Export · Premium &amp; Studio
                  unlock batch &amp; faster queues.
                </p>
              </div>
              <motion.div
                className="hidden overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] backdrop-blur-sm md:block"
                {...(reduceMotion
                  ? {
                      initial: false,
                      animate: { opacity: 1 },
                      transition: { duration: 0 },
                    }
                  : {
                      initial: { opacity: 0.6 },
                      animate: { opacity: 1 },
                      transition: { duration: 0.5 },
                    })}
              >
                <div className="flex w-max animate-scroll-text gap-14 py-2 text-[11px] uppercase tracking-[0.22em] text-white/45">
                  <span>Drop track · Split · Mix · Export</span>
                  <span>
                    Hit your first finished stem in minutes — then batch the
                    rest.
                  </span>
                  <span>Drop track · Split · Mix · Export</span>
                  <span>
                    Premium & Studio plans unlock faster queues and more stems.
                  </span>
                </div>
              </motion.div>

              <motion.section
                className="flex flex-col gap-4"
                initial="hidden"
                animate="visible"
                variants={{
                  visible: {
                    transition: { staggerChildren: reduceMotion ? 0 : 0.08 },
                  },
                  hidden: {},
                }}
              >
                {/* Top bar: Processing Settings (horizontal) */}
                  <motion.div
                    onPointerDown={handleGuidancePanelInteract}
                    className={cn(
                      "glass-panel mirror-sheen rounded-[2rem] px-5 py-4 sm:px-6",
                      guidanceTarget === "source" && guidanceRingClass,
                      isSplitting && "splitting-scan-glow"
                    )}
                  variants={{
                    hidden: { opacity: 0, y: 12 },
                    visible: { opacity: 1, y: 0 },
                  }}
                  transition={{ duration: reduceMotion ? 0 : 0.4 }}
                >
                  <SplitErrorBoundary>
                    <ProcessingSettingsPanel
                      sourceMode={sourceMode}
                      onSourceModeChange={setSourceMode}
                      uploadName={uploadName}
                      loadedStemCount={loadedStems.length}
                      isDragging={isDragging}
                      onSetIsDragging={(next) =>
                        setUploadState((prev) => ({
                          ...prev,
                          isDragging: next,
                        }))
                      }
                      loadStemsInputRef={loadStemsInputRef}
                      onLoadStems={handleLoadStems}
                      loadedStems={loadedStems}
                      onRemoveLoadedStem={removeLoadedStem}
                      uploadedFile={uploadedFile}
                      onBrowseUpload={handleBrowseUpload}
                      onClearUpload={handleClearUpload}
                      onDropUpload={(file) => handleFileFromInput(file)}
                      inputRef={inputRef}
                      onUploadFileInput={(file) => handleFileFromInput(file)}
                      quality={quality}
                      onQualityChange={(next) =>
                        setUploadState((prev) => ({ ...prev, quality: next }))
                      }
                      stemQualityOptions={stemQualityOptions}
                      canExpandToFourStems={canExpandToFourStems}
                      canUseBatchQueue={canUseBatchQueue}
                      onUpgradeToPremium={() =>
                        void subscription.startCheckout("premium")
                      }
                      onSplit={(requestedStemMode, isSample) => {
                        startUiLatencyMark("mixer-ready-after-stems");
                        void triggerSplit(requestedStemMode, isSample);
                      }}
                      isSplitting={isSplitting}
                      splitProgress={splitProgress}
                      queuePosition={queuePosition}
                      splitResultStemsLength={splitResultStems.length}
                      isExpanding={isExpanding}
                      onExpand={() => void triggerExpand()}
                      splitError={splitError}
                      onDismissError={() => setSplitError(null)}
                      onAddToQueue={() => addToBatchQueue(uploadedFile)}
                      subscriptionInactive={subscription.status === "inactive"}
                      usageBalance={usageBalance}
                      usageLoading={usageLoading}
                      estimatedSplitTokens={estimatedSplitTokens}
                      estimatedExpandTokens={estimatedSplitTokens}
                      isCollapsed={splitResultStems.length > 0 && !isSplitting}
                    />
                    {subscription.status === "inactive" && (
                      <div className="mt-3 border-t border-white/10 pt-3">
                        <PaywallBanner subscription={subscription} />
                      </div>
                    )}
                    {subscription.billingError && (
                      <div className="mt-3 rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-300">
                        {subscription.billingError}
                      </div>
                    )}
                  </SplitErrorBoundary>
                </motion.div>

                <MixerWorkspace
                  mixerSectionRef={mixerSectionRef}
                  onPointerDownMixer={handleGuidancePanelInteract}
                  guidanceTarget={guidanceTarget}
                  guidanceRingClass={guidanceRingClass}
                  reduceMotion={reduceMotion ?? false}
                  onboardingSteps={onboardingSteps}
                  hasCompletedFirstExport={hasCompletedFirstExport}
                  subscription={subscription}
                  setActiveView={setActiveView}
                  splitResultStemsLength={splitResultStems.length}
                  mixStemsLength={mixStems.length}
                  uploadedFile={uploadedFile}
                  onBrowseUpload={handleBrowseUpload}
                  mixStemCount={mixStems.length}
                  isPlayingMix={isPlayingMix}
                  onPlayStop={() =>
                    void handlePlayMix(mixStems, stemStates, stemBuffers)
                  }
                  onStopMix={handleStopMix}
                  onSeekMix={handleSeekMix}
                  isExporting={isExporting}
                  onExport={() => {
                    if (isSample) {
                      setActiveView("pricing");
                    } else {
                      openModal("export");
                    }
                  }}
                  isComparingExport={isComparingExport}
                  onCompareExport={onCompareExport}
                  onResetLevels={resetTrackAdjustments}
                  hasStemBuffers={Object.keys(stemBuffers).length > 0}
                  stems={visibleStems as StemWithOptionalUrl[]}
                  waveforms={stemWaveforms}
                  durations={Object.fromEntries(
                    visibleStems.map((s) => [
                      s.id,
                      stemBuffers[s.id]?.duration ?? 0,
                    ]),
                  )}
                  stemStates={stemStates}
                  getPlayheadPosition={getPlayheadPosition}
                  subscribePlayheadPosition={subscribePlayheadPosition}
                  isLoadingStems={isLoadingStems}
                  loadingError={loadingError}
                  onRetryLoadStems={retryLoadStems}
                  activeStemId={resolvedActiveStemId}
                  onActiveStemChange={setActiveStemId}
                  onStemStateChange={handleStemStateChange}
                  onPreviewStem={handlePreviewStemFromMixer}
                  playingStemId={playingStem}
                  loadingPreviewStemId={loadingPreviewStemId}
                  getMasterAnalyserTimeDomainData={
                    getMasterAnalyserTimeDomainData
                  }
                  getMasterAnalyserFrequencyData={
                    getMasterAnalyserFrequencyData
                  }
                  masterVolume={masterVolume}
                  onMasterVolumeChange={setMasterVolume}
                  beatGrid={beatGrid}
                  exportCompareSummary={exportCompareSummary}
                  undoToast={undoToast}
                />
              </motion.section>
            </>
          )}
        </main>
      </div>

      {/* ── STEM FALL game panel (slide up from bottom) ── */}
      {/* Tab button — always visible, pulses while splitting */}
      <button
        type="button"
        onClick={toggleGame}
        aria-label={showGame ? "Close Stem Fall game" : "Open Stem Fall game"}
        className={cn(
          "fixed bottom-0 right-2 z-50 flex items-center gap-2 rounded-t-xl border border-b-0 px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-all duration-300 sm:right-8 sm:px-4 sm:py-2.5 sm:text-xs",
          showGame
            ? "border-amber-500/40 bg-amber-500/20 text-amber-200"
            : "border-white/15 bg-black/70 text-white/60 hover:text-white backdrop-blur-md",
          isSplitting &&
            !showGame &&
            "animate-pulse border-amber-500/50 text-amber-300",
        )}
      >
        <Gamepad2 className="h-3.5 w-3.5" />
        {showGame ? "close" : "STEM FALL"}
        {isSplitting && !showGame && (
          <span className="ml-1 h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
        )}
      </button>

      <AnimatePresence>
        {showGame && (
          <motion.div
            key="stem-fall-panel"
            initial={{ y: reduceMotion ? 0 : "100%" }}
            animate={{ y: 0 }}
            exit={{ y: reduceMotion ? 0 : "100%" }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", damping: 28, stiffness: 260 }
            }
            className="fixed bottom-0 left-0 right-0 z-40 flex justify-center"
          >
            <div className="w-full max-w-2xl rounded-t-[2rem] border border-b-0 border-white/10 bg-black/90 backdrop-blur-xl shadow-[0_-20px_60px_rgba(0,0,0,0.7)] px-6 pt-5 pb-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.35em] text-amber-400">
                    Stem Fall
                  </span>
                  <p
                    className="text-[9px] text-white/40 mt-0.5"
                    style={{ fontFamily: "'Press Start 2P', monospace" }}
                  >
                    {isSplitting
                      ? "stems separating... drop some blocks!"
                      : "play while you wait"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => closeModal("game")}
                  className="text-white/30 hover:text-white transition text-xs"
                  aria-label="Close game"
                >
                  ✕
                </button>
              </div>
              <Suspense
                fallback={
                  <div className="flex h-40 items-center justify-center text-xs text-white/40">
                    Loading game...
                  </div>
                }
              >
                <StemFall />
              </Suspense>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!import.meta.env.PROD && (
        <>
          <button
            type="button"
            onClick={() => setShowDevLatencyPanel((v) => !v)}
            className="fixed bottom-4 left-4 z-[60] rounded-lg border border-white/15 bg-black/80 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/75 backdrop-blur-md transition hover:text-white"
            aria-label={
              showDevLatencyPanel
                ? "Hide dev latency panel"
                : "Show dev latency panel"
            }
          >
            {showDevLatencyPanel ? "Hide latency" : "Show latency"}
          </button>
          {showDevLatencyPanel && (
            <div className="fixed bottom-14 left-4 z-50 w-72 rounded-xl border border-white/10 bg-black/75 p-3 text-[11px] text-white/80 backdrop-blur-md">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                  UI latency (dev)
                </p>
                <button
                  type="button"
                  onClick={resetLatencyStats}
                  className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-white/70 transition hover:text-white"
                  aria-label="Reset latency stats"
                >
                  Reset
                </button>
              </div>
              {(
                [
                  ["help-modal-open", "Help modal"],
                  ["export-modal-open", "Export modal"],
                  ["presets-modal-open", "Presets modal"],
                  ["mixer-ready-after-stems", "Mixer after split"],
                ] as const
              ).map(([key, label]) => {
                const stat = latencyStats[key];
                return (
                  <div
                    key={key}
                    className="mb-1.5 flex items-center justify-between last:mb-0"
                  >
                    <span className="text-white/65">{label}</span>
                    <span className="font-mono text-white/90">
                      {stat
                        ? `${stat.lastMs.toFixed(0)} | ${stat.avgMs.toFixed(0)} | ${stat.p50Ms.toFixed(0)} | ${stat.p95Ms.toFixed(0)} (${stat.count})`
                        : "—"}
                    </span>
                  </div>
                );
              })}
              <p className="mt-2 text-[10px] text-white/45">
                last | avg | p50 | p95 (count)
              </p>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {exportNotice && (
          <motion.div
            key="export-notice"
            role="status"
            aria-live="polite"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: reduceMotion ? 0 : 0.25 }}
            className="pointer-events-none fixed bottom-20 left-1/2 z-[60] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-emerald-400/40 bg-emerald-950/95 px-4 py-3 text-center text-sm text-emerald-50 shadow-lg backdrop-blur-md sm:w-auto md:bottom-8"
          >
            {exportNotice}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Split Floating CTA */}
      <AnimatePresence>
        {!headerVisible && uploadedFile && splitResultStems.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed top-6 right-6 z-50 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => {
                window.scrollTo({ top: 0, behavior: "smooth" });
                // If not splitting, let the user trigger it easily
                if (!isSplitting) {
                  // The button scrolls them back to the settings panel
                  // We could trigger split directly, but scrolling back up
                  // shows them the progress natively.
                }
              }}
              className="group flex h-12 items-center gap-3 rounded-full border border-amber-400/40 bg-amber-500/20 px-5 pr-2 font-bold shadow-[0_0_24px_rgba(255,140,80,0.25)] backdrop-blur-md transition-all hover:border-amber-400/80 hover:bg-amber-500/30 hover:scale-105 active:scale-95"
            >
              <div className="flex items-center gap-2">
                {isSplitting ? (
                  <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
                ) : (
                  <Sparkles className="h-4 w-4 text-amber-300" />
                )}
                <span className="text-sm text-amber-50">
                  {isSplitting ? "Splitting..." : "Review & Split"}
                </span>
              </div>
              <div className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-amber-400/20 text-amber-300 transition-colors group-hover:bg-amber-400 group-hover:text-amber-900">
                ↑
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {activeView === "editor" && <FeedbackChip />}
    </div>
  );
}
