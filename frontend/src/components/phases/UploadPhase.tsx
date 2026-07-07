import { useCallback, useRef, useState } from "react";
import { Upload, Music2 } from "lucide-react";
import { cn } from "@/utils/cn";
import { validateFile } from "@/utils/validateFile";
import { AUDIO_INPUT_ACCEPT, ALLOWED_AUDIO_FORMATS_LABEL } from "@/config";
import type { AppPhase } from "@/types/phases";

export interface UploadPhaseProps {
  transitionTo: (next: AppPhase) => void;
  setError: (msg: string | null) => void;
  error: string | null;
  onFileAccepted: (file: File) => void;
  firstRunMode?: boolean;
}

/**
 * Full-screen centered upload phase.
 * Accepts audio files via drag-and-drop or file picker, validates format/size,
 * then transitions to the configure phase on success.
 */
export function UploadPhase({
  transitionTo,
  setError,
  error,
  onFileAccepted,
  firstRunMode = false,
}: UploadPhaseProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      // Clear any previous error
      setError(null);

      // Extract extension from filename
      const dotIndex = file.name.lastIndexOf(".");
      const format = dotIndex !== -1 ? file.name.slice(dotIndex + 1) : "";

      const result = validateFile({ format, size: file.size });

      if (!result.valid) {
        setError(result.error);
        return;
      }

      onFileAccepted(file);
      transitionTo("configure");
    },
    [setError, onFileAccepted, transitionTo],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
      // Reset input so the same file can be re-selected
      e.target.value = "";
    },
    [handleFile],
  );

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div
      data-testid="upload-phase"
      className="flex h-full w-full items-center justify-center bg-[hsl(220,15%,8%)] p-6"
    >
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload audio file"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openFilePicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openFilePicker();
          }
        }}
        className={cn(
          "flex max-w-[32rem] cursor-pointer flex-col items-center gap-6 rounded-2xl border border-dashed px-12 py-16 text-center transition-all duration-200",
          isDragging
            ? "border-primary-400 bg-primary-500/10 shadow-[0_0_32px_rgba(255,172,92,0.15)]"
            : "border-muted-foreground/30 bg-muted/30 hover:border-primary-400/50 hover:bg-primary-500/5",
        )}
      >
        {/* Icon */}
        <div
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-full border transition-all duration-300",
            isDragging
              ? "border-primary-400/80 bg-primary-500/25 shadow-[0_0_32px_rgba(255,172,92,0.5)]"
              : "border-primary-400/40 bg-primary-500/10 shadow-[0_0_20px_rgba(255,140,80,0.2)]",
          )}
        >
          {isDragging ? (
            <Music2 className="h-8 w-8 text-primary-300" />
          ) : (
            <Upload className="h-8 w-8 text-primary-400" strokeWidth={1.5} />
          )}
        </div>

        {/* Text */}
        <div>
          <p className="text-lg font-bold text-foreground">
            {isDragging ? "Drop it!" : firstRunMode ? "Step 1 — drop your track" : "Drop your track here"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {firstRunMode
              ? "Upload a song you want to split. We'll use fast 2-stem mode for your first run."
              : (
                <>
            or{" "}
            <span className="text-primary-300 underline decoration-primary-400/40 underline-offset-2">
              click to browse
            </span>
            {" · " + ALLOWED_AUDIO_FORMATS_LABEL}
                </>
              )}
          </p>
          {firstRunMode ? (
            <p className="mt-1 text-xs text-muted-foreground/80">
              or{" "}
              <span className="text-primary-300 underline decoration-primary-400/40 underline-offset-2">
                click to browse
              </span>
              {" · " + ALLOWED_AUDIO_FORMATS_LABEL}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground/70">
            Max 500 MB
          </p>
        </div>

        {/* Error message */}
        {error && (
          <p
            role="alert"
            className="text-sm font-medium text-destructive"
          >
            {error}
          </p>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={AUDIO_INPUT_ACCEPT}
        onChange={handleInputChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}
