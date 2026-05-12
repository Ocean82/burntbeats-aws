import { FolderOpen, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../../utils/cn";
import type { LoadedStem } from "./types";

export interface LoadStemsZoneProps {
  loadedStemCount: number;
  loadStemsInputRef: React.MutableRefObject<HTMLInputElement | null>;
  onLoadStems: (files: FileList | null) => void;
  loadedStems: LoadedStem[];
  onRemoveLoadedStem: (id: string) => void;
  isDragging: boolean;
  onSetIsDragging: (isDragging: boolean) => void;
  loadExpanded: boolean;
  onToggleLoadExpanded: () => void;
}

/** Load-mode drop zone + collapsible loaded stems list. */
export function LoadStemsZone({
  loadedStemCount,
  loadStemsInputRef,
  onLoadStems,
  loadedStems,
  onRemoveLoadedStem,
  isDragging,
  onSetIsDragging,
  loadExpanded,
  onToggleLoadExpanded,
}: LoadStemsZoneProps) {
  return (
    <>
      <div
        data-testid="load-upload-dropzone"
        role="button"
        tabIndex={0}
        aria-label="Load stem files — click or drop audio files here"
        onDragOver={(e) => {
          e.preventDefault();
          onSetIsDragging(true);
        }}
        onDragLeave={() => onSetIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          onSetIsDragging(false);
          onLoadStems(e.dataTransfer.files);
        }}
        onClick={() => loadStemsInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            loadStemsInputRef.current?.click();
          }
        }}
        className={cn(
          "flex min-w-0 basis-full cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-4 transition-all lg:basis-auto lg:flex-1",
          "border-white/20 bg-white/[0.03] hover:border-amber-400/40 hover:bg-white/[0.05] active:scale-[0.99]",
          isDragging && "scale-[1.02] border-amber-400/60 bg-white/[0.06]",
        )}
      >
        <FolderOpen
          className="h-5 w-5 shrink-0 text-white/60"
          strokeWidth={1.5}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white/80">
          {loadedStemCount > 0
            ? `${loadedStemCount} stem${loadedStemCount !== 1 ? "s" : ""} loaded`
            : isDragging
              ? "Drop it!"
              : "Click to load stems or drag & drop"}
        </span>
        <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              loadStemsInputRef.current?.click();
            }}
            className="min-h-[36px] min-w-[82px] whitespace-nowrap rounded-lg border border-white/10 px-3 py-1 text-xs font-semibold text-white/60 hover:border-white/30 hover:text-white"
          >
            Browse
          </button>
          {loadedStemCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleLoadExpanded();
              }}
              className="text-white/50 hover:text-white"
              aria-label="Toggle loaded stems list"
            >
              {loadExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Loaded stems list (collapsible) */}
      {loadExpanded && loadedStems.length > 0 && (
        <div className="mt-3 basis-full rounded-xl border border-white/10 bg-black/25 p-3">
          <ul className="space-y-1.5">
            {loadedStems.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm text-white">
                  {s.label.replace(/\.[^/.]+$/, "")}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveLoadedStem(s.id)}
                  className="shrink-0 text-xs text-red-300/80 hover:text-red-300"
                  aria-label={`Remove ${s.label}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
