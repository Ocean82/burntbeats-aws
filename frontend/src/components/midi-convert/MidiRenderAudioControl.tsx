/**
 * MidiRenderAudioControl — shared server-side MIDI-to-WAV render UI.
 */
import { Download, Loader2, Music, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MidiNoteEvent } from "../../hooks/useMidiConvert";
import { useMidiRender } from "../../hooks/useMidiRender";
import { fetchSoundfonts } from "../../api/midiSoundfonts";
import type { EditorTrack, TrackInstrument } from "./editorTypes";
import { createDefaultTrackMidiFx } from "./editorTypes";
import { MidiPhysicalButton } from "./controls/MidiPhysicalButton";
import {
  buildRenderRequest,
  INSTRUMENT_PROGRAM,
} from "../../utils/midiRenderRequest";

export interface MidiRenderAudioControlProps {
  notes?: MidiNoteEvent[];
  tracks?: EditorTrack[];
  bpm?: number;
  instrument?: TrackInstrument;
  sourceJobId?: string | null;
  preferLiveState?: boolean;
  format?: "wav" | "mp3";
  soundfont?: string;
  className?: string;
}

export function MidiRenderAudioControl({
  notes = [],
  tracks = [],
  bpm = 120,
  instrument = "piano",
  sourceJobId = null,
  preferLiveState = false,
  format = "wav",
  soundfont: soundfontProp,
  className = "",
}: MidiRenderAudioControlProps) {
  const { submit, status, busy, error, downloadUrl, reset } = useMidiRender();
  const [renderMode, setRenderMode] = useState<"live" | "saved" | null>(null);
  const [soundfont, setSoundfont] = useState(soundfontProp ?? "");
  const [soundfontOptions, setSoundfontOptions] = useState<string[]>([]);
  const [soundfontsLoading, setSoundfontsLoading] = useState(false);

  useEffect(() => {
    if (soundfontProp) setSoundfont(soundfontProp);
  }, [soundfontProp]);

  useEffect(() => {
    let cancelled = false;
    setSoundfontsLoading(true);
    fetchSoundfonts()
      .then((data) => {
        if (cancelled) return;
        const names = data.soundfonts.map((f) => f.name);
        setSoundfontOptions(names);
        setSoundfont((current) => {
          if (current) return current;
          if (data.default_available) return data.default;
          return names[0] ?? "";
        });
      })
      .catch(() => {
        if (!cancelled) setSoundfontOptions([]);
      })
      .finally(() => {
        if (!cancelled) setSoundfontsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const editorTracks: EditorTrack[] = useMemo(() => {
    if (tracks.length > 0) return tracks;
    if (notes.length === 0) return [];
    return [
      {
        id: "render-fallback",
        name: "Track 1",
        notes: notes.map((n) => ({
          ...n,
          id: `n_${n.pitch}_${n.start}`,
        })),
        selectedIds: new Set(),
        color: "#cd9d3c",
        muted: false,
        soloed: false,
        instrument,
        ccLanes: [],
        midiEffects: createDefaultTrackMidiFx(),
        midiFxApplyMode: "replace" as const,
        midiFxPreview: false,
      },
    ];
  }, [tracks, notes, instrument]);

  const handleRender = useCallback(() => {
    const request = buildRenderRequest({
      tracks: editorTracks,
      bpm,
      format,
      soundfont: soundfont || undefined,
      sourceJobId,
      preferLiveState,
    });
    setRenderMode(request.source_job_id ? "saved" : "live");
    void submit(request);
  }, [
    editorTracks,
    bpm,
    format,
    soundfont,
    sourceJobId,
    preferLiveState,
    submit,
  ]);

  const disabled =
    busy ||
    (!sourceJobId && editorTracks.every((t) => t.notes.length === 0));
  const progress = status ? Math.round(status.progress) : 0;
  const usesLiveNotes = preferLiveState || tracks.length > 1;

  return (
    <div className={`space-y-xs ${className}`} data-testid="midi-render-audio-control">
      {soundfontOptions.length > 1 ? (
        <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
          <span>Soundfont</span>
          <select
            className="midi-select rounded border border-border/60 bg-muted/30 px-2 py-1 text-xs text-secondary-foreground"
            value={soundfont}
            disabled={busy || soundfontsLoading}
            onChange={(e) => setSoundfont(e.target.value)}
            aria-label="Render soundfont"
          >
            {soundfontOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
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
        Editor playback uses lightweight synth voices for speed. Rendered audio uses
        FluidSynth with General MIDI soundfonts on the server (~30s).
        {usesLiveState
          ? " This render reflects your current piano-roll edits."
          : sourceJobId
            ? " Rendering the saved MIDI file for this job."
            : null}
        {renderMode === "live" && status?.status === "completed"
          ? " Studio render matches your latest edits."
          : null}
      </p>
      {status?.result?.soundfont ? (
        <p className="text-[10px] text-muted-foreground">
          Soundfont: {status.result.soundfont}
          {status.result.render_time_seconds
            ? ` · ${status.result.render_time_seconds.toFixed(1)}s`
            : null}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive-300" role="alert">
          {error.includes("SoundFont") || error.includes("soundfont")
            ? "Soundfont unavailable on server. Contact support or check deployment mounts."
            : error}
        </p>
      ) : null}
    </div>
  );
}

export { INSTRUMENT_PROGRAM };
