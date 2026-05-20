/**
 * MidiResultPanel — shows conversion results: piano roll, stats, download button.
 */
import { Download, RotateCcw, Music } from "lucide-react";
import type { MidiConvertResult } from "../../hooks/useMidiConvert";
import { MidiPianoRoll } from "./MidiPianoRoll";

interface MidiResultPanelProps {
  result: MidiConvertResult;
  onDownload: () => void;
  onNewConversion: () => void;
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
}: MidiResultPanelProps) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-violet-400/20 bg-violet-500/5 px-4 py-4">
      <div className="flex items-center gap-2">
        <Music className="h-4 w-4 text-violet-300" aria-hidden />
        <h3 className="text-sm font-semibold text-white">Conversion Complete</h3>
      </div>

      {/* Piano roll visualization */}
      <MidiPianoRoll notes={result.pianoRollNotes} />

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
        <button
          type="button"
          onClick={onDownload}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-violet-300/50 bg-gradient-to-r from-violet-600/90 to-purple-600/90 px-5 py-2 text-sm font-bold text-white shadow-[0_0_20px_rgba(139,92,246,0.2)] transition hover:from-violet-500 hover:to-purple-500"
        >
          <Download className="h-4 w-4" aria-hidden />
          Download .mid
        </button>
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
