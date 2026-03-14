import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Upload,
  FolderOpen,
  Download,
  Play,
  Square,
  Sliders,
  RotateCcw,
  HelpCircle,
  Undo2,
  Redo2,
  Save,
} from "lucide-react";
import { splitStems, type SplitQuality, type StemResult } from "./api";
import { cn } from "./utils/cn";
import type { StemId } from "./types";
import { defaultTrim, defaultMixer } from "./types";
import { DEFAULT_STEM_COUNT } from "./config";
import { useKeyboardShortcuts, type ShortcutHandlers } from "./hooks/useKeyboardShortcuts";
import { useAudioPlayback } from "./hooks/useAudioPlayback";
import { useStemAudio, useWaveformCompute } from "./hooks/useStemAudio";
import { useExport } from "./hooks/useExport";
import { useBatchQueue } from "./hooks/useBatchQueue";
import { stemDefinitions, getStemDefinition, pipelineSteps } from "./data/stemDefinitions";
import {
  type MixerPreset,
  PipelineStep,
  HelpModal,
  ExportOptionsModal,
  MixerPresetsModal,
  OnboardingTour,
  BatchQueue,
  ComparisonToggle,
  MultiStemEditor,
  defaultStemState,
  type StemEditorState,
} from "./components";

export function App() {
  // ── Split / upload ────────────────────────────────────────────────────────
  const [stemCount, setStemCount] = useState<2 | 4>(DEFAULT_STEM_COUNT as 2 | 4);
  const [splitQuality, setSplitQuality] = useState<SplitQuality>("quality");
  const [selectedStems, setSelectedStems] = useState<Record<StemId, boolean>>({
    vocals: true, drums: true, bass: true, melody: true, instrumental: true, other: true,
  });
  const [uploadName, setUploadName] = useState("nightdrive_demo_master.wav");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [splitResultStems, setSplitResultStems] = useState<StemResult[]>([]);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitProgress, setSplitProgress] = useState(100);
  const [pipelineIndex, setPipelineIndex] = useState(pipelineSteps.length - 1);

  // ── Stem data ─────────────────────────────────────────────────────────────
  const {
    stemBuffers,
    stemWaveforms,
    loadedTracks,
    isLoadingStems,
    loadError,
    loadStemsIntoBuffers,
    clearStemData,
    clearLoadError
  } = useStemAudio();

  // ── Audio playback hook ───────────────────────────────────────────────────
  const {
    isPlayingMix, playingStem, playheadPosition,
    audioContextRef, handlePlayMix, handleStopMix, handlePreviewStem, stopPreview,
  } = useAudioPlayback();

  // ── Export hook ───────────────────────────────────────────────────────────
  const { isExporting, handleExportWithOptions } = useExport();

  // ── Batch queue hook ──────────────────────────────────────────────────────
  const {
    batchQueue, batchQueueExpanded, setBatchQueueExpanded,
    addToBatchQueue, removeFromBatchQueue, clearCompletedFromQueue, processNextInQueue,
  } = useBatchQueue();

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showPresetsModal, setShowPresetsModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [showingOriginal, setShowingOriginal] = useState(false);
  const [masterChain] = useState({ compression: 2.4, limiter: -0.8, loudness: -9 });

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Derived compat shims (used by modals)
  const trimMap = Object.fromEntries(Object.entries(stemStates).map(([id, s]) => [id, s.trim]));
  const mixerState = Object.fromEntries(Object.entries(stemStates).map(([id, s]) => [id, s.mixer]));
  const mutedStems = Object.fromEntries(Object.entries(stemStates).map(([id, s]) => [id, s.muted]));

  // ── Waveform computation (idle-scheduled) ─────────────────────────────────
  useWaveformCompute(stemBuffers, splitResultStems, setStemWaveforms);

  // ── Visible stems ─────────────────────────────────────────────────────────
  const visibleStems = useMemo(() => {
    if (splitResultStems.length > 0) {
      return splitResultStems.map((s) => ({
        ...getStemDefinition(s.id),
        id: s.id as StemId,
        url: s.url,
      }));
    }
    return stemDefinitions.filter((stem) => selectedStems[stem.id]);
  }, [splitResultStems, selectedStems]);

  // ── Pipeline progress animation ───────────────────────────────────────────
  useEffect(() => {
    if (!isSplitting) return;
    setPipelineIndex(0);
    const t1 = setTimeout(() => setPipelineIndex(1), 400);
    const t2 = setTimeout(() => setPipelineIndex(2), 1200);
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
  }, []);

  // ── Load stems into AudioBuffers after split ──────────────────────────────
  useEffect(() => {
    if (splitResultStems.length > 0) {
      loadStemsIntoBuffers(splitResultStems, audioContextRef, (ids) => {
        setStemStates((prev) => {
          const next = { ...prev };
          for (const id of ids) {
            if (!next[id]) next[id] = defaultStemState();
          }
          return next;
        });
      });
    }
  }, [splitResultStems, loadStemsIntoBuffers, audioContextRef, setStemStates]);

  // ── File handling ─────────────────────────────────────────────────────────
  const handleFile = useCallback((file: File | null) => {
    if (!file) { setUploadedFile(null); return; }
    setUploadName(file.name);
    setUploadedFile(file);
    setSplitProgress(0);
    setPipelineIndex(0);
    setSplitError(null);
    setSplitResultStems([]);
    setStemBuffers({});
    setStemWaveforms({});
    setLoadedTracks({});
    setStemStates({});
  }, []);

  // ── Split trigger ─────────────────────────────────────────────────────────
  const triggerSplit = useCallback(async () => {
    stopPreview();
    setSplitError(null);
    if (!uploadedFile) { setSplitError("Upload an audio file first."); return; }
    setIsSplitting(true);
    setSplitProgress(0);
    setPipelineIndex(0);
    try {
      const res = await splitStems(uploadedFile, String(stemCount) as "2" | "4", splitQuality, (status) => {
        setSplitProgress(status.progress);
        if (status.progress >= 100) setPipelineIndex(3);
        else if (status.progress >= 50) setPipelineIndex(2);
        else if (status.progress > 0) setPipelineIndex(1);
      });
      setSplitResultStems(res.stems);
      setSplitProgress(100);
      setPipelineIndex(3);
    } catch (err) {
      setSplitError(err instanceof Error ? err.message : "Split failed");
      setSplitProgress(0);
    } finally {
      setIsSplitting(false);
    }
  }, [uploadedFile, stemCount, splitQuality, stopPreview]);

  // ── Stem state helpers ────────────────────────────────────────────────────
  const handleStemToggle = (stemId: StemId) => {
    setSelectedStems((c) => ({ ...c, [stemId]: !c[stemId] }));
  };

  const resetTrackAdjustments = useCallback(() => {
    setStemStates((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        next[id] = { ...next[id], trim: { ...defaultTrim }, mixer: { ...defaultMixer }, rate: 1.0 };
      }
      return next;
    });
  }, []);

  const handleLoadPreset = useCallback((preset: MixerPreset) => {
    setStemStates((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        if (preset.mixerState[id]) next[id] = { ...next[id], mixer: preset.mixerState[id] };
        if (preset.trimMap[id]) next[id] = { ...next[id], trim: preset.trimMap[id] };
        if (preset.mutedStems[id] !== undefined) next[id] = { ...next[id], muted: preset.mutedStems[id] };
      }
      return next;
    });
  }, []);

  // ── Comparison toggle ─────────────────────────────────────────────────────
  const toggleComparison = useCallback(() => { setIsComparing((c) => !c); setShowingOriginal(false); }, []);
  const switchComparisonSource = useCallback(() => setShowingOriginal((s) => !s), []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  const shortcutHandlers: ShortcutHandlers = useMemo(() => ({
    playStop: () => { if (splitResultStems.length > 0) void handlePlayMix(splitResultStems, stemStates, stemBuffers); },
    solo1: () => { const id = visibleStems[0]?.id; if (id) setStemStates((c) => ({ ...c, [id]: { ...(c[id] ?? defaultStemState()), soloed: !c[id]?.soloed } })); },
    solo2: () => { const id = visibleStems[1]?.id; if (id) setStemStates((c) => ({ ...c, [id]: { ...(c[id] ?? defaultStemState()), soloed: !c[id]?.soloed } })); },
    solo3: () => { const id = visibleStems[2]?.id; if (id) setStemStates((c) => ({ ...c, [id]: { ...(c[id] ?? defaultStemState()), soloed: !c[id]?.soloed } })); },
    solo4: () => { const id = visibleStems[3]?.id; if (id) setStemStates((c) => ({ ...c, [id]: { ...(c[id] ?? defaultStemState()), soloed: !c[id]?.soloed } })); },
    muteToggle: () => { const id = visibleStems[0]?.id; if (id) setStemStates((c) => ({ ...c, [id]: { ...(c[id] ?? defaultStemState()), muted: !c[id]?.muted } })); },
    export: () => { if (splitResultStems.length > 0) setShowExportModal(true); },
    undo: () => { /* TODO: wire to useHistory */ },
    redo: () => { /* TODO: wire to useHistory */ },
    help: () => setShowHelpModal(true),
    escape: () => {
      if (showHelpModal) setShowHelpModal(false);
      else if (showExportModal) setShowExportModal(false);
      else if (showPresetsModal) setShowPresetsModal(false);
      else if (isPlayingMix) handleStopMix();
    },
  }), [splitResultStems, stemStates, stemBuffers, visibleStems, handlePlayMix, handleStopMix, showHelpModal, showExportModal, showPresetsModal, isPlayingMix]);

  useKeyboardShortcuts(shortcutHandlers, true);

  const activeStage = pipelineSteps[pipelineIndex];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--bg)] text-white">
      <OnboardingTour onComplete={() => {}} onSkip={() => {}} />

      <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />
      <ExportOptionsModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={(opts) => void handleExportWithOptions(opts, stemBuffers, splitResultStems, stemStates, uploadName, setSplitError, () => setShowExportModal(false))}
        isExporting={isExporting}
        stemCount={splitResultStems.length}
      />
      <MixerPresetsModal
        isOpen={showPresetsModal}
        onClose={() => setShowPresetsModal(false)}
        onLoadPreset={handleLoadPreset}
        currentMixerState={mixerState}
        currentTrimMap={trimMap}
        currentMutedStems={mutedStems}
      />

      {batchQueue.length > 0 && (
        <BatchQueue
          items={batchQueue}
          isExpanded={batchQueueExpanded}
          onToggleExpand={() => setBatchQueueExpanded((e) => !e)}
          onRemoveItem={removeFromBatchQueue}
          onClearCompleted={clearCompletedFromQueue}
          onProcessQueue={() => void processNextInQueue(stemCount, splitQuality, setSplitResultStems, setSplitError)}
        />
      )}

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="fire-orb left-[-8rem] top-[-6rem] h-80 w-80" />
        <div className="fire-orb right-[-10rem] top-20 h-[26rem] w-[26rem] opacity-75" />
        <div className="fire-orb bottom-[-12rem] left-1/3 h-[30rem] w-[30rem] opacity-60" />
        <div className="mesh-overlay" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
        {/* ── Header ── */}
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
              <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 border transition-all", splitResultStems.length > 0 && !isExporting ? "border-amber-400/40 bg-amber-500/15 text-amber-200" : "border-white/10 bg-white/5 text-white/65")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", splitResultStems.length > 0 ? "bg-amber-400" : "bg-white/40")} />Mix & Export
              </span>
            </div>
            {splitResultStems.length > 0 && <p className="text-xs text-green-400/80">{splitResultStems.length} stems ready</p>}
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-xl border border-white/10 bg-black/20">
                <button type="button" disabled className="flex h-8 w-8 items-center justify-center text-white/65 transition hover:text-white disabled:opacity-30" title="Undo (Cmd/Ctrl+Z)"><Undo2 className="h-4 w-4" /></button>
                <div className="h-4 w-px bg-white/10" />
                <button type="button" disabled className="flex h-8 w-8 items-center justify-center text-white/65 transition hover:text-white disabled:opacity-30" title="Redo (Cmd/Ctrl+Y)"><Redo2 className="h-4 w-4" /></button>
              </div>
              <button type="button" onClick={() => setShowPresetsModal(true)} className="flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-white/60 transition hover:border-white/20 hover:text-white" title="Mixer presets">
                <Save className="h-3.5 w-3.5" /><span className="hidden sm:inline">Presets</span>
              </button>
              <button type="button" onClick={() => setShowHelpModal(true)} className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white/65 transition hover:border-white/20 hover:text-white" title="Keyboard shortcuts (?)">
                <HelpCircle className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* ── Marquee ── */}
        <motion.div className="overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] backdrop-blur-sm" initial={{ opacity: 0.6 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
          <div className="flex w-max animate-scroll-text gap-12 py-2.5 text-xs uppercase tracking-[0.35em] text-white/60">
            <span>Drop track · Split · Mix · Export</span>
            <span>Fire-polished stem control with mirrored glass precision.</span>
            <span>Drop track · Split · Mix · Export</span>
            <span>Fire-polished stem control with mirrored glass precision.</span>
          </div>
        </motion.div>

        {/* ── Main content ── */}
        <motion.section className="flex flex-col gap-6" initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.08 } }, hidden: {} }}>

          {/* ── Upload & Split panel ── */}
          <motion.div className="glass-panel mirror-sheen rounded-[2rem] p-5 sm:p-6" variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.4 }}>
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="eyebrow">Split & stems</p>
                <h2 className="font-display text-2xl tracking-[-0.04em] text-white">Upload, split, then mix in one place</h2>
              </div>
              <div className="inline-flex items-center gap-3 rounded-full border border-amber-200/10 bg-white/5 px-4 py-2 text-sm text-white/70">
                <span className="status-light" />{uploadName}
              </div>
            </div>

            <div className="space-y-4">
              {/* Step 1: Drop zone */}
              <div className={cn("transition-all duration-300", uploadedFile && "opacity-75")}>
                <p className={cn("mb-2 text-[10px] font-semibold uppercase tracking-[0.35em] transition-colors", !uploadedFile ? "text-amber-200/95" : "text-white/60")}>Step 1</p>
                <div
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files?.[0] ?? null); }}
                  className={cn(
                    "step-zone group relative flex w-full cursor-pointer items-center gap-4 overflow-hidden rounded-xl border px-4 py-3 text-left transition-all duration-300",
                    !uploadedFile && "step-zone-glow border-amber-400/40 bg-amber-950/30 shadow-[0_0_24px_rgba(255,140,80,0.35),0_0_48px_rgba(255,100,60,0.15)]",
                    uploadedFile && "border-white/10 bg-black/25",
                    isDragging && "scale-[1.01] border-amber-400/60 shadow-[0_0_32px_rgba(255,140,80,0.5)]",
                  )}
                >
                  <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all icon-pulse-hover", !uploadedFile ? "border-amber-400/30 bg-amber-500/20 shadow-[0_0_16px_rgba(255,180,100,0.4)]" : "border-white/12 bg-white/8")}>
                    <Upload className="h-5 w-5 text-white" strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    {uploadedFile ? (
                      <span className="font-medium text-white">{uploadName}</span>
                    ) : (
                      <>
                        <span className="font-display text-lg tracking-tight text-white">Drop your track here</span>
                        <span className="ml-2 text-xs text-white/60">or click to browse · WAV, MP3, AIFF</span>
                      </>
                    )}
                  </div>
                  {uploadedFile && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); handleFile(null); }} className="ghost-button shrink-0 rounded-lg px-3 py-1.5 text-xs">Change</button>
                  )}
                </div>
              </div>

              {/* Step 2: Options & split */}
              <div className={cn("transition-all duration-300", !uploadedFile && "pointer-events-none opacity-50")}>
                <p className={cn("mb-2 text-[10px] font-semibold uppercase tracking-[0.35em] transition-colors", uploadedFile ? "text-amber-200/95" : "text-white/70")}>Step 2</p>
                <div className={cn("rounded-xl border p-4 transition-all duration-300", uploadedFile ? "step-zone-glow border-amber-400/30 bg-amber-950/20 shadow-[0_0_20px_rgba(255,140,80,0.25),0_0_40px_rgba(255,100,60,0.1)]" : "border-white/10 bg-black/25")}>
                  <div className="space-y-5">
                    {/* Stem count */}
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-white/65">Stem count</p>
                      <div className="mt-3 flex gap-3">
                        <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 transition hover:bg-white/10">
                          <input type="radio" name="stemCount" checked={stemCount === 2} onChange={() => setStemCount(2)} className="text-amber-300 focus:ring-amber-300" />
                          2 stems — vocals + instrumental
                        </label>
                        <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 transition hover:bg-white/10">
                          <input type="radio" name="stemCount" checked={stemCount === 4} onChange={() => setStemCount(4)} className="text-amber-300 focus:ring-amber-300" />
                          4 stems — vocals, drums, bass, other
                        </label>
                      </div>
                    </div>

                    {/* Quality */}
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-white/65">Quality vs speed</p>
                      <div className="mt-3 flex gap-3">
                        <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 transition hover:bg-white/10">
                          <input type="radio" name="splitQuality" checked={splitQuality === "speed"} onChange={() => setSplitQuality("speed")} className="text-amber-300 focus:ring-amber-300" />
                          {stemCount === 2 ? "Speed — Demucs 2-stem" : "Speed — htdemucs ONNX"}
                        </label>
                        <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 transition hover:bg-white/10">
                          <input type="radio" name="splitQuality" checked={splitQuality === "quality"} onChange={() => setSplitQuality("quality")} className="text-amber-300 focus:ring-amber-300" />
                          {stemCount === 2 ? "Quality — MDX ONNX vocal+inst" : "Quality — htdemucs 6s ONNX"}
                        </label>
                        <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/80 transition hover:bg-amber-500/20">
                          <input type="radio" name="splitQuality" checked={splitQuality === "ultra"} onChange={() => setSplitQuality("ultra")} className="text-amber-300 focus:ring-amber-300" />
                          Ultra — RoFormer (extra setup)
                        </label>
                      </div>
                      {splitQuality === "speed" && <p className="mt-2 text-xs text-white/50">{stemCount === 2 ? "Demucs htdemucs 2-stem subprocess. Fast, phase-aligned." : "Single-pass htdemucs_embedded.onnx. Fastest 4-stem on CPU."}</p>}
                      {splitQuality === "quality" && <p className="mt-2 text-xs text-white/50">{stemCount === 2 ? "MDX ONNX vocal model (Kim_Vocal_2) + instrumental (Inst_HQ_4)." : "Single-pass htdemucs_6s.onnx (6-stem folded to 4). Better separation."}</p>}
                      {splitQuality === "ultra" && <p className="mt-2 text-xs text-amber-300/70">Requires <code className="rounded bg-white/10 px-1">pip install audio-separator[cpu]</code>. Very slow on CPU (30–120 min). Returns error if library not installed.</p>}
                    </div>

                    {/* Stem visibility toggles (post-split) */}
                    {splitResultStems.length > 0 && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.3 }}>
                        <p className="text-xs uppercase tracking-[0.3em] text-white/65">Pick stems to show</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {stemDefinitions.map((stem) => {
                            const on = selectedStems[stem.id] ?? false;
                            const base = "glow-toggle flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-medium transition-all duration-200";
                            const cls = `stem-toggle-${stem.id}`;
                            return on ? (
                              <button key={stem.id} type="button" onClick={() => handleStemToggle(stem.id)} className={cn(base, cls, "stem-toggle-active border-current shadow-lg")} aria-pressed="true">
                                <span className="flex items-center gap-3"><span className={cn("stem-toggle-dot h-2.5 w-2.5 rounded-full transition-all stem-toggle-dot-on scale-110", cls)} />{stem.label}</span>
                                <span className="text-xs uppercase tracking-wider opacity-100">On</span>
                              </button>
                            ) : (
                              <button key={stem.id} type="button" onClick={() => handleStemToggle(stem.id)} className={cn(base, cls, "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:border-white/20")} aria-pressed="false">
                                <span className="flex items-center gap-3"><span className={cn("stem-toggle-dot h-2.5 w-2.5 rounded-full transition-all", cls)} />{stem.label}</span>
                                <span className="text-xs uppercase tracking-wider opacity-50">Off</span>
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}

                    {splitError && (
                      <div className="rounded-2xl border border-red-400/30 bg-red-950/30 px-4 py-3">
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-red-200">Split failed</p>
                            <p className="mt-1 text-xs text-red-300/70">{splitError}</p>
                          </div>
                          <button type="button" onClick={() => setSplitError(null)} className="text-red-300/60 hover:text-red-200 transition-colors text-xs">Dismiss</button>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button type="button" onClick={() => void triggerSplit()} disabled={!uploadedFile || isSplitting} className="fire-button flex-1 justify-center disabled:opacity-60">
                        {isSplitting ? "Splitting stems..." : "Split and Generate Stem Rack"}
                      </button>
                      <button type="button" onClick={() => addToBatchQueue(uploadedFile)} disabled={!uploadedFile || isSplitting} className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-50">
                        Add to queue
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <input ref={inputRef} id="stem-file-input" type="file" accept="audio/*" className="hidden" aria-label="Choose audio file" title="Choose audio file" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />

            {/* ── Step 3: Mixer / MultiStemEditor ── */}
            {splitResultStems.length > 0 ? (
              <motion.div className="mt-6 border-t border-white/10 pt-6" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }}>
                <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-amber-200/80 mb-1">Step 3</p>
                    <p className="text-sm text-white/70">Trim, level & pan on each row. Play mix, then export.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className={cn("icon-pulse-hover flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition", isPlayingMix ? "border-amber-400/50 bg-amber-500/20 text-amber-100" : "ghost-button")} onClick={() => void handlePlayMix(splitResultStems, stemStates, stemBuffers)} disabled={Object.keys(stemBuffers).length === 0}>
                      {isPlayingMix ? <Square className="h-4 w-4" strokeWidth={2.5} /> : <Play className="h-4 w-4" strokeWidth={2.5} />}
                      {isPlayingMix ? "Stop mix" : "Play mix"}
                    </button>
                    <button type="button" className="fire-button icon-pulse-hover flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm" onClick={() => setShowExportModal(true)} disabled={isExporting || Object.keys(stemBuffers).length === 0}>
                      <Download className="h-4 w-4" strokeWidth={2} />
                      {isExporting ? "Rendering..." : "Export"}
                    </button>
                    <ComparisonToggle isComparing={isComparing} showingOriginal={showingOriginal} onToggle={toggleComparison} onSwitch={switchComparisonSource} disabled={true} />
                    <button type="button" className="ghost-button flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/70 transition hover:border-white/20 hover:text-white" onClick={resetTrackAdjustments} title="Reset trim, level & pan to defaults">
                      <RotateCcw className="h-4 w-4" strokeWidth={2} />Reset levels
                    </button>
                  </div>
                </div>

                <div className="relative mt-4">
                  <MultiStemEditor
                    stems={visibleStems}
                    waveforms={stemWaveforms}
                    durations={Object.fromEntries(visibleStems.map((s) => [s.id, stemBuffers[s.id]?.duration ?? 0]))}
                    stemStates={stemStates}
                    isPlaying={isPlayingMix}
                    playheadPct={playheadPosition}
                    isLoadingStems={isLoadingStems}
                    onStemStateChange={(stemId, patch) => setStemStates((prev) => ({ ...prev, [stemId]: { ...(prev[stemId] ?? defaultStemState()), ...patch } }))}
                    onSeek={(_pct) => { /* TODO: seek playback */ }}
                    onPlayPause={() => void handlePlayMix(splitResultStems, stemStates, stemBuffers)}
                    onPreviewStem={(stemId) => {
                      const url = splitResultStems.find((s) => s.id === stemId)?.url;
                      void handlePreviewStem(stemId, url, stemBuffers, setStemBuffers);
                    }}
                    playingStemId={playingStem}
                  />
                </div>
              </motion.div>
            ) : (
              <div className="mt-6 border-t border-white/10 pt-6">
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-12 text-center">
                  <Sliders className="h-10 w-10 text-white/25 mb-4" strokeWidth={1.5} />
                  <p className="text-white/65 text-sm font-medium mb-1">Mixer Controls</p>
                  <p className="text-white/60 text-xs max-w-xs">Upload a track and split it to reveal stem controls.</p>
                </div>
              </div>
            )}
          </motion.div>

          {/* ── Status panel ── */}
          <motion.div className="glass-panel rounded-[2rem] p-5 sm:p-6" variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.4 }}>
            <p className="eyebrow">What&apos;s happening</p>
            <h2 className="font-display text-2xl tracking-[-0.04em] text-white mb-5">Status · Tracks · Master</h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-4 py-3" role="status" aria-live="polite">
                <span className="text-xs uppercase tracking-wider text-white/65">Status</span>
                <span className="font-semibold text-white">{isSplitting ? "Splitting…" : splitResultStems.length > 0 ? "Stems ready" : "Ready"}</span>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs uppercase tracking-wider text-white/65 mb-2">
                  <span>Split progress</span><span>{splitProgress}%</span>
                </div>
                <div className="progress-shimmer h-2 overflow-hidden rounded-full bg-white/10 backdrop-blur-sm">
                  <div className="progress-glow h-full rounded-full bg-[linear-gradient(90deg,#ff633d_0%,#ffbb61_44%,#ffe3a0_100%)] transition-all duration-300" style={{ width: `${splitProgress}%` }} />
                </div>
                <p className="mt-2 text-sm text-white/64">{activeStage.blurb}</p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {pipelineSteps.map((step, index) => (
                <PipelineStep key={step.title} title={step.title} active={index === pipelineIndex} done={index < pipelineIndex}>{step.blurb}</PipelineStep>
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-white/10 bg-black/25 p-4">
              <div className="flex items-center gap-2 mb-3">
                <FolderOpen className="h-5 w-5 text-white/70" strokeWidth={1.8} />
                <span className="text-xs font-semibold uppercase tracking-wider text-white/65">Track status · {uploadName.replace(/\.[^/.]+$/, "")}</span>
                {isLoadingStems && <span className="text-xs text-amber-200/90">Loading stems…</span>}
              </div>
              <div className="space-y-2">
                {visibleStems.map((stem) => (
                  <div key={stem.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stem.glow, boxShadow: `0 0 8px ${stem.glowSoft}` }} />
                      <span className="text-sm text-white">{stem.label}</span>
                      <span className="text-xs text-white/65">{loadedTracks[stem.id] ? "Ready" : stemBuffers[stem.id] ? "Buffered" : isLoadingStems ? "Loading…" : "Pending"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

             <div className="mt-5 rounded-xl border border-white/10 bg-black/25 p-4">
               <div className="text-xs font-semibold uppercase tracking-wider text-white/65 mb-3">Track status · {uploadName.replace(/\.[^/.]+$/, "")}</span>
               {isLoadingStems && <span className="text-xs text-amber-200/90">Loading stems…</span>}
               {loadError && <span className="text-xs text-red-400">Error: {loadError}</span>}
             </div>
            </div>

            <p className="mt-5 text-xs text-white/65">
              Tip: Use <strong className="text-white/70">Play mix</strong> to hear everything together, then <strong className="text-white/70">Export WAV</strong> to download.
            </p>
          </motion.div>
        </motion.section>
      </div>
    </div>
  );
}
