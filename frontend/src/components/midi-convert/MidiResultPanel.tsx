/**
 * MidiResultPanel — shows conversion results: piano roll, stats, download button.
 * Includes View/Edit toggle for the interactive MIDI note editor.
 */
import {
  Download,
  Loader2,
  Music,
  Pencil,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { MidiConvertResult } from "../../hooks/useMidiConvert";
import { useMidiPlayback } from "../../hooks/useMidiPlayback";
import { SegmentedControl } from "../ui";
import type { LoopRegion } from "./editorTypes";
import { DEFAULT_LOOP } from "./editorTypes";
import { MidiAnalysisPanel } from "./MidiAnalysisPanel";
import { MidiAnalysisSummary } from "./MidiAnalysisSummary";
import { MidiEmptyTranscriptionBanner } from "./MidiEmptyTranscriptionBanner";
import { MidiNoteEditor } from "./MidiNoteEditor";
import { MidiPianoRoll } from "./MidiPianoRoll";
import { MidiRenderAudioControl } from "./MidiRenderAudioControl";
import { MidiLaneDrawer } from "./MidiLaneDrawer";
import {
  readMidiResultModeFromUrl,
  syncMidiResultModeToUrl,
} from "./midiResultUrlMode";
import { isDrumMidiContext } from "../../utils/midiStemContext";
import "./midi-tokens.css";

interface MidiResultPanelProps {
  result: MidiConvertResult;
  onDownload: () => void;
  isDownloading?: boolean;
  downloadError?: string | null;
  onNewConversion: () => void;
  onApplyEditorBpm?: (bpm: number) => void;
  onApplyReconvertBpm?: (bpm: number) => void;
  onAdjustSettings?: () => void;
  onRetry?: () => void;
  onOpenExportHistory?: () => void;
  jobId?: string | null;
  jobToken?: string | null;
  sourceLabel?: string;
  initialMode?: "view" | "edit";
  e2eMode?: boolean;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function MidiResultPanel({
  result,
  onDownload,
  isDownloading = false,
  downloadError = null,
  onNewConversion,
  onApplyEditorBpm: _onApplyEditorBpm,
  onApplyReconvertBpm,
  onAdjustSettings,
  onRetry,
  onOpenExportHistory,
  jobId = null,
  jobToken = null,
  sourceLabel,
  initialMode = "edit",
  e2eMode = false,
}: MidiResultPanelProps) {
  const hasNotes = result.pianoRollNotes.length > 0;
  const isEmpty = result.emptyTranscription || result.notesDetected === 0;
  const { isPlaying, currentTime, play, stop, seek, isSupported } = useMidiPlayback();
  const [mode, setMode] = useState<"view" | "edit">(() => {
    if (isEmpty) return "view";
    return readMidiResultModeFromUrl() ?? initialMode;
  });
  const [analysisExpanded, setAnalysisExpanded] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const editorApiRef = useRef<{
    setBpm: (bpm: number) => void;
    quantizeSelected: () => void;
    hasSelection: () => boolean;
  } | null>(null);
  const pendingEditorBpmRef = useRef<number | null>(null);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const [showGlow, setShowGlow] = useState(() => !prefersReducedMotion && hasNotes);
  useEffect(() => {
    if (prefersReducedMotion || !showGlow) return;
    const timer = setTimeout(() => setShowGlow(false), 1500);
    return () => clearTimeout(timer);
  }, [prefersReducedMotion, showGlow]);

  const suggestedBpm = result.analysis?.suggested_bpm ?? 120;

  const noteSpan = useMemo(() => {
    if (!result.pianoRollNotes.length) return { start: 0, end: 4 };
    const starts = result.pianoRollNotes.map((n) => n.start);
    const ends = result.pianoRollNotes.map((n) => n.start + n.duration);
    return { start: Math.min(...starts), end: Math.max(...ends) };
  }, [result.pianoRollNotes]);

  const [loopRegion, setLoopRegion] = useState<LoopRegion>(DEFAULT_LOOP);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset loop region when note span changes (new MIDI data loaded)
    setLoopRegion({
      enabled: false,
      start: noteSpan.start,
      end: Math.max(noteSpan.end, noteSpan.start + 1),
    });
  }, [noteSpan.start, noteSpan.end]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const next = syncMidiResultModeToUrl(mode);
    window.history.replaceState(null, "", next);
  }, [mode]);

  const isDrumContent = useMemo(
    () => isDrumMidiContext(sourceLabel, result.fileAnalysis),
    [sourceLabel, result.fileAnalysis],
  );

  const handleApplyEditorBpm = useCallback(
    (bpm: number) => {
      if (mode === "edit" && editorApiRef.current) {
        editorApiRef.current.setBpm(bpm);
        if (editorApiRef.current.hasSelection()) {
          editorApiRef.current.quantizeSelected();
        }
        return;
      }
      pendingEditorBpmRef.current = bpm;
      setMode("edit");
    },
    [mode],
  );

  const handleRegisterEditor = useCallback(
    (api: {
      setBpm: (bpm: number) => void;
      quantizeSelected: () => void;
      hasSelection: () => boolean;
    }) => {
      editorApiRef.current = api;
      if (pendingEditorBpmRef.current != null) {
        api.setBpm(pendingEditorBpmRef.current);
        if (api.hasSelection()) {
          api.quantizeSelected();
        }
        pendingEditorBpmRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (!hasNotes) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (e.key === "v" || e.key === "V") setMode("view");
      if (e.key === "e" || e.key === "E") setMode("edit");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hasNotes]);

  const playbackOptions = useMemo(
    () => ({
      bpm: suggestedBpm,
      loopRegion: loopRegion.enabled ? loopRegion : undefined,
    }),
    [suggestedBpm, loopRegion],
  );

  const entranceProps = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12, scale: 0.98 } as const,
        animate: { opacity: 1, y: 0, scale: 1 } as const,
        transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
      };

  return (
    <motion.div
      ref={surfaceRef}
      className={`midi-result-surface${showGlow ? " midi-result-surface--glow" : ""}`}
      data-testid="midi-result-panel"
      {...entranceProps}
    >
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div className="flex min-w-0 items-center gap-xs">
          <Music
            className="h-4 w-4 shrink-0 text-accent-midi-300"
            aria-hidden
          />
          <h3 className="text-sm font-semibold text-secondary-foreground">
            {isEmpty ? "No notes detected" : "Notes ready — edit and export"}
          </h3>
        </div>
      </div>

      {result.analysis && hasNotes ? (
        <MidiAnalysisSummary
          analysis={result.analysis}
          fileAnalysis={result.fileAnalysis}
          notesDetected={result.notesDetected}
          onApplyEditorBpm={handleApplyEditorBpm}
          onApplyReconvertBpm={onApplyReconvertBpm}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-sm">
        {hasNotes && (
          <SegmentedControl
            aria-label="Result view mode"
            value={mode}
            onChange={setMode}
            testId="midi-result-mode"
            options={[
              { value: "view", label: "View", testId: "midi-result-mode-view" },
              { value: "edit", label: "Edit", testId: "midi-result-mode-edit" },
            ]}
          />
        )}
      </div>

      {isEmpty ? (
        <MidiEmptyTranscriptionBanner
          onAdjustSettings={onAdjustSettings}
          onRetry={onRetry}
        />
      ) : null}

      <AnimatePresence mode="wait" initial={false}>
        {mode === "view" ? (
          <motion.div
            key="view-mode"
            initial={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
          >
            <div className={prefersReducedMotion ? "" : "midi-piano-roll-reveal"}>
              <MidiPianoRoll
                notes={result.pianoRollNotes}
                currentTime={isPlaying ? currentTime : null}
                bpm={suggestedBpm}
                loopRegion={loopRegion}
                onSeek={(time) => seek(time)}
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="edit-mode"
            initial={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
          >
            <MidiNoteEditor
              initialNotes={result.pianoRollNotes}
              bpm={suggestedBpm}
              jobId={jobId}
              jobToken={jobToken}
              sourceLabel={sourceLabel ?? jobId ?? undefined}
              estimatedKey={result.analysis?.estimated_key}
              isDrumContent={isDrumContent}
              onRegisterEditor={handleRegisterEditor}
              e2eMode={e2eMode}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {result.analysis && mode === "view" && hasNotes ? (
        <MidiAnalysisPanel
          analysis={result.analysis}
          fileAnalysis={result.fileAnalysis}
        />
      ) : null}

      {result.analysis && mode === "edit" && hasNotes ? (
        <MidiLaneDrawer
          title="More analysis"
          subtitle="Genre hints, track list, pitch range"
          open={analysisExpanded}
          onToggle={() => setAnalysisExpanded((v) => !v)}
        >
          <MidiAnalysisPanel
            analysis={result.analysis}
            fileAnalysis={result.fileAnalysis}
          />
        </MidiLaneDrawer>
      ) : null}

      <motion.div
        className="flex flex-wrap gap-md text-xs text-muted-foreground tabular-nums"
        initial={prefersReducedMotion ? undefined : "hidden"}
        animate={prefersReducedMotion ? undefined : "visible"}
        variants={
          prefersReducedMotion
            ? undefined
            : {
                hidden: {},
                visible: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } },
              }
        }
      >
        <motion.span variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}>
          <span className={`font-medium ${isEmpty ? "text-amber-300" : "text-accent-midi-200"}`}>
            {result.notesDetected}
          </span>{" "}
          notes detected
        </motion.span>
        <motion.span variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}>
          <span className="font-medium text-accent-midi-200">
            {formatDuration(result.durationSeconds)}
          </span>{" "}
          duration
        </motion.span>
        <motion.span variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}>
          <span className="font-medium text-accent-midi-200">
            {result.tracks}
          </span>{" "}
          {result.tracks === 1 ? "track" : "tracks"}
        </motion.span>
        <motion.span variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}>
          <span className="font-medium text-accent-midi-200">
            {result.inferenceTimeSeconds.toFixed(1)}s
          </span>{" "}
          processing time
        </motion.span>
      </motion.div>

      {hasNotes && mode === "view" ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 px-sm py-xs text-xs text-muted-foreground">
          <p className="font-medium text-secondary-foreground">Import to your DAW</p>
          <p className="mt-1 leading-relaxed">
            Download the MIDI file, then drag it into Ableton, FL Studio, Logic, or any DAW track.
            Use Edit mode to fix timing before export.
          </p>
          {onOpenExportHistory ? (
            <button
              type="button"
              onClick={onOpenExportHistory}
              className="mt-2 text-accent-midi-300 underline-offset-2 hover:underline"
            >
              View export history
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-sm">
        {hasNotes && mode === "view" ? (
          <button
            type="button"
            onClick={() => setMode("edit")}
            className="midi-btn midi-btn--play"
            aria-label="Open in editor"
          >
            <Pencil className="h-4 w-4" aria-hidden />
            Open in editor
          </button>
        ) : null}
        {isSupported && hasNotes && mode === "view" && (
          <>
            <button
              type="button"
              onClick={() =>
                isPlaying
                  ? stop()
                  : play(result.pianoRollNotes, playbackOptions)
              }
              className="midi-btn midi-btn--play"
              aria-label={isPlaying ? "Stop playback" : "Play MIDI"}
            >
              {isPlaying ? (
                <>
                  <Square className="h-4 w-4" aria-hidden />
                  Stop
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" aria-hidden />
                  Play
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() =>
                setLoopRegion((prev) => ({ ...prev, enabled: !prev.enabled }))
              }
              className={`midi-btn text-xs ${loopRegion.enabled ? "midi-btn--play" : ""}`}
              aria-pressed={loopRegion.enabled ? "true" : "false"}
              aria-label={loopRegion.enabled ? "Disable loop playback" : "Enable loop playback"}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Loop
            </button>
          </>
        )}
        {hasNotes && mode === "view" && jobId ? (
          <MidiRenderAudioControl
            sourceJobId={jobId}
            bpm={suggestedBpm}
            className="min-w-[12rem]"
          />
        ) : null}
        {mode === "view" && isDownloading ? (
          <button
            type="button"
            disabled
            className="midi-btn midi-btn--play"
            aria-busy="true"
            aria-label="Downloading MIDI file"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Downloading…
          </button>
        ) : null}
        {mode === "view" && !isDownloading && hasNotes ? (
          <button
            type="button"
            onClick={onDownload}
            className="midi-btn midi-btn--play"
            aria-label="Download MIDI file"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download .mid
          </button>
        ) : null}
        <button type="button" onClick={onNewConversion} className="midi-btn">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          New conversion
        </button>
      </div>

      {downloadError ? (
        <p className="text-xs text-destructive-300" role="alert">
          {downloadError}
        </p>
      ) : null}
    </motion.div>
  );
}
