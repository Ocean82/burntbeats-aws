import { X, LayoutPanelLeft, Sparkles } from "lucide-react";
import { useUiStore } from "../store/uiStore";
import { useAppStore } from "../store/appStore";

export interface SessionSidebarProps {
  hasCompletedFirstExport?: boolean;
  onViewPlans?: () => void;
}

export function SessionSidebar({
  hasCompletedFirstExport = false,
  onViewPlans,
}: SessionSidebarProps) {
  const { isSidebarOpen, setSidebarOpen } = useUiStore();
  const splitResultStems = useAppStore((s) => s.splitResultStems);
  const showPromo = splitResultStems.length === 0 && !hasCompletedFirstExport;

  if (!isSidebarOpen) {
    return (
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="fixed left-4 top-1/2 z-40 -translate-y-1/2 rounded-full border border-white/10 bg-black/60 p-3 text-primary-400 backdrop-blur-md shadow-xl transition hover:scale-105 hover:bg-black/80"
        title="Open session hub"
        aria-label="Open session hub"
      >
        <LayoutPanelLeft className="h-6 w-6" />
      </button>
    );
  }

  return (
    <aside className="hardware-panel fixed inset-y-0 left-0 z-50 flex w-80 flex-col gap-lg border-r border-white/10 p-md shadow-2xl"
      style={{ animation: "slideInFromLeft 300ms var(--ease-out-quart) both" }}
    >
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-xs text-lg font-bold tracking-tight">
          <Sparkles className="h-5 w-5 text-primary-400" aria-hidden />
          Session hub
        </h2>
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="rounded-lg p-1 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
          aria-label="Close session hub"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-md text-sm leading-relaxed text-muted-foreground">
        <p>
          Workflow progress lives in the step bar under the header. Use{" "}
          <span className="text-secondary-foreground">Stem editor</span> for upload,
          split, and mix.
        </p>
        {hasCompletedFirstExport ? (
          <p className="mt-sm text-success-300/90">
            You have exported from this session. Open export again from the timeline
            transport.
          </p>
        ) : null}
      </div>

      {showPromo && onViewPlans ? (
        <div className="mt-auto rounded-2xl border border-white/5 bg-white/[0.03] p-md">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Pro unlocks 4-stem split, HQ quality, and MIDI export.
          </p>
          <button
            type="button"
            onClick={onViewPlans}
            className="fire-button tap-feedback mt-md w-full rounded-xl py-2.5 text-sm font-bold"
          >
            View plans
          </button>
        </div>
      ) : null}
    </aside>
  );
}
