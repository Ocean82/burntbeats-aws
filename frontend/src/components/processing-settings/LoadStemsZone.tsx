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
        aria-label="Load stem files dropzone — click or drop audio files here"
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
          "flex min-w-0 basis-full cursor-pointer items-center justify-between gap-sm rounded-xl border px-md py-md transition-all lg:basis-auto lg:flex-1",
          "border-border bg-muted/[0.03] hover:border-primary-400/40 hover:bg-muted/[0.05] active:scale-[0.99]",
          isDragging && "scale-[1.02] border-primary-400/60 bg-muted/[0.06]",
        )}
      >
        <FolderOpen
          className="h-5 w-5 shrink-0 text-muted-foreground"
          strokeWidth={1.5}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-secondary-foreground">
          {loadedStemCount > 0
            ? `${loadedStemCount} stem${loadedStemCount !== 1 ? "s" : ""} loaded`
            : isDragging
              ? "Drop it!"
              : "Click to load stems or drag & drop"}
        </span>
        <div className="ml-auto flex shrink-0 items-center justify-end gap-xs">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              loadStemsInputRef.current?.click();
            }}
            className="min-h-[36px] min-w-[82px] whitespace-nowrap rounded-lg border border-border px-sm py-1 text-xs font-semibold text-muted-foreground hover:border-border hover:text-foreground"
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
              className="text-muted-foreground hover:text-foreground"
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
        <div className="mt-sm basis-full rounded-xl border border-border bg-muted p-sm">
          <ul className="space-y-1.5">
            {loadedStems.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-xs rounded-lg bg-muted px-sm py-xs"
              >
                <span className="min-w-0 truncate text-sm text-foreground">
                  {s.label.replace(/\.[^/.]+$/, "")}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveLoadedStem(s.id)}
                  className="shrink-0 text-xs text-destructive-300/80 hover:text-destructive-300"
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
