/**
 * MidiSourceSelector — pick split stems, loaded editor stems, or upload a file.
 */
import { FolderOpen, Music, Upload } from "lucide-react";
import { cn } from "../../utils/cn";
import { MIDI_AUDIO_INPUT_ACCEPT } from "../../config";
import type { MidiSourceMode } from "../../hooks/useMidiConvert";
import "./midi-tokens.css";

interface StemEntry {
  id: string;
  url: string;
}

interface LoadedStemEntry {
  id: string;
  label: string;
}

interface MidiSourceSelectorProps {
  sourceMode: MidiSourceMode;
  onSourceModeChange: (mode: MidiSourceMode) => void;
  selectedStem: string | null;
  onSelectStem: (stem: string) => void;
  splitResultStems: StemEntry[];
  loadedStems: LoadedStemEntry[];
  selectedLoadedStemId: string | null;
  onSelectLoadedStem: (id: string) => void;
  uploadedFile: File | null;
  uploadName: string;
  onBrowse: () => void;
  onDrop: (file: File | null) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  isDragging: boolean;
  onSetIsDragging: (v: boolean) => void;
  disabled?: boolean;
}

export function MidiSourceSelector({
  sourceMode,
  onSourceModeChange,
  selectedStem,
  onSelectStem,
  splitResultStems,
  loadedStems,
  selectedLoadedStemId,
  onSelectLoadedStem,
  uploadedFile,
  uploadName,
  onBrowse,
  onDrop,
  inputRef,
  isDragging,
  onSetIsDragging,
  disabled = false,
}: MidiSourceSelectorProps) {
  const hasSplitStems = splitResultStems.length > 0;
  const hasLoadedStems = loadedStems.length > 0;

  const dragProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) onSetIsDragging(true);
    },
    onDragLeave: () => onSetIsDragging(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      onSetIsDragging(false);
      if (!disabled) onDrop(e.dataTransfer.files?.[0] ?? null);
    },
  };

  return (
    <div className="flex flex-col gap-sm">
      <p className="text-xs text-accent-midi-100/50 leading-relaxed">
        <span className="font-medium text-accent-midi-200/80">From recent split</span> uses stems from your last split in Burnt Beats.
        {" "}
        <span className="font-medium text-accent-midi-200/80">From loaded stems</span> uses files you loaded in the stem editor.
        {" "}
        <span className="font-medium text-accent-midi-200/80">Upload file</span> is for any local audio.
      </p>

      <div className="flex flex-wrap items-center gap-xs px-sm pt-sm">
        <button
          type="button"
          onClick={() => onSourceModeChange("split")}
          disabled={disabled || !hasSplitStems}
          className={cn(
            "midi-btn midi-btn--tool text-xs",
            sourceMode === "split" && "midi-btn--tool-active",
            (disabled || !hasSplitStems) && "opacity-40 cursor-not-allowed",
          )}
          aria-pressed={sourceMode === "split"}
        >
          <Music className="h-3.5 w-3.5" aria-hidden />
          From recent split
        </button>
        <button
          type="button"
          onClick={() => onSourceModeChange("loaded")}
          disabled={disabled || !hasLoadedStems}
          className={cn(
            "midi-btn midi-btn--tool text-xs",
            sourceMode === "loaded" && "midi-btn--tool-active",
            (disabled || !hasLoadedStems) && "opacity-40 cursor-not-allowed",
          )}
          aria-pressed={sourceMode === "loaded"}
        >
          <FolderOpen className="h-3.5 w-3.5" aria-hidden />
          From loaded stems
        </button>
        <button
          type="button"
          onClick={() => onSourceModeChange("upload")}
          disabled={disabled}
          className={cn(
            "midi-btn midi-btn--tool text-xs",
            sourceMode === "upload" && "midi-btn--tool-active",
            disabled && "opacity-40 cursor-not-allowed",
          )}
          aria-pressed={sourceMode === "upload"}
        >
          <Upload className="h-3.5 w-3.5" aria-hidden />
          Upload file
        </button>
      </div>

      {sourceMode === "split" && (
        <div className="flex flex-wrap gap-xs px-sm">
          {hasSplitStems ? (
            splitResultStems.map((stem) => (
              <button
                key={stem.id}
                type="button"
                onClick={() => onSelectStem(stem.id)}
                disabled={disabled}
                className={cn(
                  "midi-btn midi-btn--tool text-xs capitalize",
                  selectedStem === stem.id && "midi-btn--tool-active",
                  disabled && "opacity-40 cursor-not-allowed",
                )}
                aria-pressed={selectedStem === stem.id}
              >
                {stem.id}
              </button>
            ))
          ) : (
            <p className="text-sm text-muted-foreground px-sm">
              No split stems yet. Split a track in the stem editor, or use Upload file.
            </p>
          )}
        </div>
      )}

      {sourceMode === "loaded" && (
        <div className="flex flex-wrap gap-xs px-sm">
          {hasLoadedStems ? (
            loadedStems.map((stem) => (
              <button
                key={stem.id}
                type="button"
                onClick={() => onSelectLoadedStem(stem.id)}
                disabled={disabled}
                className={cn(
                  "midi-btn midi-btn--tool text-xs max-w-[200px] truncate",
                  selectedLoadedStemId === stem.id && "midi-btn--tool-active",
                  disabled && "opacity-40 cursor-not-allowed",
                )}
                title={stem.label}
                aria-pressed={selectedLoadedStemId === stem.id}
              >
                {stem.label}
              </button>
            ))
          ) : (
            <p className="text-sm text-muted-foreground px-sm">
              Load stem files in the stem editor first (Load stems), then return here.
            </p>
          )}
        </div>
      )}

      {sourceMode === "upload" && (
        <div className="px-sm">
          <input
            ref={inputRef}
            type="file"
            accept={MIDI_AUDIO_INPUT_ACCEPT}
            aria-label="Upload audio file for MIDI conversion"
            className="sr-only"
            onChange={(e) => {
              onDrop(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          {uploadedFile ? (
            <div
              className="midi-param-slider"
              {...dragProps}
            >
              <div className="flex items-center gap-sm">
                <Music className="h-4 w-4 text-accent-midi-300" aria-hidden />
                <span className="midi-param-slider__value flex-1 truncate">{uploadName}</span>
                <button
                  type="button"
                  onClick={() => onDrop(null)}
                  disabled={disabled}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              data-testid="midi-upload-dropzone"
              onClick={onBrowse}
              disabled={disabled}
              {...dragProps}
              className={cn(
                "w-full midi-param-slider text-center transition cursor-pointer",
                isDragging && "scale-[1.01] !border-accent-midi/50",
                disabled && "opacity-40 cursor-not-allowed",
              )}
            >
              <Upload className="mx-auto mb-xs h-6 w-6 text-accent-midi-300/50" aria-hidden />
              <span className="midi-param-slider__label">Drop audio file here or click to browse</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
