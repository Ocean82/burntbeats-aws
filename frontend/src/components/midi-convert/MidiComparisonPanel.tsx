/**
 * MidiComparisonPanel — side-by-side source audio vs converted MIDI preview.
 */
import * as Tone from "tone";
import { Play, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MidiNoteEvent } from "../../hooks/useMidiConvert";
import type { MidiSourceMode } from "../../hooks/useMidiConvert";
import { useMidiPlayback } from "../../hooks/useMidiPlayback";
import { MidiSourcePreview } from "./MidiSourcePreview";
import { MidiPianoRoll } from "./MidiPianoRoll";
import { DEFAULT_LOOP, type LoopRegion } from "./editorTypes";
import type { MidiWaveformPlayerHandle } from "./controls/MidiWaveformPlayer";
import "./midi-tokens.css";

export interface MidiComparisonSource {
  sourceMode: MidiSourceMode;
  uploadedFile: File | null;
  splitStemUrl: string | null;
  loadedStemUrl: string | null;
  loadedStemLabel?: string;
  midiJobId?: string | null;
  midiJobToken?: string | null;
}

type ComparisonPlayMode = "idle" | "midi" | "both";

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
  const audioRef = useRef<MidiWaveformPlayerHandle | null>(null);
  const syncedPlayerRef = useRef<Tone.Player | null>(null);
  const { isPlaying, currentTime, play, pause, stop, seek, isSupported } = useMidiPlayback();
  const [loopRegion] = useState<LoopRegion>(DEFAULT_LOOP);
  const [playMode, setPlayMode] = useState<ComparisonPlayMode>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [syncedPlayerReady, setSyncedPlayerReady] = useState(false);

  const playbackOptions = useMemo(
    () => ({
      bpm,
      loopRegion: loopRegion.enabled ? loopRegion : undefined,
    }),
    [bpm, loopRegion],
  );

  const clipOffset = notes.length
    ? Math.min(...notes.map((n) => n.start))
    : 0;

  useEffect(() => {
    if (!previewUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting derived state on prop change
      setSyncedPlayerReady(false);
      return;
    }

    const player = new Tone.Player().toDestination();
    syncedPlayerRef.current = player;
    let cancelled = false;

    void player.load(previewUrl).then(() => {
      if (!cancelled) setSyncedPlayerReady(true);
    });

    return () => {
      cancelled = true;
      player.stop();
      player.unsync();
      player.dispose();
      if (syncedPlayerRef.current === player) {
        syncedPlayerRef.current = null;
      }
      setSyncedPlayerReady(false);
    };
  }, [previewUrl]);

  const seekBoth = useCallback(
    (absoluteTime: number) => {
      const audioTime = Math.max(0, absoluteTime - clipOffset);
      if (playMode === "both" && isPlaying) {
        pause();
        setPlayMode("idle");
      }
      audioRef.current?.seek(audioTime);
      seek(absoluteTime);
    },
    [clipOffset, seek, playMode, isPlaying, pause],
  );

  const stopAll = useCallback(() => {
    stop();
    audioRef.current?.pause();
    setPlayMode("idle");
  }, [stop]);

  const handlePlayMidi = useCallback(async () => {
    if (isPlaying && playMode === "midi") {
      stopAll();
      return;
    }
    stopAll();
    setPlayMode("midi");
    await Tone.start();
    play(notes, playbackOptions);
  }, [isPlaying, playMode, stopAll, play, notes, playbackOptions]);

  const handlePlayBoth = useCallback(async () => {
    if (isPlaying && playMode === "both") {
      stopAll();
      return;
    }
    if (!syncedPlayerReady || !syncedPlayerRef.current?.loaded) return;

    stopAll();
    setPlayMode("both");
    await Tone.start();
    audioRef.current?.seek(0);
    play(notes, {
      ...playbackOptions,
      syncedPlayer: syncedPlayerRef.current,
    });
  }, [isPlaying, playMode, stopAll, play, notes, playbackOptions, syncedPlayerReady]);

  useEffect(() => () => stopAll(), [stopAll]);

  const audioPlayhead =
    playMode === "both" && isPlaying ? currentTime : null;
  const audioIsPlaying = playMode === "both" && isPlaying;

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
            Scrub either side to audition together. Play both uses a shared transport clock.
          </p>
        </div>
        {isSupported && notes.length > 0 ? (
          <div className="flex flex-wrap gap-xs">
            <button
              type="button"
              onClick={() => void handlePlayMidi()}
              className={`midi-btn text-xs ${playMode === "midi" && isPlaying ? "midi-btn--play" : ""}`}
              aria-label={playMode === "midi" && isPlaying ? "Stop MIDI" : "Play MIDI"}
            >
              {playMode === "midi" && isPlaying ? (
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
            <button
              type="button"
              onClick={() => void handlePlayBoth()}
              disabled={!syncedPlayerReady}
              className={`midi-btn text-xs ${playMode === "both" && isPlaying ? "midi-btn--play" : ""}`}
              data-testid="midi-comparison-play-both"
              aria-label={playMode === "both" && isPlaying ? "Stop both" : "Play both"}
              title={
                syncedPlayerReady
                  ? "Play source audio and MIDI on the same clock"
                  : "Loading source audio for synced playback…"
              }
            >
              {playMode === "both" && isPlaying ? (
                <>
                  <Square className="h-3.5 w-3.5" aria-hidden />
                  Stop both
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" aria-hidden />
                  Play both
                </>
              )}
            </button>
          </div>
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
            midiJobToken={source.midiJobToken}
            playerRef={audioRef}
            onPreviewUrlChange={setPreviewUrl}
            onAudioSeek={(time) => seekBoth(time + clipOffset)}
            externalPlayhead={audioPlayhead}
            externalIsPlaying={audioIsPlaying}
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
            onSeek={seekBoth}
          />
        </div>
      </div>
    </section>
  );
}
