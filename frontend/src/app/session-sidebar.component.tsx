import { X, LayoutPanelLeft, Sparkles, Music, Settings, FileDown } from "lucide-react";
import { useUiStore } from "../store/uiStore";

export interface SessionSidebarProps {
  hasCompletedFirstExport?: boolean;
  onQuickExport?: () => void;
}

const COLLAPSED_W = "w-12";
const EXPANDED_W = "w-72";

export function SessionSidebar({
  hasCompletedFirstExport = false,
  onQuickExport,
}: SessionSidebarProps) {
  const { isSidebarOpen, toggleSidebar, setSidebarOpen } = useUiStore();

  return (
    <aside
      className={`flex flex-shrink-0 flex-col border-r border-white/10 bg-[var(--chrome)]/60 backdrop-blur-xl transition-all duration-300 ${
        isSidebarOpen ? EXPANDED_W : COLLAPSED_W
      }`}
    >
      {/* Toggle button row */}
      <div className="flex items-center justify-center border-b border-white/5 p-2">
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex items-center justify-center rounded-lg p-2 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
          title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <LayoutPanelLeft
            className={`h-5 w-5 transition-transform duration-300 ${
              isSidebarOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      {/* Quick action icons when collapsed */}
      {!isSidebarOpen && (
        <nav className="flex flex-col items-center gap-3 py-4" aria-label="Sidebar quick actions">
          <button
            type="button"
            onClick={toggleSidebar}
            className="flex items-center justify-center rounded-lg p-2 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
            title="Stems"
            aria-label="Stems"
          >
            <Music className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={toggleSidebar}
            className="flex items-center justify-center rounded-lg p-2 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onQuickExport ?? toggleSidebar}
            className="flex items-center justify-center rounded-lg p-2 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
            title="Export"
            aria-label="Export"
          >
            <FileDown className="h-5 w-5" />
          </button>
        </nav>
      )}

      {/* Full content when expanded */}
      {isSidebarOpen && (
        <>
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
              <Sparkles className="h-4 w-4 text-primary-400" aria-hidden />
              Session hub
            </h2>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="rounded-lg p-1 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
              aria-label="Close session hub"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                Workflow progress lives in the step bar under the header. Use{" "}
                <span className="text-secondary-foreground">Stem editor</span> for upload,
                split, and mix.
              </p>
              {hasCompletedFirstExport ? (
                <p className="mt-3 text-success-300/90">
                  You have exported from this session. Open export again from the timeline
                  transport.
                </p>
              ) : null}
            </div>


          </div>
        </>
      )}
    </aside>
  );
}
