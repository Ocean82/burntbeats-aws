import { Undo2, Redo2, Disc3, LayoutGrid, Mic2, Music } from "lucide-react";
import { cn } from "../utils/cn";
import { AccountMenu } from "../components/AccountMenu";
import { SettingsMenu } from "../components/SettingsMenu";
import { WhatsNewBadge } from "../components/WhatsNewBadge";
import type { UseSubscriptionResult } from "../hooks/useSubscription";
import type { ModalKey } from "../hooks/useUiModals";
import { useLayoutMode } from "../contexts/LayoutModeContext";
import { useWhatsNew } from "../hooks/useWhatsNew";

interface EditorHeaderProps {
  headerVisible: boolean;
  activeView: "editor" | "speech" | "midi" | "pricing" | "my-stems";
  setActiveView: (view: "editor" | "speech" | "midi" | "pricing" | "my-stems") => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  openModal: (key: ModalKey) => void;
  localDevFullApp: boolean;
  subscription: UseSubscriptionResult;
  usageBalance: number | null | undefined;
  usageLoading: boolean;
  openFeedback: () => void;
  openOnboarding: () => void;
}

export function EditorHeader({
  headerVisible,
  activeView,
  setActiveView,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  openModal,
  localDevFullApp,
  subscription,
  usageBalance,
  usageLoading,
  openFeedback,
  openOnboarding,
}: EditorHeaderProps) {
  const { mode, toggleMode } = useLayoutMode();
  const { tabsWithNews, markTabSeen } = useWhatsNew();

  const handleTabClick = (
    view: "editor" | "speech" | "midi" | "my-stems",
  ) => {
    setActiveView(view);
    markTabSeen(view);
  };

  return (
    <>
      {/* ── Navigation Tabs ── */}
      <nav
        aria-label="Workspace tabs"
        className="glass-panel mirror-sheen flex w-full max-w-full items-center gap-2xs self-stretch overflow-x-auto rounded-xl border border-border p-2xs sm:inline-flex sm:w-fit sm:self-start [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]"
      >
        <button
          type="button"
          onClick={() => handleTabClick("editor")}
          className={cn(
            "relative shrink-0 min-h-[40px] rounded-lg px-sm text-xs font-semibold uppercase tracking-wide transition tap-feedback sm:px-md",
            activeView === "editor"
              ? "bg-primary-500/20 text-primary-100 border border-primary-400/50"
              : "text-muted-foreground hover:text-foreground border border-transparent",
          )}
          aria-current={activeView === "editor" ? "page" : undefined}
        >
          Stem editor
          <WhatsNewBadge visible={tabsWithNews.has("editor")} />
        </button>
        <button
          type="button"
          onClick={() => handleTabClick("speech")}
          className={cn(
            "relative shrink-0 min-h-[40px] rounded-lg px-sm text-xs font-semibold uppercase tracking-wide transition tap-feedback sm:px-md inline-flex items-center gap-xs",
            activeView === "speech"
              ? "bg-info-500/20 text-info-100 border border-info-400/50"
              : "text-muted-foreground hover:text-foreground border border-transparent",
          )}
          aria-current={activeView === "speech" ? "page" : undefined}
        >
          <Mic2 className="h-3.5 w-3.5" aria-hidden />
          Speech
          <WhatsNewBadge visible={tabsWithNews.has("speech")} />
        </button>
        <button
          type="button"
          onClick={() => handleTabClick("midi")}
          className={cn(
            "relative shrink-0 min-h-[40px] rounded-lg px-sm text-xs font-semibold uppercase tracking-wide transition tap-feedback sm:px-md inline-flex items-center gap-xs",
            activeView === "midi"
              ? "bg-accent-midi-500/20 text-accent-midi-100 border border-accent-midi-400/50"
              : "text-muted-foreground hover:text-foreground border border-transparent",
          )}
          aria-current={activeView === "midi" ? "page" : undefined}
        >
          <Music className="h-3.5 w-3.5" aria-hidden />
          MIDI
          <WhatsNewBadge visible={tabsWithNews.has("midi")} />
        </button>
        <button
          type="button"
          onClick={() => handleTabClick("my-stems")}
          className={cn(
            "relative shrink-0 min-h-[40px] rounded-lg px-sm text-xs font-semibold uppercase tracking-wide transition tap-feedback sm:px-md",
            activeView === "my-stems"
              ? "bg-primary-500/20 text-primary-100 border border-primary-400/50"
              : "text-muted-foreground hover:text-foreground border border-transparent",
          )}
          aria-current={activeView === "my-stems" ? "page" : undefined}
        >
          My Stems
          <WhatsNewBadge visible={tabsWithNews.has("my-stems")} />
        </button>
      </nav>

      {/* ── Header ── */}
      <header
        className={cn(
          "glass-panel mirror-sheen flex flex-col gap-lg rounded-[2rem] px-md py-md sm:px-lg sm:py-lg lg:flex-row lg:items-center lg:justify-between lg:px-xl",
          "header-sticky",
          !headerVisible && "header-sticky-hidden"
        )}
        aria-label="Burnt Beats"
      >
        {/* Left: Logo + tagline */}
        <div className="flex items-center gap-md">
          <img
            src="/logo-emblem.png"
            alt=""
            className="logo-emblem h-10 w-10 sm:h-12 sm:w-12"
            aria-hidden="true"
          />
          <div>
            <div className="logo-burnt">
              <span className="logo-burnt-fire block text-2xl sm:text-3xl lg:text-4xl">
                Burnt Beats
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
              Split · Mix · Master · Export
            </p>
          </div>
        </div>

        {/* Right: Actions toolbar */}
        <div className="flex flex-wrap items-center gap-xs">
          {/* Undo / Redo */}
          <div className="flex items-center rounded-xl border border-border bg-muted">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center text-muted-foreground disabled:opacity-30 transition hover:text-foreground"
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <div className="h-4 w-px bg-muted" />
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center text-muted-foreground disabled:opacity-30 transition hover:text-foreground"
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </div>

          {/* Layout mode toggle */}
          <button
            type="button"
            onClick={toggleMode}
            className={cn(
              "flex min-h-[44px] items-center gap-xs rounded-xl border px-sm text-sm transition tap-feedback",
              mode === "dj"
                ? "border-info-400/40 bg-info-500/15 text-info-200"
                : "border-border bg-muted text-muted-foreground hover:text-foreground",
            )}
            title={mode === "dj" ? "Switch to Classic layout" : "Switch to DJ layout"}
            aria-label={mode === "dj" ? "Switch to Classic layout" : "Switch to DJ layout"}
          >
            {mode === "dj" ? <Disc3 className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline text-xs">{mode === "dj" ? "DJ" : "Classic"}</span>
          </button>

          {/* Settings (plans, billing, app utilities) */}
          <SettingsMenu
            pricingActive={activeView === "pricing"}
            showBilling={subscription.status === "active" && !localDevFullApp}
            usageBalance={usageBalance}
            usageLoading={usageLoading}
            onOpenFullPricingTab={() => {
              const url =
                import.meta.env.VITE_FULL_PRICING_URL ??
                "https://www.burntbeats.com/pricing";
              window.open(url, "_blank", "noopener,noreferrer");
            }}
            onOpenPricing={() => setActiveView("pricing")}
            onOpenPortal={() => void subscription.openPortal()}
            onOpenPresets={() => openModal("presets")}
            onOpenHelp={() => openModal("help")}
            onOpenFeedback={openFeedback}
            onRestartTour={openOnboarding}
            onOpenLegal={() => {
              window.open("/terms-of-service", "_blank", "noopener,noreferrer");
            }}
          />

          {/* Account popout — profile & sign out */}
          <AccountMenu
            localDevFullApp={localDevFullApp}
            subscriptionPlan={subscription.plan}
            subscriptionActive={subscription.status === "active"}
            usageBalance={usageBalance}
            usageLoading={usageLoading}
          />
        </div>
      </header>
    </>
  );
}
