/**
 * MidiSourcePreview — play source audio and show waveform before MIDI conversion.
 */
import { useCallback, useEffect, useRef, useState, type Ref } from "react";
import { Loader2, Volume2 } from "lucide-react";
import { fetchStemWavAsBlob } from "../../api/stems";
import { fetchMidiSourceAudioBlob } from "../../api/midiSource";
import { authHeaders, jobTokenHeader } from "../../api/auth";
import { API_BASE } from "../../config";
import type { MidiSourceMode } from "../../hooks/useMidiConvert";
import { useAudioFileDuration } from "../../hooks/useAudioFileDuration";
import { formatUploadMeta } from "../../utils/formatFileMeta";
import {
  MidiWaveformPlayer,
  type MidiWaveformPlayerHandle,
} from "./controls/MidiWaveformPlayer";

interface MidiSourcePreviewProps {
  sourceMode: MidiSourceMode;
  uploadedFile: File | null;
  splitStemUrl: string | null;
  loadedStemUrl: string | null;
  loadedStemLabel?: string;
  /** MIDI convert job id — enables server waveform when available. */
  midiJobId?: string | null;
  midiJobToken?: string | null;
  disabled?: boolean;
  playerRef?: Ref<MidiWaveformPlayerHandle>;
  onAudioSeek?: (timeSeconds: number) => void;
  onPreviewUrlChange?: (url: string | null) => void;
  externalPlayhead?: number | null;
  externalIsPlaying?: boolean;
}

export function MidiSourcePreview({
  sourceMode,
  uploadedFile,
  splitStemUrl,
  loadedStemUrl,
  loadedStemLabel,
  midiJobId = null,
  midiJobToken = null,
  disabled = false,
  playerRef,
  onAudioSeek,
  onPreviewUrlChange,
  externalPlayhead = null,
  externalIsPlaying,
}: MidiSourcePreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [waveform, setWaveform] = useState<number[] | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const durationSec = useAudioFileDuration(
    sourceMode === "upload" ? uploadedFile : null,
  );

  const hasLocalSource =
    (sourceMode === "upload" && uploadedFile) ||
    (sourceMode === "split" && splitStemUrl) ||
    (sourceMode === "loaded" && loadedStemUrl);

  useEffect(() => {
    let revoke: string | null = null;
    let cancelled = false;

    const load = async () => {
      setLoadError(null);
      setPreviewUrl(null);

      if (sourceMode === "upload" && uploadedFile) {
        const url = URL.createObjectURL(uploadedFile);
        revoke = url;
        if (!cancelled) setPreviewUrl(url);
        return;
      }

      if (sourceMode === "loaded" && loadedStemUrl) {
        if (!cancelled) setPreviewUrl(loadedStemUrl);
        return;
      }

      if (sourceMode === "split" && splitStemUrl) {
        setLoading(true);
        try {
          const blob = await fetchStemWavAsBlob(splitStemUrl);
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          revoke = url;
          setPreviewUrl(url);
        } catch {
          if (!cancelled) setLoadError("Could not load stem preview.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (revoke && revoke !== loadedStemUrl) {
        URL.revokeObjectURL(revoke);
      }
    };
  }, [sourceMode, uploadedFile, splitStemUrl, loadedStemUrl]);

  useEffect(() => {
    onPreviewUrlChange?.(previewUrl);
  }, [previewUrl, onPreviewUrlChange]);

  // Job-only comparison: load stored input.* when no local upload/split preview exists.
  useEffect(() => {
    if (!midiJobId || previewUrl || hasLocalSource) return;

    let cancelled = false;
    let revoke: string | null = null;

    const loadFromJob = async () => {
      setLoadError(null);
      setLoading(true);
      try {
        const blob = await fetchMidiSourceAudioBlob(midiJobId, midiJobToken);
        if (cancelled) return;
        if (!blob) {
          setLoadError("Source audio is not available for this job yet.");
          return;
        }
        const url = URL.createObjectURL(blob);
        revoke = url;
        setPreviewUrl(url);
      } catch {
        if (!cancelled) setLoadError("Could not load job source audio.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadFromJob();

    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [midiJobId, midiJobToken, previewUrl, hasLocalSource]);

  const displayWaveform = midiJobId ? waveform : null;

  useEffect(() => {
    if (!midiJobId) return;
    let cancelled = false;
    const loadWaveform = async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch(
          `${API_BASE}/api/midi/waveform/${midiJobId}?points=256`,
          { headers: { ...headers, ...jobTokenHeader(midiJobId) } },
        );
        if (!res.ok) return;
        const json = (await res.json()) as { data?: number[] };
        if (!cancelled && Array.isArray(json.data)) {
          setWaveform(json.data);
        }
      } catch {
        if (!cancelled) setWaveform(null);
      }
    };
    void loadWaveform();
    return () => {
      cancelled = true;
    };
  }, [midiJobId]);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !displayWaveform?.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(19, 18, 16, 0.85)";
    ctx.fillRect(0, 0, w, h);
    const mid = h / 2;
    const step = w / displayWaveform.length;

    ctx.strokeStyle = "rgba(205, 165, 60, 0.85)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < displayWaveform.length; i++) {
      const amp = (displayWaveform[i] ?? 0) * mid * 0.9;
      const x = i * step;
      if (i === 0) ctx.moveTo(x, mid - amp);
      else ctx.lineTo(x, mid - amp);
    }
    for (let i = displayWaveform.length - 1; i >= 0; i--) {
      const amp = (displayWaveform[i] ?? 0) * mid * 0.9;
      ctx.lineTo(i * step, mid + amp);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(205, 165, 60, 0.18)";
    ctx.fill();
    ctx.stroke();
  }, [displayWaveform]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  const hasSource = hasLocalSource || Boolean(midiJobId);

  if (!hasSource) return null;

  const metaLine =
    sourceMode === "upload" && uploadedFile
      ? formatUploadMeta({ sizeBytes: uploadedFile.size, durationSec })
      : loadedStemLabel
        ? loadedStemLabel
        : null;

  return (
    <div
      data-testid="midi-source-preview"
      className="flex flex-col gap-xs rounded-xl border border-accent-midi/25 bg-accent-midi-950/20 px-md py-sm"
    >
      <div className="flex items-center gap-xs text-xs font-medium uppercase tracking-wide text-accent-midi-200/70">
        <Volume2 className="h-3.5 w-3.5" aria-hidden />
        Source preview
        {metaLine && (
          <span className="normal-case font-normal text-muted-foreground truncate">
            {metaLine}
          </span>
        )}
      </div>

      {displayWaveform && displayWaveform.length > 0 && (
        <canvas
          ref={canvasRef}
          width={512}
          height={56}
          className="w-full rounded-lg border border-border/50"
          role="img"
          aria-label="Source waveform"
        />
      )}

      {loading && (
        <div className="flex items-center gap-xs text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading audio…
        </div>
      )}

      {loadError && (
        <p className="text-sm text-destructive-300/90" role="alert">
          {loadError}
        </p>
      )}

      {previewUrl && !loading && !loadError && (
        <MidiWaveformPlayer
          ref={playerRef}
          src={previewUrl}
          disabled={disabled}
          onSeek={onAudioSeek}
          externalPlayhead={externalPlayhead}
          externalIsPlaying={externalIsPlaying}
        />
      )}
    </div>
  );
}
