/**
 * MidiSourceSelector — lets users pick a stem from their last split or upload a new file.
 */
import { Music, Upload } from "lucide-react";
import { cn } from "../../utils/cn";
import { AUDIO_INPUT_ACCEPT } from "../../config";

interface StemEntry {
  id: string;
  url: string;
}

interface MidiSourceSelectorProps {
  sourceMode: "split" | "upload";
  onSourceModeChange: (mode: "split" | "upload") => void;
  selectedStem: string | null;
  onSelectStem: (stem: string) => void;
  splitResultStems: StemEntry[];
  uploadedFile: File | null;
  uploadName: string;
  onBrowse: () => void;
  onDrop: (file: File | null) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  disabled?: boolean;
}

export function MidiSourceSelector({
  sourceMode,
  onSourceModeChange,
  selectedStem,
  onSelectStem,
  splitResultStems,
  uploadedFile,
  uploadName,
  onBrowse,
  onDrop,
  inputRef,
  disabled = false,
}: MidiSourceSelectorProps) {
  const hasSplitStems = splitResultStems.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onSourceModeChange("split")}
          disabled={disabled || !hasSplitStems}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition",
            sourceMode === "split"
              ? "border-violet-400/50 bg-violet-500/15 text-violet-100"
              : "border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/20",
            (disabled || !hasSplitStems) && "opacity-40 cursor-not-allowed",
          )}
        >
          <Music className="h-3.5 w-3.5" aria-hidden />
          From recent split
        </button>
        <button
          type="button"
          onClick={() => onSourceModeChange("upload")}
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition",
            sourceMode === "upload"
              ? "border-violet-400/50 bg-violet-500/15 text-violet-100"
              : "border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/20",
            disabled && "opacity-40 cursor-not-allowed",
          )}
        >
          <Upload className="h-3.5 w-3.5" aria-hidden />
          Upload file
        </button>
      </div>

      {/* Split stem selection */}
      {sourceMode === "split" && (
        <div className="flex flex-wrap gap-2">
          {hasSplitStems ? (
            splitResultStems.map((stem) => (
              <button
                key={stem.id}
                type="button"
                onClick={() => onSelectStem(stem.id)}
                disabled={disabled}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition",
                  selectedStem === stem.id
                    ? "border-violet-400/60 bg-violet-500/25 text-violet-100"
                    : "border-white/15 bg-white/5 text-white/60 hover:text-white hover:border-white/25",
                  disabled && "opacity-40 cursor-not-allowed",
                )}
              >
                {stem.id}
              </button>
            ))
          ) : (
            <p className="text-sm text-white/40">
              No stems available. Split a track first, or upload a file directly.
            </p>
          )}
        </div>
      )}

      {/* Upload zone */}
      {sourceMode === "upload" && (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept={AUDIO_INPUT_ACCEPT}
            aria-label="Upload audio file for MIDI conversion"
            className="sr-only"
            onChange={(e) => {
              onDrop(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          {uploadedFile ? (
            <div className="flex items-center gap-3 rounded-xl border border-violet-400/20 bg-violet-500/5 px-4 py-3">
              <Music className="h-4 w-4 text-violet-300" aria-hidden />
              <span className="text-sm text-white/80 truncate">{uploadName}</span>
              <button
                type="button"
                onClick={() => onDrop(null)}
                disabled={disabled}
                className="ml-auto text-xs text-white/50 hover:text-white"
              >
                Remove
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onBrowse}
              disabled={disabled}
              className="w-full rounded-xl border-2 border-dashed border-violet-400/20 bg-violet-500/5 px-6 py-8 text-center text-sm text-white/50 transition hover:border-violet-400/40 hover:text-white/70"
            >
              <Upload className="mx-auto mb-2 h-6 w-6 text-violet-300/50" aria-hidden />
              Drop audio file here or click to browse
            </button>
          )}
        </div>
      )}
    </div>
  );
}
