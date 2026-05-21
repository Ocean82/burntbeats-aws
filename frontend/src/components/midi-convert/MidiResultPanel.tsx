/**
 * MidiResultPanel — shows conversion results: piano roll, stats, download button.
 * Includes View/Edit toggle for the interactive MIDI note editor.
 */
import { Download, Edit3, Eye, RotateCcw, Music, Play, Square } from "lucide-react";
import { useState } from "react";
import type { MidiConvertResult } from "../../hooks/useMidiConvert";
import { useMidiPlayback } from "../../hooks/useMidiPlayback";
import { cn } from "../../utils/cn";
import { MidiAnalysisPanel } from "./MidiAnalysisPanel";
import { MidiNoteEditor } from "./MidiNoteEditor";
import { MidiPianoRoll } from "./MidiPianoRoll";

interface MidiResultPanelProps {
  result: MidiConvertResult;
  onDownload: () => void;
  onNewConversion: () => void;
  onApplySuggestedBpm?: (bpm: number) => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function MidiResultPanel({
  result,
  onDownload,
  onNewConversion,
  onApplySuggestedBpm,
}: MidiResultPanelProps) {
  const { isPlaying, currentTime, play, stop, isSupported } = useMidiPlayback();
  const [mode, setMode] = useState<"view" | "edit">("view");

  const suggestedBpm = result.analysis?.suggested_bpm ?? 120;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-violet-400/20 bg-violet-500/5 px-4 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music className="h-4 w-4 text-violet-300" aria-hidden />
          <h3 className="text-sm font-semibold text-white">Conversion Complete</h3>
        </div>

        {/* View / Edit toggle */}
        {result.pianoRollNotes.length > 0 && (
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-0.5">
            <button
              type="button"
              onClick={() => setMode("view")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition",
                mode === "view"
                  ? "bg-violet-500/25 text-violet-100"
                  : "text-white/50 hover:text-white/80",
              )}
            >
              <Eye className="h-3 w-3" />
              View
            </button>
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition",
                mode === "edit"
                  ? "bg-violet-500/25 text-violet-100"
                  : "text-white/50 hover:text-white/80",
              )}
            >
              <Edit3 className="h-3 w-3" />
              Edit
            </button>
          </div>
        )}
      </div>

      {/* Piano roll visualization OR interactive editor */}
      {mode === "view" ? (
        <MidiPianoRoll
          notes={result.pianoRollNotes}
          currentTime={isPlaying ? currentTime : null}
        />
      ) : (
        <MidiNoteEditor
          initialNotes={result.pianoRollNotes}
          bpm={suggestedBpm}
        />
      )}

      {result.analysis && mode === "view" && (
        <MidiAnalysisPanel
          analysis={result.analysis}
          onApplySuggestedBpm={onApplySuggestedBpm}
        />
      )}

      {/* Stats row */}
      <div className="flex flex-wrap gap-4 text-xs text-white/60">
        <span>
          <span className="font-medium text-violet-200">{result.notesDetected}</span>{" "}
          notes detected
        </span>
        <span>
          <span className="font-medium text-violet-200">
            {formatDuration(result.durationSeconds)}
          </span>{" "}
          duration
        </span>
        <span>
          <span className="font-medium text-violet-200">{result.tracks}</span>{" "}
          {result.tracks === 1 ? "track" : "tracks"}
        </span>
        <span>
          <span className="font-medium text-violet-200">
            {result.inferenceTimeSeconds.toFixed(1)}s
          </span>{" "}
          processing time
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3">
        {isSupported && result.pianoRollNotes.length > 0 && mode === "view" && (
          <button
            type="button"
            onClick={() => (isPlaying ? stop() : play(result.pianoRollNotes))}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-violet-300/50 bg-gradient-to-r from-violet-600/90 to-purple-600/90 px-5 py-2 text-sm font-bold text-white shadow-[0_0_20px_rgba(139,92,246,0.2)] transition hover:from-violet-500 hover:to-purple-500"
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
        {mode === "view" && (
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-violet-300/50 bg-gradient-to-r from-violet-600/90 to-purple-600/90 px-5 py-2 text-sm font-bold text-white shadow-[0_0_20px_rgba(139,92,246,0.2)] transition hover:from-violet-500 hover:to-purple-500"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download .mid
          </button>
        )}
        <button
          type="button"
          onClick={onNewConversion}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          New conversion
        </button>
      </div>
    </div>
  );
}
