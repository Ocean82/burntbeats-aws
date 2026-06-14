import { useState } from "react";
import { ChevronDown, ChevronUp, Wrench } from "lucide-react";
import { isInternalHealthPanelEnabled } from "../../config";
import { DevHealthPanel } from "../../app/dev-health-panel.component";
import { DevLatencyPanel } from "../../app/dev-latency-panel.component";
import { useDevOverlayDismissed } from "../../app/dev-overlay-dismiss";
import type { UiLatencySnapshot } from "../../hooks/useUiLatencyMonitor";
import { cn } from "../../utils/cn";
import "./library-dev-drawer.css";

export interface LibraryDevDrawerProps {
  latencyStats: UiLatencySnapshot;
  onResetLatencyStats: () => void;
}

export function LibraryDevDrawer({
  latencyStats,
  onResetLatencyStats,
}: LibraryDevDrawerProps) {
  const [open, setOpen] = useState(false);
  const { dismissed, dismiss } = useDevOverlayDismissed();
  const healthEnabled = isInternalHealthPanelEnabled();

  if (import.meta.env.PROD || dismissed) return null;

  return (
    <section className="library-dev-drawer" data-testid="library-dev-drawer">
      <button
        type="button"
        className="library-dev-drawer__header"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="library-dev-drawer-panel"
      >
        <div className="flex items-center gap-sm text-left">
          <Wrench className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <div>
            <div className="library-dev-drawer__title">Developer tools</div>
            <div className="library-dev-drawer__subtitle">
              UI latency{healthEnabled ? " and backend health" : ""}
            </div>
          </div>
        </div>
        <span className="library-dev-drawer__chevron" aria-hidden>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </span>
      </button>
      <div
        id="library-dev-drawer-panel"
        className={cn(
          "library-dev-drawer__content",
          !open && "library-dev-drawer__content--collapsed",
        )}
      >
        {open ? (
          <>
            <div className="library-dev-drawer__section">
              <DevLatencyPanel
                latencyStats={latencyStats}
                onResetLatencyStats={onResetLatencyStats}
                embedded
              />
            </div>
            {healthEnabled ? (
              <div className="library-dev-drawer__section">
                <DevHealthPanel embedded />
              </div>
            ) : null}
            <div className="library-dev-drawer__footer">
              <button
                type="button"
                onClick={dismiss}
                className="rounded-md border border-border px-sm py-1 text-[11px] text-muted-foreground transition hover:text-foreground"
                aria-label="Hide developer tools for this session"
              >
                Hide for session
              </button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
