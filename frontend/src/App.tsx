import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Upload, FolderOpen, Download, Play, Square,
  Sliders, RotateCcw, HelpCircle, Undo2, Redo2, Save,
} from "lucide-react";
import { splitStems, expandStems, type SplitQuality, type StemResult } from "./api";
import { cn } from "./utils/cn";
import type { StemDefinition, StemId } from "./types";
import { defaultTrim, defaultMixer } from "./types";
import { useKeyboardShortcuts, type ShortcutHandlers } from "./hooks/useKeyboardShortcuts";
import { useAudioPlayback } from "./hooks/useAudioPlayback";
import { useWaveformCompute } from "./hooks/useStemAudio";
import { useExport } from "./hooks/useExport";
import { useBatchQueue } from "./hooks/useBatchQueue";
import { useHistory } from "./hooks/useHistory";
import { useMixerWorkspace } from "./hooks/useMixerWorkspace";
import { stemDefinitions, getStemDefinition, getLoadedStemDefinition, pipelineSteps } from "./data/stemDefinitions";
import {
  type MixerPreset,
  HelpModal,
  ExportOptionsModal,
  MixerPresetsModal,
  OnboardingTour,
  BatchQueue,
  StatusPanel,
  MixerPanel,
  SourcePanel,
} from "./components";
import { defaultStemState, type StemEditorState } from "./stem-editor-state";

const MASTER_CHAIN = { compression: 2.4, limiter: -0.8, loudness: -9 } as const;
type StemWithOptionalUrl = StemDefinition & { url?: string };

export function App() {
  // ── Upload / split state ──────────────────────────────────────────────────
  const [uploadState, setUploadState] = useState({
    quality: "quality" as SplitQuality,
    selectedStems: {
      vocals: true, drums: true, bass: true, melody: true, instrumental: true, other: true,
    } as Record<StemId, boolean>,
    uploadName: "nightdrive_demo_master.wav",
    uploadedFile: null as File | null,
    splitResultStems: [] as StemResult[],
    splitJobId: null as string | null,
    loadedStems: [] as Array<{ id: string; label: string; url: string }>,
    splitError: null as string | null,
    isDragging: false,
    isSplitting: false,
    isExpanding: false,
    splitProgress: 0,
    pipelineIndex: 0
  });
  const {
    quality, selectedStems, uploadName, uploadedFile, splitResultStems, splitJobId,
    loadedStems, splitError, isDragging, isSplitting, isExpanding, splitProgress, pipelineIndex,
  } = uploadState;
  const setSplitError = (msg: string | null) => setUploadState(prev => ({ ...prev, splitError: msg }));
  useEffect(() => {
    uploadedFileRef.current = uploadedFile;
  }, [uploadedFile]);

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
  const [stemBuffers, setStemBuffers] = useState<Record<string, AudioBuffer>>({});
  const stemBuffersRef = useRef<Record<string, AudioBuffer>>({});
  // Keep ref in sync so async callbacks always read the latest buffers without being deps
  useEffect(() => { stemBuffersRef.current = stemBuffers; }, [stemBuffers]);
  const [stemWaveforms, setStemWaveforms] = useState<Record<string, number[]>>({});
  const [loadedTracks, setLoadedTracks] = useState<Record<string, boolean>>({});
  const [isLoadingStems, setIsLoadingStems] = useState(false);

  // ── Audio playback hook ───────────────────────────────────────────────────
  const {
    isPlayingMix, playingStem,
    getPlayheadPosition, subscribePlayheadPosition,
    audioContextRef, handlePlayMix, handleSeekMix, handleStopMix, handlePreviewStem, stopPreview,
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
  const [sourceMode, setSourceMode] = useState<"split" | "load">("split");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const loadStemsInputRef = useRef<HTMLInputElement | null>(null);
  const uploadedFileRef = useRef<File | null>(null);

  // Derived shims for modals (memoized to avoid new refs every render)
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

   // ── All stems (split + loaded) for mixer ───────────────────────────────────
   const allStemEntries = useMemo(
     () => [
       ...splitResultStems.map((s) => ({ id: s.id, url: s.url })),
       ...loadedStems.map((s) => ({ id: s.id, url: s.url })),
     ],
     [splitResultStems, loadedStems]
   );

   /** Combined list for playback/export: split stems + loaded stems (each has id, url). */
   const mixStems = useMemo(
     () => [...splitResultStems, ...loadedStems] as Array<{ id: string; url: string }>,
     [splitResultStems, loadedStems]
   );

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

   // ── Waveform computation (idle-scheduled) ─────────────────────────────────
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
   useWaveformCompute(stemBuffers, allStemEntries, setStemWaveforms);

   // ── Visible stems (with definitions for display) ───────────────────────────
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
     const t1 = setTimeout(() => setUploadState(prev => ({ ...prev, pipelineIndex: 1 })), 400);
     const t2 = setTimeout(() => setUploadState(prev => ({ ...prev, pipelineIndex: 2 })), 1200);
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

   // ── Load stems into AudioBuffers (split + loaded) ───────────────────────────
   const loadStemsIntoBuffers = useCallback(async () => {
     if (allStemEntries.length === 0) return;
     setIsLoadingStems(true);
     const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
     if (!Ctor) { 
       setIsLoadingStems(false);
       return; 
     }
     if (!audioContextRef.current) audioContextRef.current = new Ctor();
     const ctx = audioContextRef.current;
     await ctx.resume();

     const existing = stemBuffersRef.current;
     const newBuffers: Record<string, AudioBuffer> = {};
     const newLoaded: Record<string, boolean> = {};
     const toLoad = allStemEntries.filter((e) => !existing[e.id]);

     if (toLoad.length > 0) {
       try {
         const results = await Promise.all(toLoad.map(async (stem) => {
           const res = await fetch(stem.url);
           if (!res.ok) throw new Error(`HTTP ${res.status} loading ${stem.id}`);
           const buf = await ctx.decodeAudioData(await res.arrayBuffer());
           return { id: stem.id, buf };
         }));
         for (const { id, buf } of results) { 
           newBuffers[id] = buf; 
           newLoaded[id] = true; 
         }
       } catch (e) { 
         console.error("Failed to load stems:", e); 
       }
     }

     for (const e of allStemEntries) {
       if (existing[e.id]) { 
         newBuffers[e.id] = existing[e.id]; 
         newLoaded[e.id] = true; 
       }
     }

     setStemBuffers((p) => ({ ...p, ...newBuffers }));
     setLoadedTracks((p) => ({ ...p, ...newLoaded }));
     setStemStates((p) => {
       const next = { ...p };
       for (const e of allStemEntries) { 
         if (!next[e.id]) next[e.id] = defaultStemState(); 
       }
       return next;
     });
     setIsLoadingStems(false);
   }, [allStemEntries, audioContextRef]);

  useEffect(() => {
    if (allStemEntries.length > 0) void loadStemsIntoBuffers();
  }, [allStemEntries, loadStemsIntoBuffers]);

  // ── File handling ─────────────────────────────────────────────────────────
    const handleFile = useCallback((file: File | null) => {
    if (!file) { 
      setUploadState(prev => ({ ...prev, uploadedFile: null })); 
      return; 
    }
    setUploadState(prev => ({
      ...prev,
      uploadName: file.name,
      uploadedFile: file,
      splitProgress: 0,
      pipelineIndex: 0,
      splitError: null,
      splitResultStems: [],
      splitJobId: null,
      loadedStems: prev.loadedStems.filter((stem) => {
        if (stem.id.startsWith("loaded_")) {
          URL.revokeObjectURL(stem.url);
          return false;
        }
        return true;
      }),
    }));
    setStemBuffers({});
    setStemWaveforms({});
    setLoadedTracks({});
    resetStemStates({});
  }, []);

    const handleLoadStems = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    const ts = Date.now();
    const next = Array.from(files).map((file, i) => {
      const id = `loaded_${ts}_${i}`;
      return { id, label: file.name, url: URL.createObjectURL(file) };
    });
    setUploadState(prev => ({ 
      ...prev, 
      loadedStems: [...prev.loadedStems, ...next] 
    }));
    loadStemsInputRef.current = null;
  }, []);

    const removeLoadedStem = useCallback((id: string) => {
    setUploadState(prev => {
      const updatedLoadedStems = prev.loadedStems.filter(stem => stem.id !== id);
      const removedEntry = prev.loadedStems.find(stem => stem.id === id);
      if (removedEntry) URL.revokeObjectURL(removedEntry.url);
      return {
        ...prev,
        loadedStems: updatedLoadedStems
      };
    });
    setStemBuffers(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setStemStates(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setLoadedTracks(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // ── Split (always 2-stem first: vocals + instrumental) ─────────────────────
  const triggerSplit = useCallback(async () => {
    stopPreview();
    const file = uploadedFileRef.current;
    if (!file || !(file instanceof File) || file.size === 0) {
      setUploadState(prev => ({ ...prev, splitError: "Upload an audio file first." }));
      return;
    }
    setUploadState(prev => ({ ...prev, isSplitting: true, splitProgress: 0, pipelineIndex: 0, splitError: null }));
    try {
      const res = await splitStems(file, "2", quality, (s) => {
        setUploadState(prev => ({ ...prev, splitProgress: s.progress }));
        if (s.progress >= 100) setUploadState(prev => ({ ...prev, pipelineIndex: 3 }));
        else if (s.progress >= 50) setUploadState(prev => ({ ...prev, pipelineIndex: 2 }));
        else if (s.progress > 0) setUploadState(prev => ({ ...prev, pipelineIndex: 1 }));
      });
      setUploadState(prev => ({ 
        ...prev, 
        splitResultStems: res.stems,
        splitJobId: res.job_id,
        splitProgress: 100,
        pipelineIndex: 3
      }));
    } catch (err) {
      setUploadState(prev => ({ 
        ...prev, 
        splitError: err instanceof Error ? err.message : "Split failed",
        splitProgress: 0,
        pipelineIndex: 0
      }));
    } finally {
      setUploadState(prev => ({ ...prev, isSplitting: false }));
    }
  }, [quality, stopPreview]);

  // ── Expand 2-stem → 4-stem (Keep Going) ────────────────────────────────────
    const triggerExpand = useCallback(async () => {
    if (!splitJobId || splitResultStems.length !== 2) return;
    setUploadState(prev => ({ ...prev, splitError: null, isExpanding: true, splitProgress: 0, pipelineIndex: 0 }));
    try {
      const res = await expandStems(splitJobId, quality, (s) => {
        setUploadState(prev => ({ ...prev, splitProgress: s.progress }));
        if (s.progress >= 100) setUploadState(prev => ({ ...prev, pipelineIndex: 3 }));
        else if (s.progress >= 50) setUploadState(prev => ({ ...prev, pipelineIndex: 2 }));
        else if (s.progress > 0) setUploadState(prev => ({ ...prev, pipelineIndex: 1 }));
      });
      setUploadState(prev => ({ 
        ...prev, 
        splitResultStems: res.stems,
        splitJobId: res.job_id,
        splitProgress: 100,
        pipelineIndex: 3
      }));
    } catch (err) {
      setUploadState(prev => ({ 
        ...prev, 
        splitError: err instanceof Error ? err.message : "Expand failed",
        splitProgress: 0,
        pipelineIndex: 0
      }));
    } finally {
      setUploadState(prev => ({ ...prev, isExpanding: false }));
    }
  }, [splitJobId, splitResultStems, quality]);

  // ── Stem helpers ──────────────────────────────────────────────────────────
    const handleStemToggle = (stemId: StemId) => setUploadState(prev => ({ 
      ...prev, 
      selectedStems: { ...prev.selectedStems, [stemId]: !prev.selectedStems[stemId] } 
    }));

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
    const TRIM_STEP = 1; // percent per keypress
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
      <OnboardingTour onComplete={() => {}} onSkip={() => {}} />
      <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />
      <ExportOptionsModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={(opts) => void handleExportWithOptions(opts, stemBuffers, mixStems, stemStates, uploadName, setSplitError, () => setShowExportModal(false))}
        isExporting={isExporting}
        stemCount={mixStems.length}
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
          onProcessQueue={() => void processNextInQueue(2, quality, 
            (stems) => setUploadState(prev => ({ ...prev, splitResultStems: stems })),
            setSplitError,
            (id) => setUploadState(prev => ({ ...prev, splitJobId: id }))
          )}
        />
      )}

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
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
                <button type="button" onClick={undoStemStates} disabled={!canUndo} className="flex h-8 w-8 items-center justify-center text-white/65 disabled:opacity-30 transition hover:text-white" title="Undo (Ctrl+Z)"><Undo2 className="h-4 w-4" /></button>
                <div className="h-4 w-px bg-white/10" />
                <button type="button" onClick={redoStemStates} disabled={!canRedo} className="flex h-8 w-8 items-center justify-center text-white/65 disabled:opacity-30 transition hover:text-white" title="Redo (Ctrl+Y)"><Redo2 className="h-4 w-4" /></button>
              </div>
              <button type="button" onClick={() => setShowPresetsModal(true)} className="flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-white/60 transition hover:text-white" title="Presets" aria-label="Open mixer presets">
                <Save className="h-3.5 w-3.5" /><span className="hidden sm:inline">Presets</span>
              </button>
              <button type="button" onClick={() => setShowHelpModal(true)} className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white/65 transition hover:text-white" title="Help" aria-label="Open help">
                <HelpCircle className="h-4 w-4" />
              </button>
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
              onBrowseUpload={() => inputRef.current?.click()}
              onClearUpload={() => handleFile(null)}
              onDropUpload={(file) => handleFile(file)}
              inputRef={inputRef}
              onUploadFileInput={(file) => handleFile(file)}
              quality={quality}
              onQualityChange={(next) => setUploadState((prev) => ({ ...prev, quality: next }))}
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
          </motion.div>

          {/* Right column: Mixer workspace */}
          <motion.div
            className={cn("glass-panel mirror-sheen rounded-[2rem] p-5 sm:p-6 lg:col-span-7", guidanceTarget === "mixer" && GREEN_RING_CLASS)}
            variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.4 }}
          >
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
            />
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
