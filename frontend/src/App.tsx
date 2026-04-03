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
import { HelpCircle, Undo2, Redo2, Save, Gamepad2 } from "lucide-react";

const importStemFall = () => import("./components/stem-fall/StemFall");
const importHelpModal = () => import("./components/HelpModal");
const importExportOptionsModal = () =>
  import("./components/ExportOptionsModal");
const importMixerPresetsModal = () => import("./components/MixerPresetsModal");
const importOnboardingTour = () => import("./components/OnboardingTour");
const importBatchQueue = () => import("./components/BatchQueue");
const importMixerPanel = () => import("./components/mixer-panel.component");

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
const MixerPanel = lazy(() =>
  importMixerPanel().then((m) => ({ default: m.MixerPanel })),
);
import { useSubscription } from "./hooks/useSubscription";
import { PaywallBanner } from "./components/PaywallBanner";
import { HeaderUserButton } from "./components/AuthGate";
import { cn } from "./utils/cn";
import type { StemDefinition, StemId, MixerState, TrimState } from "./types";
import {
  useKeyboardShortcuts,
  type ShortcutHandlers,
} from "./hooks/useKeyboardShortcuts";
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
  AudioErrorBoundary,
  SplitErrorBoundary,
} from "./components/ErrorBoundary";
import { ProcessingSettingsPanel } from "./components/ProcessingSettingsPanel";
import { PIPELINE_ANIMATION_DELAYS_MS, isLocalDevFullApp } from "./config";
import { defaultStemState, type StemEditorState } from "./stem-editor-state";

import { useAppStore } from "./store/appStore";
import { useUiModals } from "./hooks/useUiModals";
import { useGuidanceSystem } from "./hooks/useGuidanceSystem";
import {
  useUiLatencyMonitor,
  startUiLatencyMark,
  finishUiLatencyMark,
} from "./hooks/useUiLatencyMonitor";
import { PricingPage } from "./components/PricingPage";
import { Skeleton } from "./components/ui/skeleton";
import { ProgressWidget } from "./components/ProgressWidget";
import { FeedbackChip } from "./components/FeedbackChip";
import {
  ENABLE_ONBOARDING_QUEST,
  ENABLE_PROGRESS_WIDGET,
} from "./config/uiFlags";
import { useAudioFileDuration } from "./hooks/useAudioFileDuration";
import { useUsageBalance } from "./hooks/useUsageBalance";
import { computeTokensFromDurationSeconds } from "./utils/tokenCost";
import { AppMobileMoreMenu } from "./components/AppMobileMoreMenu";

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
    isDragging,
    isSplitting,
    isExpanding,
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
  }, [splitResultStems.length, refetchUsage]);
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

  const [isComparingExport, setIsComparingExport] = useState(false);
  const [exportCompareSummary, setExportCompareSummary] = useState<
    string | null
  >(null);

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

  // ── Stem loading (fetch WAVs → AudioBuffers) ──────────────────────────────
  const { stemBuffers, setStemBuffers, isLoadingStems, clearStemLoadingState } =
    useStemLoading({
      allStemEntries,
      audioContextRef,
      setStemStates: setStemStates as unknown as (
        updater: (prev: Record<string, unknown>) => Record<string, unknown>,
      ) => void,
      setSplitError,
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

  const [activeView, setActiveView] = useState<"editor" | "pricing">("editor");
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

  useEffect(() => {
    if (!isSplitting) return;
    // keep pipeline state in sync for any future status indicators
    setUploadState((prev) => ({ ...prev, pipelineIndex: 0 }));
    const t1 = setTimeout(
      () => setUploadState((prev) => ({ ...prev, pipelineIndex: 1 })),
      PIPELINE_ANIMATION_DELAYS_MS.toStep1,
    );
    const t2 = setTimeout(
      () => setUploadState((prev) => ({ ...prev, pipelineIndex: 2 })),
      PIPELINE_ANIMATION_DELAYS_MS.toStep2,
    );
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isSplitting]);

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
  const setSoloAtIndex = useCallback(
    (index: number) => {
      const id = visibleStems[index]?.id;
      if (id)
        setStemStates((c) => ({
          ...c,
          [id]: { ...(c[id] ?? defaultStemState()), soloed: !c[id]?.soloed },
        }));
    },
    [visibleStems],
  );
  const setMuteFirst = useCallback(() => {
    const id = visibleStems[0]?.id;
    if (id)
      setStemStates((c) => ({
        ...c,
        [id]: { ...(c[id] ?? defaultStemState()), muted: !c[id]?.muted },
      }));
  }, [visibleStems]);
  const shortcutHandlers: ShortcutHandlers = useMemo(() => {
    const TRIM_STEP = 1;
    const nudgeTrim = (which: "start" | "end", delta: number) => {
      if (!activeStemId) return;
      setStemStates((p) => {
        const st = p[activeStemId] ?? defaultStemState();
        const { start, end } = st.trim;
        const newTrim =
          which === "start"
            ? { start: Math.max(0, Math.min(start + delta, end - 1)), end }
            : { start, end: Math.max(start + 1, Math.min(end + delta, 100)) };
        return { ...p, [activeStemId]: { ...st, trim: newTrim } };
      });
    };
    return {
      playStop: () => {
        if (mixStems.length > 0)
          void handlePlayMix(mixStems, stemStates, stemBuffers);
      },
      solo1: () => setSoloAtIndex(0),
      solo2: () => setSoloAtIndex(1),
      solo3: () => setSoloAtIndex(2),
      solo4: () => setSoloAtIndex(3),
      muteToggle: setMuteFirst,
      export: () => {
        if (mixStems.length > 0) {
          openModal("export");
        }
      },
      undo: () => {
        undoStemStates();
      },
      redo: () => {
        redoStemStates();
      },
      trimStartLeft: () => nudgeTrim("start", -TRIM_STEP),
      trimStartRight: () => nudgeTrim("start", +TRIM_STEP),
      trimEndLeft: () => nudgeTrim("end", -TRIM_STEP),
      trimEndRight: () => nudgeTrim("end", +TRIM_STEP),
      help: () => {
        openModal("help");
      },
      escape: () => {
        if (showHelpModal) closeModal("help");
        else if (showExportModal) closeModal("export");
        else if (showPresetsModal) closeModal("presets");
        else if (isPlayingMix) handleStopMix();
      },
    };
  }, [
    mixStems,
    stemStates,
    stemBuffers,
    activeStemId,
    handlePlayMix,
    handleStopMix,
    showHelpModal,
    showExportModal,
    showPresetsModal,
    isPlayingMix,
    setSoloAtIndex,
    setMuteFirst,
    undoStemStates,
    redoStemStates,
  ]);
  useKeyboardShortcuts(shortcutHandlers);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-white">
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
              onExport={async (opts) => {
                await handleExportWithOptions(
                  opts,
                  stemBuffers,
                  mixStems,
                  stemStates,
                  uploadName,
                  setSplitError,
                  () => closeModal("export"),
                  loadedStems.length === 0 ? splitJobId : null,
                  loadedStems.length === 0
                    ? splitResultStems.map((s) => s.id)
                    : [],
                  () => {
                    setExportNotice(
                      "Download started — check your browser’s downloads folder.",
                    );
                    setHasCompletedFirstExport(true);
                  },
                );
              }}
              isExporting={isExporting}
              stemCount={mixStems.length}
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
                  2,
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
        {/* Header */}
        <header
          className="glass-panel mirror-sheen flex flex-col gap-6 rounded-[2rem] px-6 py-6 lg:flex-row lg:items-center lg:justify-between lg:px-8"
          aria-label="Burnt Beats"
        >
          <div className="flex flex-col gap-4 sm:gap-5">
            <div className="inline-flex w-fit items-center gap-3 rounded-full border border-white/15 bg-white/6 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-amber-100/80">
              Stem Splitter / Mixer / Master
              <span className="h-1 w-1 rounded-full bg-[var(--accent)] shadow-[0_0_14px_var(--accent)]" />
            </div>
            <div className="logo-burnt">
              <span className="logo-burnt-fire block text-4xl sm:text-5xl lg:text-6xl">
                Burnt Beats
              </span>
            </div>
            <p className="max-w-xl text-base leading-7 text-white/85">
              Split vocals, drums, bass, and melody → trim, level, pan → play
              mix, export.
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex items-center gap-2 text-sm text-white/75">
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 border transition-all",
                  !uploadedFile
                    ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
                    : "border-white/10 bg-white/5 text-white/65",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    !uploadedFile ? "bg-amber-400" : "bg-white/40",
                  )}
                />
                Upload
              </span>
              <span className="text-white/20">→</span>
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 border transition-all",
                  isSplitting
                    ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
                    : "border-white/10 bg-white/5 text-white/65",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    isSplitting ? "bg-amber-400 animate-pulse" : "bg-white/40",
                  )}
                />
                Split
              </span>
              <span className="text-white/20">→</span>
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 border transition-all",
                  mixStems.length > 0 && !isExporting
                    ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
                    : "border-white/10 bg-white/5 text-white/65",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    mixStems.length > 0 ? "bg-amber-400" : "bg-white/40",
                  )}
                />
                Mix & Export
              </span>
            </div>
            {mixStems.length > 0 && (
              <p className="text-xs text-green-400/80">
                {mixStems.length} stems ready
              </p>
            )}
            {subscription.status === "active" && subscription.plan && (
              <p className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-emerald-200/90">
                Plan:&nbsp;<span>{subscription.plan}</span>
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-xl border border-white/10 bg-black/20">
                <button
                  type="button"
                  onClick={undoStemStates}
                  disabled={!canUndo}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center text-white/65 disabled:opacity-30 transition hover:text-white"
                  title="Undo (Ctrl+Z)"
                  aria-label="Undo"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <div className="h-4 w-px bg-white/10" />
                <button
                  type="button"
                  onClick={redoStemStates}
                  disabled={!canRedo}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center text-white/65 disabled:opacity-30 transition hover:text-white"
                  title="Redo (Ctrl+Y)"
                  aria-label="Redo"
                >
                  <Redo2 className="h-4 w-4" />
                </button>
              </div>
              <div className="hidden flex-wrap items-center gap-2 lg:flex">
                <button
                  type="button"
                  onClick={() => openModal("presets")}
                  className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white/75 transition hover:text-white tap-feedback"
                  title="Presets"
                  aria-label="Open mixer presets"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Presets</span>
                </button>
                <button
                  type="button"
                  onClick={() => openModal("help")}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white/65 transition hover:text-white tap-feedback"
                  title="Help"
                  aria-label="Open help"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </div>
              {localDevFullApp ? (
                <span className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/90">
                  Local dev
                </span>
              ) : (
                <HeaderUserButton />
              )}
              <div className="hidden flex-wrap items-center gap-2 lg:flex">
                <button
                  type="button"
                  onClick={() => {
                    const url =
                      import.meta.env.VITE_FULL_PRICING_URL ??
                      "https://www.burntbeats.com/pricing";
                    window.open(url, "_blank", "noopener,noreferrer");
                  }}
                  className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/15 bg-black/20 px-3 text-xs text-white/70 transition hover:text-white tap-feedback"
                  title="Open full pricing page in a new tab"
                >
                  Full pricing &amp; features
                </button>
                {(() => {
                  const isInactive = subscription.status === "inactive";
                  const pricingLabel = isInactive
                    ? "Upgrade · Pricing"
                    : subscription.plan === "basic"
                      ? "More tokens & faster queues"
                      : "Manage plan";
                  const title =
                    activeView === "pricing"
                      ? "Back to main editor"
                      : isInactive
                        ? "View pricing & tokens"
                        : "View or change your plan";
                  return (
                    <button
                      type="button"
                      onClick={() =>
                        setActiveView((v) =>
                          v === "editor" ? "pricing" : "editor",
                        )
                      }
                      className={cn(
                        "flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition tap-feedback",
                        isInactive
                          ? "border border-amber-400/70 bg-amber-500/20 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.55)] hover:bg-amber-500/30 hover:text-white"
                          : "border border-white/15 bg-black/20 text-white/70 hover:text-white",
                      )}
                      title={title}
                    >
                      {activeView === "pricing"
                        ? "Back to editor"
                        : pricingLabel}
                    </button>
                  );
                })()}
                {subscription.status === "active" && !localDevFullApp && (
                  <button
                    type="button"
                    onClick={() => void subscription.openPortal()}
                    className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-white/60 transition hover:text-white tap-feedback"
                    title="Manage billing"
                  >
                    Billing
                  </button>
                )}
              </div>
              <AppMobileMoreMenu
                onOpenFullPricingTab={() => {
                  const url =
                    import.meta.env.VITE_FULL_PRICING_URL ??
                    "https://www.burntbeats.com/pricing";
                  window.open(url, "_blank", "noopener,noreferrer");
                }}
                onOpenPricing={() =>
                  setActiveView((v) => (v === "editor" ? "pricing" : "editor"))
                }
                onOpenPortal={() => void subscription.openPortal()}
                onOpenPresets={() => openModal("presets")}
                onOpenHelp={() => openModal("help")}
                pricingLabel={
                  subscription.status === "inactive"
                    ? "Upgrade · Pricing"
                    : subscription.plan === "basic"
                      ? "More tokens & faster queues"
                      : "Manage plan"
                }
                pricingTitle={
                  activeView === "pricing"
                    ? "Back to main editor"
                    : subscription.status === "inactive"
                      ? "View pricing & tokens"
                      : "View or change your plan"
                }
                showBilling={
                  subscription.status === "active" && !localDevFullApp
                }
                isPricingView={activeView === "pricing"}
              />
            </div>
          </div>
        </header>

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
                      onSplit={(requestedStemMode) => {
                        startUiLatencyMark("mixer-ready-after-stems");
                        void triggerSplit(requestedStemMode);
                      }}
                      isSplitting={isSplitting}
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

                {/* Full-width Mixer workspace */}
                <motion.div
                  onPointerDown={handleGuidancePanelInteract}
                  className={cn(
                    // `glass-panel` uses `overflow: hidden`; allow the mixer waveform/panels to overflow so menus are reachable.
                    "glass-panel mirror-sheen rounded-[2rem] p-5 sm:p-6 overflow-visible",
                    guidanceTarget === "mixer" && guidanceRingClass,
                  )}
                  variants={{
                    hidden: { opacity: 0, y: 12 },
                    visible: { opacity: 1, y: 0 },
                  }}
                  transition={{ duration: reduceMotion ? 0 : 0.4 }}
                >
                  <AudioErrorBoundary>
                    {/* Onboarding checklist */}
                    <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-[11px] text-white/70">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
                            {ENABLE_ONBOARDING_QUEST
                              ? "First project quest"
                              : "Getting started"}
                          </span>
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-amber-400 transition-[width]"
                              style={{
                                width: `${
                                  (onboardingSteps.filter((s) => s.done)
                                    .length /
                                    onboardingSteps.length) *
                                  100
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                        {ENABLE_ONBOARDING_QUEST && (
                          <span className="text-[10px] text-white/45">
                            Step {onboardingSteps.filter((s) => s.done).length}{" "}
                            of {onboardingSteps.length}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-white/45">
                        Press{" "}
                        <kbd className="rounded border border-white/15 bg-white/10 px-1.5 py-0.5 font-mono text-white/70">
                          ?
                        </kbd>{" "}
                        or <span className="text-white/55">Help</span> in the
                        header for keyboard shortcuts.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {onboardingSteps.map((step) => (
                          <span
                            key={step.id}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1",
                              step.done
                                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                                : "border-white/10 bg-white/5 text-white/60",
                            )}
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                step.done ? "bg-emerald-300" : "bg-white/35",
                              )}
                            />
                            {step.label}
                          </span>
                        ))}
                      </div>
                    </div>

                    {ENABLE_PROGRESS_WIDGET && (
                      <div className="mb-4">
                        <ProgressWidget
                          milestones={[
                            {
                              id: "first-split",
                              label: "First split",
                              done: splitResultStems.length > 0,
                            },
                            {
                              id: "first-export",
                              label: "First export",
                              done: hasCompletedFirstExport,
                            },
                            {
                              id: "three-projects",
                              label: "3 projects this week",
                              done: mixStems.length >= 3,
                            },
                          ]}
                          onViewPlans={
                            subscription.status === "inactive"
                              ? () => setActiveView("pricing")
                              : undefined
                          }
                        />
                      </div>
                    )}

                    {ENABLE_ONBOARDING_QUEST &&
                      hasCompletedFirstExport &&
                      subscription.status === "inactive" && (
                        <div className="mb-4 rounded-2xl border border-amber-400/50 bg-amber-500/15 px-3 py-2 text-sm text-amber-100">
                          <p className="mb-1 font-semibold">
                            Nice — you just finished your first stem.
                          </p>
                          <p className="mb-2 text-amber-100/85">
                            If you&apos;ll be doing this more than a couple of
                            times a month, a plan usually pays for itself.
                          </p>
                          <button
                            type="button"
                            onClick={() => setActiveView("pricing")}
                            className="rounded-full bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-300"
                          >
                            See which plan fits you
                          </button>
                        </div>
                      )}

                    {uploadedFile == null && mixStems.length === 0 && (
                      <div className="mb-4 rounded-2xl border border-dashed border-white/15 bg-black/30 px-4 py-3 text-sm text-white/85">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/80">
                          Start your first project
                        </p>
                        <ul className="mb-2 list-disc space-y-1 pl-4 text-white/80">
                          <li>Create DJ edits and mashups from any track.</li>
                          <li>
                            Study reference mixes by soloing drums, bass, or
                            vocals.
                          </li>
                          <li>
                            Pull parts for lessons, breakdowns, or content.
                          </li>
                        </ul>
                        <button
                          type="button"
                          onClick={handleBrowseUpload}
                          className="rounded-full bg-white/90 px-3 py-2 text-xs font-semibold text-black hover:bg-white"
                        >
                          Upload a track
                        </button>
                      </div>
                    )}

                    <Suspense
                      fallback={
                        <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-6">
                          <div className="mb-4 flex items-center justify-between gap-4">
                            <div className="space-y-2">
                              <Skeleton className="h-3 w-32 bg-white/10" />
                              <Skeleton className="h-4 w-40 bg-white/10" />
                            </div>
                            <Skeleton className="h-9 w-24 bg-white/10" />
                          </div>
                          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                            {Array.from({ length: 4 }).map((_, idx) => (
                              <div
                                key={idx}
                                className="space-y-2 rounded-xl border border-white/5 bg-white/[0.03] p-3"
                              >
                                <Skeleton className="h-3 w-24 bg-white/10" />
                                <Skeleton className="h-24 w-full bg-white/5" />
                                <Skeleton className="h-2 w-20 bg-white/10" />
                              </div>
                            ))}
                          </div>
                        </div>
                      }
                    >
                      <MixerPanel
                        mixStemCount={mixStems.length}
                        isPlayingMix={isPlayingMix}
                        onPlayStop={() =>
                          void handlePlayMix(mixStems, stemStates, stemBuffers)
                        }
                        onStopMix={handleStopMix}
                        onSeekMix={handleSeekMix}
                        isExporting={isExporting}
                        onExport={() => {
                          openModal("export");
                        }}
                        isComparingExport={isComparingExport}
                        onCompareExport={
                          loadedStems.length === 0 &&
                          typeof splitJobId === "string" &&
                          splitJobId.length > 0 &&
                          splitResultStems.length > 0
                            ? () => {
                                void (async () => {
                                  setIsComparingExport(true);
                                  setExportCompareSummary(null);
                                  try {
                                    const metrics =
                                      await compareMasterExportServerAndClient({
                                        serverExportJobId: splitJobId,
                                        stemBuffers,
                                        splitResultStems,
                                        stemStates,
                                        uploadName,
                                        normalize: true,
                                        stemIds: splitResultStems.map(
                                          (s) => s.id,
                                        ),
                                      });
                                    if (!metrics.ok) {
                                      setExportCompareSummary(
                                        `Compare failed: ${metrics.error ?? "unknown error"}`,
                                      );
                                      return;
                                    }
                                    const rmsDb =
                                      metrics.rmsDiffDb != null
                                        ? `${metrics.rmsDiffDb.toFixed(1)} dB`
                                        : "n/a";
                                    setExportCompareSummary(
                                      `Server vs Client: duration diff ${
                                        metrics.durationDiffSec?.toFixed(3) ??
                                        "n/a"
                                      }s, RMS diff ${rmsDb}, peak diff ${
                                        metrics.peakDiff?.toFixed(4) ?? "n/a"
                                      }`,
                                    );
                                  } catch (e) {
                                    setExportCompareSummary(
                                      `Compare failed: ${
                                        e instanceof Error
                                          ? e.message
                                          : "unknown error"
                                      }`,
                                    );
                                  } finally {
                                    setIsComparingExport(false);
                                  }
                                })();
                              }
                            : undefined
                        }
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
                        activeStemId={activeStemId || visibleStems[0]?.id}
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
                      />
                    </Suspense>
                    {exportCompareSummary && (
                      <p
                        className="mt-3 text-xs text-white/70"
                        role="status"
                        aria-live="polite"
                      >
                        {exportCompareSummary}
                      </p>
                    )}
                  </AudioErrorBoundary>
                </motion.div>
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
          "fixed bottom-0 right-8 z-50 flex items-center gap-2 rounded-t-xl border border-b-0 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all duration-300",
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
        <div className="fixed bottom-4 left-4 z-50 w-72 rounded-xl border border-white/10 bg-black/75 p-3 text-[11px] text-white/80 backdrop-blur-md">
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
            className="pointer-events-none fixed bottom-20 left-1/2 z-[60] max-w-md -translate-x-1/2 rounded-xl border border-emerald-400/40 bg-emerald-950/95 px-4 py-3 text-center text-sm text-emerald-50 shadow-lg backdrop-blur-md md:bottom-8"
          >
            {exportNotice}
          </motion.div>
        )}
      </AnimatePresence>

      {activeView === "editor" && <FeedbackChip />}
    </div>
  );
}
