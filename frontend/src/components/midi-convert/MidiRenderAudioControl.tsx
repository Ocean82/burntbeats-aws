/**
 * MidiRenderAudioControl — shared server-side MIDI-to-WAV render UI.
 */
import { Download, Loader2, Music, RotateCcw } from "lucide-react";
import { useCallback } from "react";
import type { MidiNoteEvent } from "../../hooks/useMidiConvert";
import { useMidiRender } from "../../hooks/useMidiRender";
import type { TrackInstrument } from "./editorTypes";
import { MidiPhysicalButton } from "./controls/MidiPhysicalButton";

const INSTRUMENT_PROGRAM: Record<TrackInstrument, number> = {
  piano: 0,
  synth: 80,
  bass: 33,
  strings: 48,
};

export interface MidiRenderAudioControlProps {
  notes?: MidiNoteEvent[];
  bpm?: number;
  instrument?: TrackInstrument;
  sourceJobId?: string | null;
  format?: "wav" | "mp3";
  className?: string;
}

export function MidiRenderAudioControl({
  notes = [],
  bpm = 120,
  instrument = "piano",
  sourceJobId = null,
  format = "wav",
  className = "",
}: MidiRenderAudioControlProps) {
  const { submit, status, busy, error, downloadUrl, reset } = useMidiRender();

  const handleRender = useCallback(() => {
    const program = INSTRUMENT_PROGRAM[instrument] ?? 0;

    if (sourceJobId) {
      void submit({
        source_job_id: sourceJobId,
        format,
        bpm,
        instrument: program,
        normalize: true,
        master_gain: 0.9,
      });
      return;
    }

    void submit({
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
  }, [notes, bpm, instrument, sourceJobId, format, submit]);

  const disabled = busy || (!sourceJobId && notes.length === 0);
  const progress = status ? Math.round(status.progress) : 0;

  return (
    <div className={`space-y-xs ${className}`} data-testid="midi-render-audio-control">
      {!downloadUrl ? (
        <MidiPhysicalButton
          variant="default"
          onClick={handleRender}
          disabled={disabled}
          className="w-full gap-1.5 text-sm"
          aria-label="Render preview WAV from MIDI"
          data-testid="midi-render-audio-btn"
        >
          {busy ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden />
              <span>Rendering… {progress}%</span>
            </>
          ) : (
            <>
              <Music size={14} aria-hidden />
              <span>Render preview ({format.toUpperCase()})</span>
            </>
          )}
        </MidiPhysicalButton>
      ) : (
        <div className="flex flex-wrap items-center gap-sm">
          <a
            href={downloadUrl}
            download={`render.${format}`}
            className="midi-btn midi-btn--play flex items-center gap-xs text-sm"
            data-testid="midi-render-download-link"
          >
            <Download size={14} aria-hidden />
            <span>Download {format.toUpperCase()}</span>
          </a>
          <audio
            src={downloadUrl}
            controls
            className="h-8 max-w-full flex-1 min-w-[8rem]"
            data-testid="midi-render-audio-preview"
          >
            <track kind="captions" />
          </audio>
          <MidiPhysicalButton
            variant="icon"
            onClick={reset}
            aria-label="Reset render"
            title="Render again"
          >
            <RotateCcw size={14} />
          </MidiPhysicalButton>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Synth playback is instant in the editor. Rendered audio uses FluidSynth on
        the server (~30s).
      </p>
      {error ? (
        <p className="text-xs text-destructive-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
