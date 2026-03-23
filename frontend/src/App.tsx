import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  HelpCircle, Undo2, Redo2, Save,
} from "lucide-react";
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
import { stemDefinitions, getStemDefinition, getLoadedStemDefinition, pipelineSteps } from "./data/stemDefinitions";
import {
  type MixerPreset,
  HelpModal,
  ExportOptionsModal,
  MixerPresetsModal,
  OnboardingTour,
  BatchQueue,
  StatusPanel,
  ErrorBoundary,
  AudioErrorBoundary,
  SplitErrorBoundary,
  MixerPanel,
  SourcePanel,
} from "./components";
import { defaultStemState, type StemEditorState } from "./stem-editor-state";
import { MASTER_CHAIN, PIPELINE_ANIMATION_DELAYS_MS, isLocalDevFullApp } from "./config";

import { useAppStore } from "./store/appStore";

type StemWithOptionalUrl = StemDefinition & { url?: string };

export function App() {
  const localDevFullApp = isLocalDevFullApp();

  // ── Upload / split state ──────────────────────────────────────────────────
  const uploadState = useAppStore();
  const {
    quality, selectedStems, uploadName, uploadedFile, splitResultStems,
    loadedStems, splitError, isDragging, isSplitting, isExpanding, splitProgress, pipelineIndex,
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
  const { isExporting, handleExportWithOptions } = useExport();

  // ── Batch queue hook ──────────────────────────────────────────────────────
  const {
    batchQueue, batchQueueExpanded, setBatchQueueExpanded,
    addToBatchQueue, removeFromBatchQueue, clearCompletedFromQueue, processNextInQueue,
  } = useBatchQueue();

  // ── Stem splitting (file handling + split + expand) ────────────────────────
  const { handleFile, handleLoadStems, removeLoadedStem, handleStemToggle, triggerSplit, triggerExpand } = useStemSplitting({
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
  const { stemBuffers, setStemBuffers, loadedTracks, isLoadingStems, clearStemLoadingState } = useStemLoading({
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

  // ── Waveform computation ──────────────────────────────────────────────────
  type GuidanceTarget = 'source' | 'status' | 'mixer' | 'none';
  const GREEN_RING_CLASS = 'ring-2 ring-emerald-300/40 ring-offset-1 ring-offset-black/30 shadow-[0_0_16px_rgba(52,211,153,0.12)] animate-pulse';
  const guidanceTarget: GuidanceTarget = (() => {
    if (splitError) return 'source';
    if (isSplitting || isExpanding) return 'status';
    if (isLoadingStems) return 'status';
    if (splitResultStems.length === 2) return 'source';
    if (mixStems.length > 0) return 'mixer';
    return 'source';
  })();

  const [stemWaveforms, setStemWaveformsState] = useState<Record<string, number[]>>({});
  useWaveformCompute(stemBuffers, allStemEntries, setStemWaveformsState);

  const visibleStems = useMemo(() => {
    const fromSplit = splitResultStems.map((s) => ({ ...getStemDefinition(s.id), id: s.id as StemId, url: s.url }));
    const fromLoaded = loadedStems.map((s) => ({ ...getLoadedStemDefinition(s.id, s.label), id: s.id as StemId, url: s.url }));
    if (fromSplit.length > 0 || fromLoaded.length > 0) return [...fromSplit, ...fromLoaded];
    return stemDefinitions.filter((s) => selectedStems[s.id]);
  }, [splitResultStems, loadedStems, selectedStems]);

  // ── Pipeline animation ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSplitting) return;
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
      export: () => { if (mixStems.length > 0) setShowExportModal(true); },
      undo: () => { undoStemStates(); },
      redo: () => { redoStemStates(); },
      trimStartLeft:  () => nudgeTrim("start", -TRIM_STEP),
      trimStartRight: () => nudgeTrim("start", +TRIM_STEP),
      trimEndLeft:    () => nudgeTrim("end",   -TRIM_STEP),
      trimEndRight:   () => nudgeTrim("end",   +TRIM_STEP),
      help: () => setShowHelpModal(true),
      escape: () => {
        if (showHelpModal) setShowHelpModal(false);
        else if (showExportModal) setShowExportModal(false);
        else if (showPresetsModal) setShowPresetsModal(false);
        else if (isPlayingMix) handleStopMix();
      },
    };
  }, [mixStems, stemStates, stemBuffers, activeStemId, handlePlayMix, handleStopMix, showHelpModal, showExportModal, showPresetsModal, isPlayingMix, setSoloAtIndex, setMuteFirst, undoStemStates, redoStemStates]);

  useKeyboardShortcuts(shortcutHandlers, true);

  const activeStage = pipelineSteps[pipelineIndex];

  return (
    <div className="min-h-screen bg-[var(--bg)] text-white">
      <ErrorBoundary fallback={null}>
        <OnboardingTour onComplete={() => {}} onSkip={() => {}} />
      </ErrorBoundary>
      <ErrorBoundary fallback={null}>
        <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />
      </ErrorBoundary>
      <ErrorBoundary fallback={null}>
        <ExportOptionsModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          onExport={(opts) => void handleExportWithOptions(opts, stemBuffers, mixStems, stemStates, uploadName, setSplitError, () => setShowExportModal(false))}
          isExporting={isExporting}
          stemCount={mixStems.length}
        />
      </ErrorBoundary>
      <ErrorBoundary fallback={null}>
        <MixerPresetsModal
          isOpen={showPresetsModal}
          onClose={() => setShowPresetsModal(false)}
          onLoadPreset={handleLoadPreset}
          currentMixerState={mixerState}
          currentTrimMap={trimMap}
          currentMutedStems={mutedStems}
        />
      </ErrorBoundary>
      {batchQueue.length > 0 && (
        <ErrorBoundary fallback={null}>
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
              <button type="button" onClick={() => setShowPresetsModal(true)} className="flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-white/60 transition hover:text-white" title="Presets" aria-label="Open mixer presets">
                <Save className="h-3.5 w-3.5" /><span className="hidden sm:inline">Presets</span>
              </button>
              <button type="button" onClick={() => setShowHelpModal(true)} className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white/65 transition hover:text-white" title="Help" aria-label="Open help">
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
          className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.08 } }, hidden: {} }}
        >
          {/* Left column: Source / split / load */}
          <motion.div
            className={cn("glass-panel mirror-sheen rounded-[2rem] p-5 sm:p-6 lg:col-span-5", guidanceTarget === "source" && GREEN_RING_CLASS)}
            variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.4 }}
          >
            <SplitErrorBoundary>
              <div className="flex flex-col gap-6">
                <SourcePanel
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
                  splitResultStemsLength={splitResultStems.length}
                  isExpanding={isExpanding}
                  onExpand={() => void triggerExpand()}
                  selectedStems={selectedStems}
                  onToggleStem={handleStemToggle}
                  splitError={splitError}
                  onDismissError={() => setSplitError(null)}
                  onSplit={() => void triggerSplit()}
                  isSplitting={isSplitting}
                  onAddToQueue={() => addToBatchQueue(uploadedFile)}
                />
                {subscription.status === "inactive" && (
                  <div className="border-t border-white/10 pt-6">
                    <p className="mb-4 text-center text-xs text-white/45">
                      Stem splitting uses the API when you press Split — an active plan is required. You can load a track
                      above anytime.
                    </p>
                    <PaywallBanner subscription={subscription} />
                  </div>
                )}
              </div>
            </SplitErrorBoundary>
          </motion.div>

          {/* Right column: Mixer workspace */}
          <motion.div
            className={cn("glass-panel mirror-sheen rounded-[2rem] p-5 sm:p-6 lg:col-span-7", guidanceTarget === "mixer" && GREEN_RING_CLASS)}
            variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.4 }}
          >
            <AudioErrorBoundary>
              <MixerPanel
                mixStemCount={mixStems.length}
                isPlayingMix={isPlayingMix}
                onPlayStop={() => void handlePlayMix(mixStems, stemStates, stemBuffers)}
                onStopMix={handleStopMix}
                onSeekMix={handleSeekMix}
                isExporting={isExporting}
                onExport={() => setShowExportModal(true)}
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
            </AudioErrorBoundary>
          </motion.div>

          {/* Status panel */}
          <motion.div
            className={cn("glass-panel rounded-[2rem] p-5 sm:p-6 lg:col-span-5", guidanceTarget === "status" && GREEN_RING_CLASS)}
            variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.4 }}
          >
            <StatusPanel
              isSplitting={isSplitting}
              hasMixStems={mixStems.length > 0}
              splitProgress={splitProgress}
              activeStageBlurb={activeStage.blurb}
              pipelineIndex={pipelineIndex}
              uploadName={uploadName}
              isLoadingStems={isLoadingStems}
              visibleStems={visibleStems as StemWithOptionalUrl[]}
              loadedTracks={loadedTracks}
              stemBuffers={stemBuffers}
              masterChain={MASTER_CHAIN}
            />
          </motion.div>

        </motion.section>
      </div>
    </div>
  );
}
