import { useDevOverlayDismissed } from "./dev-overlay-dismiss";

/** Tiny restore affordance when dev overlay toggles are dismissed for the session. */
export function DevOverlayRestoreChip() {
  const { dismissed, restore } = useDevOverlayDismissed();

  if (import.meta.env.PROD || !dismissed) return null;

  return (
    <button
      type="button"
      onClick={restore}
      data-dev-overlay="restore"
      className="fixed right-4 top-4 z-[60] rounded-lg border border-border bg-chrome px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-md transition hover:text-foreground"
      aria-label="Restore dev overlay panels"
      title="Restore dev latency and health panels for this session"
    >
      Dev
    </button>
  );
}
