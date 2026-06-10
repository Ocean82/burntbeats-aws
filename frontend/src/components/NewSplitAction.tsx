import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { NewSplitConfirmDialog } from "./processing-settings/NewSplitConfirmDialog";

export interface NewSplitActionProps {
  /** Called when the user confirms the new split action. Should call reset() from the phase controller. */
  onReset: () => void;
}

/**
 * NewSplitAction — Ghost-style button with RotateCcw icon and "New Split" label.
 * Opens a confirmation dialog on click. On confirm, calls the reset function
 * to clear stem data and return to the upload phase.
 *
 * Rendered in the HeaderBar only when phase is "workspace" (Req 6.1, 6.2).
 * Accessible name: "Start a new split" (Req 6.7).
 * Ghost/outline style with muted foreground (Req 6.6).
 */
export function NewSplitAction({ onReset }: NewSplitActionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleClick = () => {
    setDialogOpen(true);
  };

  const handleConfirm = () => {
    setDialogOpen(false);
    onReset();
  };

  const handleCancel = () => {
    setDialogOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center gap-xs rounded-lg px-sm py-xs text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Start a new split"
      >
        <RotateCcw className="h-4 w-4" />
        <span>New Split</span>
      </button>

      <NewSplitConfirmDialog
        open={dialogOpen}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
}
