import type { ReactNode } from "react";
import { useDevOverlayDismissed } from "./dev-overlay-dismiss";

interface DevOverlayToggleBarProps {
  healthToggle: ReactNode | null;
  latencyToggle: ReactNode | null;
}

/** Groups dev overlay toggles on the top-right so left chrome stays clear on small viewports. */
export function DevOverlayToggleBar({
  healthToggle,
  latencyToggle,
}: DevOverlayToggleBarProps) {
  const { dismissed, dismiss } = useDevOverlayDismissed();

  if (import.meta.env.PROD || dismissed) return null;
  if (!healthToggle && !latencyToggle) return null;

  return (
    <div
      data-dev-overlay="toggle-bar"
      className="fixed right-4 top-4 z-[60] flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-end gap-1"
    >
      {healthToggle}
      {latencyToggle}
      <button
        type="button"
        onClick={dismiss}
        className="rounded-lg border border-border bg-chrome px-1.5 py-1 text-[10px] text-muted-foreground backdrop-blur-md transition hover:text-foreground"
        aria-label="Dismiss dev overlay panels for this session"
        title="Hide dev tools until you click Restore"
      >
        ×
      </button>
    </div>
  );
}
