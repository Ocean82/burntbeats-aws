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
    <div className="flex flex-col gap-md rounded-xl border border-accent-midi/25 bg-accent-midi/5 px-md py-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-xs">
          <Music className="h-4 w-4 text-accent-midi-300" aria-hidden />
          <h3 className="text-sm font-semibold text-foreground">Conversion Complete</h3>
        </div>

        {/* View / Edit toggle */}
        {result.pianoRollNotes.length > 0 && (
          <div className="flex items-center gap-2xs rounded-lg border border-border bg-muted p-2xs">
            <button
              type="button"
              onClick={() => setMode("view")}
              className={cn(
                "flex items-center gap-xs rounded-md px-sm py-1 text-xs font-medium transition",
                mode === "view"
                  ? "bg-accent-midi-500/25 text-accent-midi-100"
                  : "text-muted-foreground hover:text-secondary-foreground",
              )}
            >
              <Eye className="h-3 w-3" />
              View
            </button>
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={cn(
                "flex items-center gap-xs rounded-md px-sm py-1 text-xs font-medium transition",
                mode === "edit"
                  ? "bg-accent-midi-500/25 text-accent-midi-100"
                  : "text-muted-foreground hover:text-secondary-foreground",
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
      <div className="flex flex-wrap gap-md text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-accent-midi-200">{result.notesDetected}</span>{" "}
          notes detected
        </span>
        <span>
          <span className="font-medium text-accent-midi-200">
            {formatDuration(result.durationSeconds)}
          </span>{" "}
          duration
        </span>
        <span>
          <span className="font-medium text-accent-midi-200">{result.tracks}</span>{" "}
          {result.tracks === 1 ? "track" : "tracks"}
        </span>
        <span>
          <span className="font-medium text-accent-midi-200">
            {result.inferenceTimeSeconds.toFixed(1)}s
          </span>{" "}
          processing time
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-sm">
        {isSupported && result.pianoRollNotes.length > 0 && mode === "view" && (
          <button
            type="button"
            onClick={() => (isPlaying ? stop() : play(result.pianoRollNotes))}
            className="inline-flex min-h-[44px] items-center gap-xs rounded-xl border border-accent-midi-300/50 bg-gradient-to-r from-accent-midi-600/90 to-accent-midi-500/90 px-lg py-xs text-sm font-bold text-foreground shadow-elevation-md transition hover:from-accent-midi-500 hover:to-accent-midi-400"
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
            className="inline-flex min-h-[44px] items-center gap-xs rounded-xl border border-accent-midi-300/50 bg-gradient-to-r from-accent-midi-600/90 to-accent-midi-500/90 px-lg py-xs text-sm font-bold text-foreground shadow-elevation-md transition hover:from-accent-midi-500 hover:to-accent-midi-400"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download .mid
          </button>
        )}
        <button
          type="button"
          onClick={onNewConversion}
          className="inline-flex min-h-[44px] items-center gap-xs rounded-xl border border-border px-md py-xs text-sm text-secondary-foreground transition hover:border-border hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          New conversion
        </button>
      </div>
    </div>
  );
}
