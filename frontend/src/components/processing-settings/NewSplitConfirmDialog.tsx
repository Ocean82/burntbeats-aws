import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

interface NewSplitConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal confirmation dialog shown when the user clicks "New Split".
 * Warns that current progress (stems, mix settings) will be lost.
 */
export function NewSplitConfirmDialog({
  open,
  onConfirm,
  onCancel,
}: NewSplitConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus the cancel button when the dialog opens (safe default)
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-split-confirm-title"
    >
      {/* Backdrop — clickable button to dismiss */}
      <button
        type="button"
        className="absolute inset-0 bg-secondary backdrop-blur-sm"
        onClick={onCancel}
        aria-label="Close dialog"
        tabIndex={-1}
      />
      <div className="relative mx-4 w-full max-w-sm rounded-2xl border border-border bg-popover p-lg shadow-elevation-xl">
        <div className="mb-md flex items-start gap-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-500/15">
            <AlertTriangle className="h-5 w-5 text-primary-400" />
          </div>
          <div>
            <h2
              id="new-split-confirm-title"
              className="text-base font-bold text-foreground"
            >
              Start a new split?
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Your current stems, mix settings, and any unsaved progress will be
              cleared. This cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-xs">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="min-h-[40px] rounded-lg border border-border bg-muted px-md py-xs text-sm font-medium text-secondary-foreground transition hover:border-border hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-[40px] rounded-lg border border-destructive-400/40 bg-destructive-500/20 px-md py-xs text-sm font-semibold text-destructive-100 transition hover:border-destructive-400/60 hover:bg-destructive-500/30"
          >
            Clear &amp; Start New
          </button>
        </div>
      </div>
    </div>
  );
}
