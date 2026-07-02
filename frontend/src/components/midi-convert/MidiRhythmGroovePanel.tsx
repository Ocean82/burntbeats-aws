/**
 * Live rhythm groove generator — styles from /api/midi/rhythm, insert or preview.
 */
import { Loader2, Music2, Plus, Download } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  fetchRhythmStylesResilient,
  generateRhythmGroove,
  type RhythmGrooveSource,
  type RhythmStylesSource,
} from "../../api/midiRhythm";
import type { EditableNote } from "./editorTypes";
import { playMidiPreviewNotes, stopMidiPreview } from "../../audio/audioEngine";

export type GrooveInsertMode = "new-track" | "active-track";

export interface MidiRhythmGroovePanelProps {
  bpm?: number;
  /** Insert generated notes into the piano-roll editor. */
  onInsertNotes?: (
    notes: EditableNote[],
    styleLabel: string,
    mode: GrooveInsertMode,
  ) => void;
  /** When true, show preview/download actions instead of insert-only. */
  showCatalogActions?: boolean;
  className?: string;
}

export function MidiRhythmGroovePanel({
  bpm = 120,
  onInsertNotes,
  showCatalogActions = false,
  className = "",
}: MidiRhythmGroovePanelProps) {
  const [styles, setStyles] = useState<
    Awaited<ReturnType<typeof fetchRhythmStylesResilient>>["styles"]
  >([]);
  const [stylesLoading, setStylesLoading] = useState(true);
  const [stylesSource, setStylesSource] = useState<RhythmStylesSource>("online");
  const [stylesError, setStylesError] = useState<string | null>(null);
  const [styleId, setStyleId] = useState("");
  const [bars, setBars] = useState(4);
  const [energy, setEnergy] = useState(0.7);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [grooveSource, setGrooveSource] = useState<RhythmGrooveSource | null>(null);
  const [insertMode, setInsertMode] = useState<GrooveInsertMode>("new-track");

  const loadStyles = useCallback(async () => {
    setStylesLoading(true);
    setStylesError(null);
    try {
      const result = await fetchRhythmStylesResilient();
      setStyles(result.styles);
      setStyleId(result.styles[0]?.id ?? "");
      setStylesSource(result.source);
    } catch (error) {
      setStylesError(
        error instanceof Error ? error.message : "Could not load rhythm styles",
      );
    } finally {
      setStylesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStyles(); // eslint-disable-line react-hooks/set-state-in-effect -- async data fetch on mount
  }, [loadStyles]);

  useEffect(() => () => stopMidiPreview(), []);

  const selectedStyle = styles.find((s) => s.id === styleId) ?? styles[0];

  const generateGroove = useCallback(async () => {
    if (!selectedStyle) throw new Error("Select a groove style");
    setBusy(true);
    setActionError(null);
    try {
      const result = await generateRhythmGroove({
        style: selectedStyle.id,
        bars,
        tempo: bpm,
        energy,
      });
      setGrooveSource(result.source);
      if (!result.notes.length) throw new Error("Generated groove has no notes");
      return result;
    } finally {
      setBusy(false);
    }
  }, [selectedStyle, bars, bpm, energy]);

  const handleInsert = useCallback(async () => {
    if (!onInsertNotes) return;
    try {
      const { notes } = await generateGroove();
      onInsertNotes(notes, selectedStyle?.label ?? selectedStyle?.id ?? "Groove", insertMode);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Groove insert failed");
    }
  }, [generateGroove, onInsertNotes, selectedStyle, insertMode]);

  const handlePreview = useCallback(async () => {
    if (previewing) {
      stopMidiPreview();
      setPreviewing(false);
      return;
    }
    try {
      const { notes } = await generateGroove();
      setPreviewing(true);
      await playMidiPreviewNotes(notes, bpm, () => setPreviewing(false));
    } catch (error) {
      setPreviewing(false);
      setActionError(error instanceof Error ? error.message : "Preview failed");
    }
  }, [previewing, generateGroove, bpm]);

  const handleDownload = useCallback(async () => {
    try {
      const { notes, filename } = await generateGroove();
      const { exportNotesToMidi } = await import("../../utils/midiExport");
      const blob = exportNotesToMidi(notes, bpm, selectedStyle?.label ?? "Groove");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `${selectedStyle?.id ?? "groove"}.mid`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Download failed");
    }
  }, [generateGroove, selectedStyle, bpm]);

  if (stylesLoading) {
    return (
      <div className={`flex items-center gap-xs text-xs text-muted-foreground ${className}`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Loading groove styles…
      </div>
    );
  }

  if (stylesError && !styles.length) {
    return (
      <div className={`space-y-xs text-xs ${className}`}>
        <p className="text-destructive-300" role="alert">
          {stylesError}
        </p>
        <button type="button" className="midi-btn text-xs" onClick={() => void loadStyles()}>
          Retry rhythm service
        </button>
      </div>
    );
  }

  const sourceLabel =
    stylesSource === "offline" || grooveSource === "offline"
      ? "Offline groove engine"
      : stylesSource === "cached"
        ? "Cached styles (service unreachable)"
        : null;

  return (
    <div
      className={`space-y-sm rounded-lg border border-accent-midi/20 bg-accent-midi-950/15 p-sm ${className}`}
      data-testid="midi-rhythm-groove-panel"
    >
      <div className="flex items-center gap-xs text-xs font-semibold text-accent-midi-200">
        <Music2 className="h-3.5 w-3.5" aria-hidden />
        Generate groove
      </div>

      {sourceLabel ? (
        <p className="text-[10px] text-amber-200/90" data-testid="midi-rhythm-source-banner">
          {sourceLabel}. Grooves still work locally; reconnect for full style catalog.
        </p>
      ) : null}

      <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
        <span>Style</span>
        <select
          className="midi-select rounded border border-border/60 bg-muted/30 px-2 py-1 text-xs"
          value={styleId}
          onChange={(e) => setStyleId(e.target.value)}
          data-testid="midi-rhythm-style-select"
        >
          {styles.map((style) => (
            <option key={style.id} value={style.id}>
              {style.label}
            </option>
          ))}
        </select>
      </label>

      {selectedStyle?.description ? (
        <p className="text-[10px] text-muted-foreground">{selectedStyle.description}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-sm">
        <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
          <span>Bars</span>
          <input
            type="number"
            min={1}
            max={16}
            value={bars}
            onChange={(e) => setBars(Math.max(1, Math.min(16, Number(e.target.value) || 4)))}
            className="rounded border border-border/60 bg-muted/30 px-2 py-1 text-xs"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
          <span>Energy {Math.round(energy * 100)}%</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(energy * 100)}
            onChange={(e) => setEnergy(Number(e.target.value) / 100)}
            className="midi-control-bar__overflow-slider"
          />
        </label>
      </div>

      {onInsertNotes ? (
        <fieldset className="space-y-1 border-0 p-0">
          <legend className="text-[10px] text-muted-foreground">Insert target</legend>
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <input
              type="radio"
              name="groove-insert-mode"
              checked={insertMode === "new-track"}
              onChange={() => setInsertMode("new-track")}
              data-testid="midi-rhythm-insert-new-track"
            />
            New track
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <input
              type="radio"
              name="groove-insert-mode"
              checked={insertMode === "active-track"}
              onChange={() => setInsertMode("active-track")}
              data-testid="midi-rhythm-insert-active-track"
            />
            Active track (merge)
          </label>
        </fieldset>
      ) : null}

      <div className="flex flex-wrap gap-xs">
        {onInsertNotes ? (
          <button
            type="button"
            className="midi-btn text-xs"
            disabled={busy || !selectedStyle}
            onClick={() => void handleInsert()}
            data-testid="midi-rhythm-insert-groove"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Insert groove
          </button>
        ) : null}
        {showCatalogActions ? (
          <>
            <button
              type="button"
              className="midi-btn text-xs"
              disabled={busy}
              onClick={() => void handlePreview()}
              data-testid="midi-rhythm-preview-groove"
            >
              {previewing ? "Stop preview" : "Preview"}
            </button>
            <button
              type="button"
              className="midi-btn text-xs"
              disabled={busy}
              onClick={() => void handleDownload()}
              data-testid="midi-rhythm-download-groove"
            >
              <Download className="h-3.5 w-3.5" />
              Download MIDI
            </button>
          </>
        ) : null}
      </div>

      {actionError ? (
        <p className="text-[10px] text-destructive-300" role="alert">
          {actionError}
        </p>
      ) : null}
    </div>
  );
}
