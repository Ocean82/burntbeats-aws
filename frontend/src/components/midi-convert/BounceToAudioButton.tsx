/**
 * BounceToAudioButton — renders MIDI notes to audio via the server.
 * Shows progress, then offers download + inline playback on completion.
 */
import { useCallback, useRef } from "react";
import { Download, Loader2, Music, RotateCcw } from "lucide-react";
import type { MidiNoteEvent } from "../../hooks/useMidiConvert";
import { useMidiRender } from "../../hooks/useMidiRender";
import type { TrackInstrument } from "./editorTypes";

/** GM program number mapping for our instrument presets. */
const INSTRUMENT_PROGRAM: Record<TrackInstrument, number> = {
  piano: 0,
  synth: 80,
  bass: 33,
  strings: 48,
};

interface BounceToAudioButtonProps {
  notes: MidiNoteEvent[];
  bpm: number;
  instrument?: TrackInstrument;
  /** Completed source job ID (if rendering an existing conversion). */
  sourceJobId?: string | null;
  format?: "wav" | "mp3";
  className?: string;
}

export function BounceToAudioButton({
  notes,
  bpm,
  instrument = "piano",
  sourceJobId = null,
  format = "wav",
  className = "",
}: BounceToAudioButtonProps) {
  const { submit, status, busy, error, downloadUrl, reset } = useMidiRender();
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleBounce = useCallback(() => {
    const program = INSTRUMENT_PROGRAM[instrument] ?? 0;

    if (sourceJobId) {
      // Render from existing MIDI file on server
      submit({
        source_job_id: sourceJobId,
        format,
        instrument: program,
        normalize: true,
        master_gain: 0.9,
      });
    } else {
      // Render from raw notes
      submit({
        notes: notes.map((n) => ({
          pitch: n.pitch,
          start: n.start,
          duration: n.duration,
          velocity: n.velocity,
          channel: 0,
        })),
        bpm,
        format,
        instrument: program,
        normalize: true,
        master_gain: 0.9,
      });
    }
  }, [notes, bpm, instrument, sourceJobId, format, submit]);

  const disabled = busy || (!sourceJobId && notes.length === 0);
  const progress = status ? Math.round(status.progress) : 0;

  return (
    <div className={`flex items-center gap-sm ${className}`}>
      {!downloadUrl ? (
        <button
          type="button"
          onClick={handleBounce}
          disabled={disabled}
          className="btn btn-secondary flex items-center gap-xs text-sm"
          data-testid="bounce-to-audio-btn"
          aria-label="Bounce MIDI to audio file"
        >
          {busy ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden />
              <span>Bouncing {progress}%</span>
            </>
          ) : (
            <>
              <Music size={14} aria-hidden />
              <span>Bounce to {format.toUpperCase()}</span>
            </>
          )}
        </button>
      ) : (
        <>
          <a
            href={downloadUrl}
            download={`render.${format}`}
            className="btn btn-primary flex items-center gap-xs text-sm"
            data-testid="bounce-download-link"
          >
            <Download size={14} aria-hidden />
            <span>Download {format.toUpperCase()}</span>
          </a>
          <audio
            ref={audioRef}
            src={downloadUrl}
            controls
            className="h-8 max-w-48"
            data-testid="bounce-audio-preview"
          >
            <track kind="captions" />
          </audio>
          <button
            type="button"
            onClick={reset}
            className="btn btn-ghost p-xs"
            aria-label="Reset render"
            title="Render again"
          >
            <RotateCcw size={14} />
          </button>
        </>
      )}
      {error && (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
