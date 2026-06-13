/**
 * MidiResultPanel — shows conversion results: piano roll, stats, download button.
 * Includes View/Edit toggle for the interactive MIDI note editor.
 *
 * Phase 2.3: Entrance celebration — border glow pulse, stats stagger, piano roll reveal.
 */
import {
  Download,
  Loader2,
  RotateCcw,
  Music,
  Play,
  Square,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { MidiConvertResult } from "../../hooks/useMidiConvert";
import { useMidiPlayback } from "../../hooks/useMidiPlayback";
import { SegmentedControl } from "../ui";
import { MidiAnalysisPanel } from "./MidiAnalysisPanel";
import { MidiNoteEditor } from "./MidiNoteEditor";
import { MidiPianoRoll } from "./MidiPianoRoll";
import "./midi-tokens.css";

interface MidiResultPanelProps {
  result: MidiConvertResult;
  onDownload: () => void;
  isDownloading?: boolean;
  onNewConversion: () => void;
  onApplySuggestedBpm?: (bpm: number) => void;
  jobId?: string | null;
  jobToken?: string | null;
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
  onNewConversion,
  onApplySuggestedBpm,
  jobId = null,
  jobToken = null,
  initialMode = "view",
  e2eMode = false,
}: MidiResultPanelProps) {
  const { isPlaying, currentTime, play, stop, isSupported } = useMidiPlayback();
  const [mode, setMode] = useState<"view" | "edit">(initialMode);
  const prefersReducedMotion = useReducedMotion();

  // One-time border glow — CSS class added on mount, removed after animation completes
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [showGlow, setShowGlow] = useState(true);
  useEffect(() => {
    if (prefersReducedMotion) {
      setShowGlow(false);
      return;
    }
    const timer = setTimeout(() => setShowGlow(false), 1500);
    return () => clearTimeout(timer);
  }, [prefersReducedMotion]);

  const suggestedBpm = result.analysis?.suggested_bpm ?? 120;

  // Keyboard shortcuts: V for view, E for edit (only when not typing in an input)
  useEffect(() => {
    if (!result.pianoRollNotes.length) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (e.key === "v" || e.key === "V") setMode("view");
      if (e.key === "e" || e.key === "E") setMode("edit");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [result.pianoRollNotes.length]);

  // Reduced-motion: skip Framer Motion entrance entirely
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
            Conversion complete
          </h3>
        </div>

        {result.pianoRollNotes.length > 0 && (
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

      {/* Piano roll visualization OR interactive editor — animated mode switch */}
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
              e2eMode={e2eMode}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {result.analysis && mode === "view" && (
        <MidiAnalysisPanel
          analysis={result.analysis}
          fileAnalysis={result.fileAnalysis}
          onApplySuggestedBpm={onApplySuggestedBpm}
        />
      )}

      {/* Stats row */}
      <motion.div
        className="flex flex-wrap gap-md text-xs text-muted-foreground"
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
          <span className="font-medium text-accent-midi-200">
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

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-sm">
        {isSupported && result.pianoRollNotes.length > 0 && mode === "view" && (
          <button
            type="button"
            onClick={() => (isPlaying ? stop() : play(result.pianoRollNotes))}
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
        )}
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
        {mode === "view" && !isDownloading ? (
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
    </motion.div>
  );
}
