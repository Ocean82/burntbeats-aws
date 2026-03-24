import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  HelpCircle, Undo2, Redo2, Save, Gamepad2,
} from "lucide-react";

const importStemFall = () => import("./components/stem-fall/StemFall");
const importHelpModal = () => import("./components/HelpModal");
const importExportOptionsModal = () => import("./components/ExportOptionsModal");
const importMixerPresetsModal = () => import("./components/MixerPresetsModal");
const importOnboardingTour = () => import("./components/OnboardingTour");
const importBatchQueue = () => import("./components/BatchQueue");
const importMixerPanel = () => import("./components/mixer-panel.component");

const StemFall = lazy(() => importStemFall());
const HelpModal = lazy(() => importHelpModal().then((m) => ({ default: m.HelpModal })));
const ExportOptionsModal = lazy(() => importExportOptionsModal().then((m) => ({ default: m.ExportOptionsModal })));
const MixerPresetsModal = lazy(() => importMixerPresetsModal().then((m) => ({ default: m.MixerPresetsModal })));
const OnboardingTour = lazy(() => importOnboardingTour().then((m) => ({ default: m.OnboardingTour })));
const BatchQueue = lazy(() => importBatchQueue().then((m) => ({ default: m.BatchQueue })));
const MixerPanel = lazy(() => importMixerPanel().then((m) => ({ default: m.MixerPanel })));
import { useSubscription } from "./hooks/useSubscription";
import { PaywallBanner } from "./components/PaywallBanner";
import { HeaderUserButton } from "./components/AuthGate";
import { cn } from "./utils/cn";
import type { StemDefinition, StemId } from "./types";
import { useKeyboardShortcuts, type ShortcutHandlers } from "./hooks/useKeyboardShortcuts";
import { useAudioPlayback } from "./hooks/useAudioPlayback";
import { useWaveformCompute } from "./hooks/useWaveformCompute";
import { useExport } from "./hooks/useExport";
import { useBatchQueue } from "./hooks/useBatchQueue";
import { useHistory } from "./hooks/useHistory";
import { useMixerWorkspace } from "./hooks/useMixerWorkspace";
import { useStemSplitting } from "./hooks/useStemSplitting";
import { useStemLoading } from "./hooks/useStemLoading";
import { stemDefinitions, getStemDefinition, getLoadedStemDefinition } from "./data/stemDefinitions";
import type { MixerPreset } from "./components/MixerPresetsModal";
import { ErrorBoundary, AudioErrorBoundary, SplitErrorBoundary } from "./components/ErrorBoundary";
import { ProcessingSettingsPanel } from "./components/ProcessingSettingsPanel";
import { PIPELINE_ANIMATION_DELAYS_MS, isLocalDevFullApp } from "./config";
import { defaultStemState, type StemEditorState } from "./stem-editor-state";

import { useAppStore } from "./store/appStore";

type StemWithOptionalUrl = StemDefinition & { url?: string };
type NavigatorConnection = {
  saveData?: boolean;
  effectiveType?: string;
};
type UiLatencyKey =
  | "help-modal-open"
  | "export-modal-open"
  | "presets-modal-open"
  | "mixer-ready-after-stems";
type UiLatencyEventDetail = {
  key: UiLatencyKey;
  durationMs: number;
};
type UiLatencyStats = {
  lastMs: number;
  avgMs: number;
  count: number;
  p50Ms: number;
  p95Ms: number;
  samples: number[];
};
type UiLatencySnapshot = Partial<Record<UiLatencyKey, UiLatencyStats>>;
const MAX_LATENCY_SAMPLES = 50;

function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function canPreloadChunks(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: NavigatorConnection }).connection;
  if (!connection) return true;
  if (connection.saveData) return false;
  return connection.effectiveType !== "2g" && connection.effectiveType !== "slow-2g";
}

function startUiLatencyMark(key: UiLatencyKey): void {
  if (typeof performance === "undefined") return;
  performance.mark(`${key}:start`);
}

function finishUiLatencyMark(key: UiLatencyKey): void {
  if (typeof performance === "undefined") return;
  const start = `${key}:start`;
  const end = `${key}:end`;
  const measure = `${key}:measure`;
  performance.mark(end);
  try {
    performance.measure(measure, start, end);
    const entries = performance.getEntriesByName(measure);
    const durationMs = entries[entries.length - 1]?.duration;
    if (import.meta.env.DEV && typeof durationMs === "number") {
      console.debug(`[perf] ${key} ${durationMs.toFixed(1)}ms`);
      window.dispatchEvent(
        new CustomEvent<UiLatencyEventDetail>("ui-latency-measure", {
          detail: { key, durationMs },
        })
      );
    }
  } catch {
    // No-op if mark pair is incomplete.
  } finally {
    performance.clearMarks(start);
    performance.clearMarks(end);
    performance.clearMeasures(measure);
  }
}

export function App() {
  const localDevFullApp = isLocalDevFullApp();

  // ── Upload / split state ──────────────────────────────────────────────────
  const uploadState = useAppStore();
  const {
    quality, uploadName, uploadedFile, splitResultStems,
    splitJobId,
    loadedStems, splitError, isDragging, isSplitting, isExpanding,
    setUploadState, setSplitError
  } = uploadState;

  // ── Subscription / billing ────────────────────────────────────────────────
  const subscription = useSubscription();
  const isBasicPlan = subscription.status === "active" && subscription.plan === "basic";
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
    isPlayingMix, playingStem,
    getPlayheadPosition, subscribePlayheadPosition,
    audioContextRef, handlePlayMix, handleSeekMix, handleStopMix, handlePreviewStem, stopPreview,
    getMasterAnalyserTimeDomainData,
    getMasterAnalyserFrequencyData,
  } = useAudioPlayback({ onError: (message) => setSplitError(message) });

  // ── Export hook ───────────────────────────────────────────────────────────
  const {
    isExporting,
    handleExportWithOptions,
    compareMasterExportServerAndClient,
  } = useExport();

  const [isComparingExport, setIsComparingExport] = useState(false);
  const [exportCompareSummary, setExportCompareSummary] = useState<string | null>(null);

  // ── Batch queue hook ──────────────────────────────────────────────────────
  const {
    batchQueue, batchQueueExpanded, setBatchQueueExpanded,
    addToBatchQueue, removeFromBatchQueue, clearCompletedFromQueue, processNextInQueue,
  } = useBatchQueue();

  // ── Stem splitting (file handling + split + expand) ────────────────────────
  const { handleFile, handleLoadStems, removeLoadedStem, triggerSplit, triggerExpand } = useStemSplitting({
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
    [splitResultStems, loadedStems]
  );

  const mixStems = useMemo(
    () => [...splitResultStems, ...loadedStems] as Array<{ id: string; url: string }>,
    [splitResultStems, loadedStems]
  );

  // ── Stem loading (fetch WAVs → AudioBuffers) ──────────────────────────────
  const { stemBuffers, setStemBuffers, isLoadingStems, clearStemLoadingState } = useStemLoading({
    allStemEntries,
    audioContextRef,
    setStemStates: setStemStates as unknown as (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void,
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
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showPresetsModal, setShowPresetsModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showGame, setShowGame] = useState(false);
  const [latencyStats, setLatencyStats] = useState<UiLatencySnapshot>({});
  const [sourceMode, setSourceMode] = useState<"split" | "load">("split");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const loadStemsInputRef = useRef<HTMLInputElement | null>(null);

  // Derived shims for modals
  const trimMap = useMemo(
    () => Object.fromEntries(Object.entries(stemStates).map(([id, s]) => [id, s.trim])),
    [stemStates],
  );
  const mixerState = useMemo(
    () => Object.fromEntries(Object.entries(stemStates).map(([id, s]) => [id, s.mixer])),
    [stemStates],
  );
  const mutedStems = useMemo(
    () => Object.fromEntries(Object.entries(stemStates).map(([id, s]) => [id, s.muted])),
    [stemStates],
  );

  const pitchMap = useMemo(
    () => Object.fromEntries(Object.entries(stemStates).map(([id, s]) => [id, s.pitchSemitones ?? 0])),
    [stemStates],
  );
  const timeStretchMap = useMemo(
    () => Object.fromEntries(Object.entries(stemStates).map(([id, s]) => [id, s.timeStretch ?? 1])),
    [stemStates],
  );
  type GuidanceTarget = 'source' | 'mixer' | 'none';
  const GREEN_RING_BASE_CLASS =
    "ring-2 ring-emerald-300/40 ring-offset-1 ring-offset-black/30 shadow-[0_0_16px_rgba(52,211,153,0.12)]";
  const GREEN_RING_PULSE_CLASS = `${GREEN_RING_BASE_CLASS} animate-pulse`;
  const guidanceTarget: GuidanceTarget = (() => {
    if (splitError) return 'source';
    if (isSplitting || isExpanding) return 'none';
    if (isLoadingStems) return 'none';
    if (splitResultStems.length === 2) return 'source';
    if (mixStems.length > 0) return 'mixer';
    return 'source';
  })();

  const [guidancePulseOff, setGuidancePulseOff] = useState<{ source: boolean; mixer: boolean }>({
    source: false,
    mixer: false,
  });

  useEffect(() => {
    // When the guidance target changes, re-enable the pulse until the user interacts.
    setGuidancePulseOff({ source: false, mixer: false });
  }, [guidanceTarget]);

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

  useEffect(() => {
    if (!canPreloadChunks()) return;
    // Once users provide an upload, mixer/presets are likely next.
    if (!uploadedFile && mixStems.length === 0) return;
    void importMixerPanel();
    void importMixerPresetsModal();
  }, [uploadedFile, mixStems.length]);

  useEffect(() => {
    if (!canPreloadChunks()) return;
    if (batchQueue.length > 0) {
      void importBatchQueue();
    }
  }, [batchQueue.length]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<UiLatencyEventDetail>;
      const payload = customEvent.detail;
      if (!payload || typeof payload.durationMs !== "number") return;
      setLatencyStats((prev) => {
        const existing = prev[payload.key];
        const nextSamplesRaw = existing ? [...existing.samples, payload.durationMs] : [payload.durationMs];
        const nextSamples = nextSamplesRaw.length > MAX_LATENCY_SAMPLES
          ? nextSamplesRaw.slice(nextSamplesRaw.length - MAX_LATENCY_SAMPLES)
          : nextSamplesRaw;
        const nextCount = (existing?.count ?? 0) + 1;
        const nextAvg = existing
          ? ((existing.avgMs * existing.count) + payload.durationMs) / nextCount
          : payload.durationMs;
        return {
          ...prev,
          [payload.key]: {
            lastMs: payload.durationMs,
            avgMs: nextAvg,
            count: nextCount,
            p50Ms: percentile(nextSamples, 50),
            p95Ms: percentile(nextSamples, 95),
            samples: nextSamples,
          },
        };
      });
    };
    window.addEventListener("ui-latency-measure", handler as EventListener);
    return () => window.removeEventListener("ui-latency-measure", handler as EventListener);
  }, []);

  useEffect(() => {
    if (!showHelpModal) return;
    const raf = window.requestAnimationFrame(() => finishUiLatencyMark("help-modal-open"));
    return () => window.cancelAnimationFrame(raf);
  }, [showHelpModal]);

  useEffect(() => {
    if (!showExportModal) return;
    const raf = window.requestAnimationFrame(() => finishUiLatencyMark("export-modal-open"));
    return () => window.cancelAnimationFrame(raf);
  }, [showExportModal]);

  useEffect(() => {
    if (!showPresetsModal) return;
    const raf = window.requestAnimationFrame(() => finishUiLatencyMark("presets-modal-open"));
    return () => window.cancelAnimationFrame(raf);
  }, [showPresetsModal]);

  useEffect(() => {
    if (mixStems.length === 0) return;
    const raf = window.requestAnimationFrame(() => finishUiLatencyMark("mixer-ready-after-stems"));
    return () => window.cancelAnimationFrame(raf);
  }, [mixStems.length]);

  const handleGuidancePanelInteract = useCallback(() => {
    if (guidanceTarget === "source") {
      setGuidancePulseOff((p) => (p.source ? p : { ...p, source: true }));
    } else if (guidanceTarget === "mixer") {
      setGuidancePulseOff((p) => (p.mixer ? p : { ...p, mixer: true }));
    }
  }, [guidanceTarget]);

  const [stemWaveforms, setStemWaveformsState] = useState<Record<string, number[]>>({});
  useWaveformCompute(stemBuffers, allStemEntries, setStemWaveformsState);

  const visibleStems = useMemo(() => {
    const fromSplit = splitResultStems.map((s) => ({ ...getStemDefinition(s.id), id: s.id as StemId, url: s.url }));
    const fromLoaded = loadedStems.map((s) => ({ ...getLoadedStemDefinition(s.id, s.label), id: s.id as StemId, url: s.url }));
    if (fromSplit.length > 0 || fromLoaded.length > 0) return [...fromSplit, ...fromLoaded];
    // Before splitting, show the full default rack (helps solo/mute keyboard shortcuts).
    return stemDefinitions.map((s) => ({ ...s, id: s.id as StemId }));
  }, [splitResultStems, loadedStems]);

  useEffect(() => {
    if (!isSplitting) return;
    // keep pipeline state in sync for any future status indicators
    setUploadState(prev => ({ ...prev, pipelineIndex: 0 }));
    const t1 = setTimeout(() => setUploadState(prev => ({ ...prev, pipelineIndex: 1 })), PIPELINE_ANIMATION_DELAYS_MS.toStep1);
    const t2 = setTimeout(() => setUploadState(prev => ({ ...prev, pipelineIndex: 2 })), PIPELINE_ANIMATION_DELAYS_MS.toStep2);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isSplitting]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopPreview();
      handleStopMix();
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch { /* ignore */ }
        audioContextRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── File input handlers ───────────────────────────────────────────────────
  const handleFileFromInput = useCallback((file: File | null) => {
    handleFile(file);
    if (!file) return;
    clearStemLoadingState();
    resetStemStates({});
  }, [handleFile, clearStemLoadingState, resetStemStates]);

  const handleBrowseUpload = useCallback(() => inputRef.current?.click(), []);
  const handleClearUpload = useCallback(() => handleFileFromInput(null), [handleFileFromInput]);

  const handleLoadPreset = useCallback((preset: MixerPreset) => {
    setStemStates((p) => {
      const next = { ...p };
      for (const id of Object.keys(next)) {
        if (preset.mixerState[id]) next[id] = { ...next[id], mixer: preset.mixerState[id] };
        if (preset.trimMap[id]) next[id] = { ...next[id], trim: preset.trimMap[id] };
        if (preset.mutedStems[id] !== undefined) next[id] = { ...next[id], muted: preset.mutedStems[id] };
        if (preset.pitchMap?.[id] !== undefined) next[id] = { ...next[id], pitchSemitones: preset.pitchMap[id] };
        if (preset.timeStretchMap?.[id] !== undefined) next[id] = { ...next[id], timeStretch: preset.timeStretchMap[id] };
      }
      return next;
    });
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  const setSoloAtIndex = useCallback((index: number) => {
    const id = visibleStems[index]?.id;
    if (id) setStemStates((c) => ({ ...c, [id]: { ...(c[id] ?? defaultStemState()), soloed: !c[id]?.soloed } }));
  }, [visibleStems]);
  const setMuteFirst = useCallback(() => {
    const id = visibleStems[0]?.id;
    if (id) setStemStates((c) => ({ ...c, [id]: { ...(c[id] ?? defaultStemState()), muted: !c[id]?.muted } }));
  }, [visibleStems]);
  const shortcutHandlers: ShortcutHandlers = useMemo(() => {
    const TRIM_STEP = 1;
    const nudgeTrim = (which: "start" | "end", delta: number) => {
      if (!activeStemId) return;
      setStemStates((p) => {
        const st = p[activeStemId] ?? defaultStemState();
        const { start, end } = st.trim;
        const newTrim = which === "start"
          ? { start: Math.max(0, Math.min(start + delta, end - 1)), end }
          : { start, end: Math.max(start + 1, Math.min(end + delta, 100)) };
        return { ...p, [activeStemId]: { ...st, trim: newTrim } };
      });
    };
    return {
      playStop: () => { if (mixStems.length > 0) void handlePlayMix(mixStems, stemStates, stemBuffers); },
      solo1: () => setSoloAtIndex(0),
      solo2: () => setSoloAtIndex(1),
      solo3: () => setSoloAtIndex(2),
      solo4: () => setSoloAtIndex(3),
      muteToggle: setMuteFirst,
      export: () => {
        if (mixStems.length > 0) {
          startUiLatencyMark("export-modal-open");
          setShowExportModal(true);
        }
      },
      undo: () => { undoStemStates(); },
      redo: () => { redoStemStates(); },
      trimStartLeft:  () => nudgeTrim("start", -TRIM_STEP),
      trimStartRight: () => nudgeTrim("start", +TRIM_STEP),
      trimEndLeft:    () => nudgeTrim("end",   -TRIM_STEP),
      trimEndRight:   () => nudgeTrim("end",   +TRIM_STEP),
      help: () => {
        startUiLatencyMark("help-modal-open");
        setShowHelpModal(true);
      },
      escape: () => {
        if (showHelpModal) setShowHelpModal(false);
        else if (showExportModal) setShowExportModal(false);
        else if (showPresetsModal) setShowPresetsModal(false);
        else if (isPlayingMix) handleStopMix();
      },
    };
  }, [mixStems, stemStates, stemBuffers, activeStemId, handlePlayMix, handleStopMix, showHelpModal, showExportModal, showPresetsModal, isPlayingMix, setSoloAtIndex, setMuteFirst, undoStemStates, redoStemStates]);
  useKeyboardShortcuts(shortcutHandlers);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-white">
      <ErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <OnboardingTour />
        </Suspense>
      </ErrorBoundary>
      <ErrorBoundary fallback={null}>
        {showHelpModal ? (
          <Suspense fallback={null}>
            <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />
          </Suspense>
        ) : null}
      </ErrorBoundary>
      <ErrorBoundary fallback={null}>
        {showExportModal ? (
          <Suspense fallback={null}>
            <ExportOptionsModal
              isOpen={showExportModal}
              onClose={() => setShowExportModal(false)}
              onExport={(opts) =>
                void handleExportWithOptions(
                  opts,
                  stemBuffers,
                  mixStems,
                  stemStates,
                  uploadName,
                  setSplitError,
                  () => setShowExportModal(false),
                  loadedStems.length === 0 ? splitJobId : null,
                  loadedStems.length === 0 ? splitResultStems.map((s) => s.id) : []
                )
              }
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
              onClose={() => setShowPresetsModal(false)}
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
              onProcessQueue={() => void processNextInQueue(2, splitQuality,
                (stems) => setUploadState(prev => ({ ...prev, splitResultStems: stems })),
                setSplitError,
                (id) => setUploadState(prev => ({ ...prev, splitJobId: id }))
              )}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="fire-orb left-[-8rem] top-[-6rem] h-80 w-80" />
        <div className="fire-orb right-[-10rem] top-20 h-[26rem] w-[26rem] opacity-75" />
        <div className="fire-orb bottom-[-12rem] left-1/3 h-[30rem] w-[30rem] opacity-60" />
        <div className="mesh-overlay" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">

        {/* Header */}
        <header className="glass-panel mirror-sheen flex flex-col gap-6 rounded-[2rem] px-6 py-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex flex-col gap-4 sm:gap-5">
            <div className="inline-flex w-fit items-center gap-3 rounded-full border border-white/15 bg-white/6 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-amber-100/80">
              Stem Splitter / Mixer / Master
              <span className="h-1 w-1 rounded-full bg-[var(--accent)] shadow-[0_0_14px_var(--accent)]" />
            </div>
            <div className="logo-burnt">
              <span className="logo-burnt-fire block text-4xl sm:text-5xl lg:text-6xl">Burnt Beats</span>
            </div>
            <p className="max-w-xl text-sm leading-6 text-white/70 sm:text-base">
              Split vocals, drums, bass, and melody → trim, level, pan → play mix, export.
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex items-center gap-2 text-xs text-white/60">
              <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 border transition-all", !uploadedFile ? "border-amber-400/40 bg-amber-500/15 text-amber-200" : "border-white/10 bg-white/5 text-white/65")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", !uploadedFile ? "bg-amber-400" : "bg-white/40")} />Upload
              </span>
              <span className="text-white/20">→</span>
              <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 border transition-all", isSplitting ? "border-amber-400/40 bg-amber-500/15 text-amber-200" : "border-white/10 bg-white/5 text-white/65")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", isSplitting ? "bg-amber-400 animate-pulse" : "bg-white/40")} />Split
              </span>
              <span className="text-white/20">→</span>
              <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 border transition-all", mixStems.length > 0 && !isExporting ? "border-amber-400/40 bg-amber-500/15 text-amber-200" : "border-white/10 bg-white/5 text-white/65")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", mixStems.length > 0 ? "bg-amber-400" : "bg-white/40")} />Mix & Export
              </span>
            </div>
            {mixStems.length > 0 && <p className="text-xs text-green-400/80">{mixStems.length} stems ready</p>}
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-xl border border-white/10 bg-black/20">
                <button type="button" onClick={undoStemStates} disabled={!canUndo} className="flex h-8 w-8 items-center justify-center text-white/65 disabled:opacity-30 transition hover:text-white" title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 className="h-4 w-4" /></button>
                <div className="h-4 w-px bg-white/10" />
                <button type="button" onClick={redoStemStates} disabled={!canRedo} className="flex h-8 w-8 items-center justify-center text-white/65 disabled:opacity-30 transition hover:text-white" title="Redo (Ctrl+Y)" aria-label="Redo"><Redo2 className="h-4 w-4" /></button>
              </div>
              <button type="button" onClick={() => { startUiLatencyMark("presets-modal-open"); setShowPresetsModal(true); }} className="flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-white/60 transition hover:text-white" title="Presets" aria-label="Open mixer presets">
                <Save className="h-3.5 w-3.5" /><span className="hidden sm:inline">Presets</span>
              </button>
              <button type="button" onClick={() => { startUiLatencyMark("help-modal-open"); setShowHelpModal(true); }} className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white/65 transition hover:text-white" title="Help" aria-label="Open help">
                <HelpCircle className="h-4 w-4" />
              </button>
              {localDevFullApp ? (
                <span className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/90">
                  Local dev
                </span>
              ) : (
                <HeaderUserButton />
              )}
              {subscription.status === "active" && !localDevFullApp && (
                <button
                  type="button"
                  onClick={() => void subscription.openPortal()}
                  className="flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-white/60 transition hover:text-white"
                  title="Manage billing"
                >
                  Billing
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Marquee */}
        <motion.div className="overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] backdrop-blur-sm" initial={{ opacity: 0.6 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
          <div className="flex w-max animate-scroll-text gap-12 py-2.5 text-xs uppercase tracking-[0.35em] text-white/60">
            <span>Drop track · Split · Mix · Export</span>
            <span>Fire-polished stem control with mirrored glass precision.</span>
            <span>Drop track · Split · Mix · Export</span>
            <span>Fire-polished stem control with mirrored glass precision.</span>
          </div>
        </motion.div>

        <motion.section
          className="flex flex-col gap-4"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.08 } }, hidden: {} }}
        >
          {/* Top bar: Processing Settings (horizontal) */}
          <motion.div
            onPointerDown={handleGuidancePanelInteract}
            className={cn(
              "glass-panel mirror-sheen rounded-[2rem] px-5 py-4 sm:px-6",
              guidanceTarget === "source" && (guidancePulseOff.source ? GREEN_RING_BASE_CLASS : GREEN_RING_PULSE_CLASS)
            )}
            variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.4 }}
          >
            <SplitErrorBoundary>
              <ProcessingSettingsPanel
                sourceMode={sourceMode}
                onSourceModeChange={setSourceMode}
                uploadName={uploadName}
                loadedStemCount={loadedStems.length}
                isDragging={isDragging}
                onSetIsDragging={(next) => setUploadState((prev) => ({ ...prev, isDragging: next }))}
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
                onQualityChange={(next) => setUploadState((prev) => ({ ...prev, quality: next }))}
                stemQualityOptions={stemQualityOptions}
                canExpandToFourStems={canExpandToFourStems}
                canUseBatchQueue={canUseBatchQueue}
                onUpgradeToPremium={() => void subscription.startCheckout("premium")}
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
              />
              {subscription.status === "inactive" && (
                <div className="mt-3 border-t border-white/10 pt-3">
                  <PaywallBanner subscription={subscription} />
                </div>
              )}
            </SplitErrorBoundary>
          </motion.div>

          {/* Full-width Mixer workspace */}
          <motion.div
            onPointerDown={handleGuidancePanelInteract}
            className={cn(
              "glass-panel mirror-sheen rounded-[2rem] p-5 sm:p-6",
              guidanceTarget === "mixer" && (guidancePulseOff.mixer ? GREEN_RING_BASE_CLASS : GREEN_RING_PULSE_CLASS)
            )}
            variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.4 }}
          >
            <AudioErrorBoundary>
              <Suspense fallback={<div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-white/50">Loading mixer...</div>}>
                <MixerPanel
                  mixStemCount={mixStems.length}
                  isPlayingMix={isPlayingMix}
                  onPlayStop={() => void handlePlayMix(mixStems, stemStates, stemBuffers)}
                  onStopMix={handleStopMix}
                  onSeekMix={handleSeekMix}
                  isExporting={isExporting}
                  onExport={() => {
                    startUiLatencyMark("export-modal-open");
                    setShowExportModal(true);
                  }}
                  isComparingExport={isComparingExport}
                  onCompareExport={
                    loadedStems.length === 0 && typeof splitJobId === "string" && splitJobId.length > 0 && splitResultStems.length > 0
                      ? () => {
                          void (async () => {
                            setIsComparingExport(true);
                            setExportCompareSummary(null);
                            try {
                              const metrics = await compareMasterExportServerAndClient({
                                serverExportJobId: splitJobId,
                                stemBuffers,
                                splitResultStems,
                                stemStates,
                                uploadName,
                                normalize: true,
                                stemIds: splitResultStems.map((s) => s.id),
                              });
                              if (!metrics.ok) {
                                setExportCompareSummary(`Compare failed: ${metrics.error ?? "unknown error"}`);
                                return;
                              }
                              const rmsDb = metrics.rmsDiffDb != null ? `${metrics.rmsDiffDb.toFixed(1)} dB` : "n/a";
                              setExportCompareSummary(
                                `Server vs Client: duration diff ${metrics.durationDiffSec?.toFixed(3) ?? "n/a"}s, RMS diff ${rmsDb}, peak diff ${metrics.peakDiff?.toFixed(4) ?? "n/a"}`
                              );
                            } catch (e) {
                              setExportCompareSummary(`Compare failed: ${e instanceof Error ? e.message : "unknown error"}`);
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
                  durations={Object.fromEntries(visibleStems.map((s) => [s.id, stemBuffers[s.id]?.duration ?? 0]))}
                  stemStates={stemStates}
                  getPlayheadPosition={getPlayheadPosition}
                  subscribePlayheadPosition={subscribePlayheadPosition}
                  isLoadingStems={isLoadingStems}
                  activeStemId={activeStemId || visibleStems[0]?.id}
                  onActiveStemChange={setActiveStemId}
                  onStemStateChange={handleStemStateChange}
                  onPreviewStem={handlePreviewStemFromMixer}
                  playingStemId={playingStem}
                  getMasterAnalyserTimeDomainData={getMasterAnalyserTimeDomainData}
                  getMasterAnalyserFrequencyData={getMasterAnalyserFrequencyData}
                />
              </Suspense>
              {exportCompareSummary && (
                <p className="mt-3 text-xs text-white/70" role="status" aria-live="polite">
                  {exportCompareSummary}
                </p>
              )}
            </AudioErrorBoundary>
          </motion.div>

        </motion.section>
      </div>

      {/* ── STEM FALL game panel (slide up from bottom) ── */}
      {/* Tab button — always visible, pulses while splitting */}
      <button
        type="button"
        onClick={() => setShowGame((v) => !v)}
        aria-label={showGame ? "Close Stem Fall game" : "Open Stem Fall game"}
        className={cn(
          "fixed bottom-0 right-8 z-50 flex items-center gap-2 rounded-t-xl border border-b-0 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all duration-300",
          showGame
            ? "border-amber-500/40 bg-amber-500/20 text-amber-200"
            : "border-white/15 bg-black/70 text-white/60 hover:text-white backdrop-blur-md",
          isSplitting && !showGame && "animate-pulse border-amber-500/50 text-amber-300"
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
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed bottom-0 left-0 right-0 z-40 flex justify-center"
          >
            <div className="w-full max-w-2xl rounded-t-[2rem] border border-b-0 border-white/10 bg-black/90 backdrop-blur-xl shadow-[0_-20px_60px_rgba(0,0,0,0.7)] px-6 pt-5 pb-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.35em] text-amber-400">Stem Fall</span>
                  <p className="text-[9px] text-white/40 mt-0.5" style={{ fontFamily: "'Press Start 2P', monospace" }}>
                    {isSplitting ? "stems separating... drop some blocks!" : "play while you wait"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGame(false)}
                  className="text-white/30 hover:text-white transition text-xs"
                  aria-label="Close game"
                >
                  ✕
                </button>
              </div>
              <Suspense fallback={<div className="flex h-40 items-center justify-center text-xs text-white/40">Loading game...</div>}>
                <StemFall />
              </Suspense>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!import.meta.env.PROD && (
        <div className="fixed bottom-4 left-4 z-50 w-72 rounded-xl border border-white/10 bg-black/75 p-3 text-[11px] text-white/80 backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">UI latency (dev)</p>
            <button
              type="button"
              onClick={() => setLatencyStats({})}
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
              <div key={key} className="mb-1.5 flex items-center justify-between last:mb-0">
                <span className="text-white/65">{label}</span>
                <span className="font-mono text-white/90">
                  {stat ? `${stat.lastMs.toFixed(0)} | ${stat.avgMs.toFixed(0)} | ${stat.p50Ms.toFixed(0)} | ${stat.p95Ms.toFixed(0)} (${stat.count})` : "—"}
                </span>
              </div>
            );
          })}
          <p className="mt-2 text-[10px] text-white/45">last | avg | p50 | p95 (count)</p>
        </div>
      )}
    </div>
  );
}
