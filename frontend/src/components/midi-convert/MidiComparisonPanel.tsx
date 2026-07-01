/**
 * MidiComparisonPanel — side-by-side source audio vs converted MIDI preview.
 */
import { Play, Square } from "lucide-react";
import { useCallback, useState } from "react";
import type { MidiNoteEvent } from "../../hooks/useMidiConvert";
import type { MidiSourceMode } from "../../hooks/useMidiConvert";
import { useMidiPlayback } from "../../hooks/useMidiPlayback";
import { MidiSourcePreview } from "./MidiSourcePreview";
import { MidiPianoRoll } from "./MidiPianoRoll";
import { DEFAULT_LOOP, type LoopRegion } from "./editorTypes";
import "./midi-tokens.css";

export interface MidiComparisonSource {
  sourceMode: MidiSourceMode;
  uploadedFile: File | null;
  splitStemUrl: string | null;
  loadedStemUrl: string | null;
  loadedStemLabel?: string;
  midiJobId?: string | null;
}

interface MidiComparisonPanelProps {
  notes: MidiNoteEvent[];
  bpm: number;
  source: MidiComparisonSource;
}

export function MidiComparisonPanel({
  notes,
  bpm,
  source,
}: MidiComparisonPanelProps) {
  const { isPlaying, currentTime, play, stop, seek, isSupported } = useMidiPlayback();
  const [loopRegion] = useState<LoopRegion>(DEFAULT_LOOP);

  const playbackOptions = {
    bpm,
    loopRegion: loopRegion.enabled ? loopRegion : undefined,
  };

  const handlePlayMidi = useCallback(() => {
    if (isPlaying) {
      stop();
      return;
    }
    play(notes, playbackOptions);
  }, [isPlaying, notes, playbackOptions, play, stop]);

  const handleSeekMidi = useCallback(
    (time: number) => {
      seek(time);
    },
    [seek],
  );

  return (
    <section
      className="midi-comparison-panel rounded-lg border border-border/60 bg-muted/10 p-sm"
      data-testid="midi-comparison-panel"
      aria-label="Source audio and MIDI comparison"
    >
      <div className="mb-sm flex flex-wrap items-center justify-between gap-sm">
        <div>
          <p className="text-xs font-semibold text-secondary-foreground">
            Compare source and MIDI
          </p>
          <p className="text-[10px] text-muted-foreground">
            Review the transcription against your source audio, then open the editor to fix timing.
          </p>
        </div>
        {isSupported && notes.length > 0 ? (
          <button
            type="button"
            onClick={handlePlayMidi}
            className="midi-btn midi-btn--play text-xs"
            aria-label={isPlaying ? "Stop MIDI preview" : "Play MIDI preview"}
          >
            {isPlaying ? (
              <>
                <Square className="h-3.5 w-3.5" aria-hidden />
                Stop MIDI
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" aria-hidden />
                Play MIDI
              </>
            )}
          </button>
        ) : null}
      </div>

      <div className="midi-comparison-grid grid gap-sm lg:grid-cols-2">
        <div className="min-w-0 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Original audio
          </p>
          <MidiSourcePreview
            sourceMode={source.sourceMode}
            uploadedFile={source.uploadedFile}
            splitStemUrl={source.splitStemUrl}
            loadedStemUrl={source.loadedStemUrl}
            loadedStemLabel={source.loadedStemLabel}
            midiJobId={source.midiJobId}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Converted MIDI
          </p>
          <MidiPianoRoll
            notes={notes}
            currentTime={isPlaying ? currentTime : null}
            bpm={bpm}
            loopRegion={loopRegion}
            onSeek={handleSeekMidi}
          />
        </div>
      </div>
    </section>
  );
}
