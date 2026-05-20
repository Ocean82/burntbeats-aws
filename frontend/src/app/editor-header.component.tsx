import { HelpCircle, Undo2, Redo2, Save, Disc3, LayoutGrid, Mic2, Music } from "lucide-react";
import { cn } from "../utils/cn";
import { HeaderUserButton } from "../components/AuthGate";
import { AppMobileMoreMenu } from "../components/AppMobileMoreMenu";
import { TokenBalanceBadge } from "../components/TokenBalanceBadge";
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

  const handleTabClick = (view: "editor" | "speech" | "midi" | "pricing" | "my-stems") => {
    setActiveView(view);
    markTabSeen(view);
  };

  return (
    <>
      {/* ── Navigation Tabs ── */}
      <nav
        aria-label="Workspace tabs"
        className="glass-panel mirror-sheen inline-flex w-fit max-w-full items-center gap-1 self-start rounded-xl border border-white/10 p-1"
      >
        <button
          type="button"
          onClick={() => handleTabClick("editor")}
          className={cn(
            "relative min-h-[40px] rounded-lg px-3 text-xs font-semibold uppercase tracking-wide transition tap-feedback sm:px-4",
            activeView === "editor"
              ? "bg-amber-500/20 text-amber-100 border border-amber-400/50"
              : "text-white/65 hover:text-white border border-transparent",
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
            "relative min-h-[40px] rounded-lg px-3 text-xs font-semibold uppercase tracking-wide transition tap-feedback sm:px-4 inline-flex items-center gap-1.5",
            activeView === "speech"
              ? "bg-cyan-500/20 text-cyan-100 border border-cyan-400/50"
              : "text-white/65 hover:text-white border border-transparent",
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
            "relative min-h-[40px] rounded-lg px-3 text-xs font-semibold uppercase tracking-wide transition tap-feedback sm:px-4 inline-flex items-center gap-1.5",
            activeView === "midi"
              ? "bg-violet-500/20 text-violet-100 border border-violet-400/50"
              : "text-white/65 hover:text-white border border-transparent",
          )}
          aria-current={activeView === "midi" ? "page" : undefined}
        >
          <Music className="h-3.5 w-3.5" aria-hidden />
          MIDI
          <WhatsNewBadge visible={tabsWithNews.has("midi")} />
        </button>
        <button
          type="button"
          onClick={() => handleTabClick("pricing")}
          className={cn(
            "min-h-[40px] rounded-lg px-3 text-xs font-semibold uppercase tracking-wide transition tap-feedback sm:px-4",
            activeView === "pricing"
              ? "bg-amber-500/20 text-amber-100 border border-amber-400/50"
              : "text-white/65 hover:text-white border border-transparent",
          )}
          aria-current={activeView === "pricing" ? "page" : undefined}
        >
          Plans
        </button>
        <button
          type="button"
          onClick={() => handleTabClick("my-stems")}
          className={cn(
            "relative min-h-[40px] rounded-lg px-3 text-xs font-semibold uppercase tracking-wide transition tap-feedback sm:px-4",
            activeView === "my-stems"
              ? "bg-amber-500/20 text-amber-100 border border-amber-400/50"
              : "text-white/65 hover:text-white border border-transparent",
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
          "glass-panel mirror-sheen flex flex-col gap-5 rounded-[2rem] px-4 py-4 sm:px-6 sm:py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8",
          "header-sticky",
          !headerVisible && "header-sticky-hidden"
        )}
        aria-label="Burnt Beats"
      >
        {/* Left: Logo + tagline */}
        <div className="flex items-center gap-4">
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
            <p className="mt-0.5 text-xs text-white/55 sm:text-sm">
              Split · Mix · Master · Export
            </p>
          </div>
        </div>

        {/* Right: Actions toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Token balance */}
          <TokenBalanceBadge
            balance={usageBalance}
            loading={usageLoading}
            onClick={() => setActiveView("pricing")}
            className="hidden sm:inline-flex"
          />

          {/* Plan badge */}
          {subscription.status === "active" && subscription.plan && (
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-emerald-200/90">
              {subscription.plan}
            </span>
          )}

          {/* Undo / Redo */}
          <div className="flex items-center rounded-xl border border-white/10 bg-black/20">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center text-white/65 disabled:opacity-30 transition hover:text-white"
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <div className="h-4 w-px bg-white/10" />
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center text-white/65 disabled:opacity-30 transition hover:text-white"
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
              "flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 text-sm transition tap-feedback",
              mode === "dj"
                ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-200"
                : "border-white/10 bg-black/20 text-white/65 hover:text-white",
            )}
            title={mode === "dj" ? "Switch to Classic layout" : "Switch to DJ layout"}
            aria-label={mode === "dj" ? "Switch to Classic layout" : "Switch to DJ layout"}
          >
            {mode === "dj" ? <Disc3 className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline text-xs">{mode === "dj" ? "DJ" : "Classic"}</span>
          </button>

          {/* Presets + Help (desktop only) */}
          <div className="hidden items-center gap-1.5 lg:flex">
            <button
              type="button"
              onClick={() => openModal("presets")}
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white/75 transition hover:text-white tap-feedback"
              title="Presets"
              aria-label="Open mixer presets"
            >
              <Save className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">Presets</span>
            </button>
            <button
              type="button"
              onClick={() => openModal("help")}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white/65 transition hover:text-white tap-feedback"
              title="Help (?)"
              aria-label="Open help"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>

          {/* Billing (desktop, active subscription only) */}
          {subscription.status === "active" && !localDevFullApp && (
            <button
              type="button"
              onClick={() => void subscription.openPortal()}
              className="hidden min-h-[44px] items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-white/60 transition hover:text-white tap-feedback lg:flex"
              title="Manage billing"
            >
              Billing
            </button>
          )}

          {/* User avatar / local dev badge */}
          {localDevFullApp ? (
            <span className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/90">
              Local dev
            </span>
          ) : (
            <HeaderUserButton />
          )}

          {/* Mobile more menu */}
          <AppMobileMoreMenu
            onOpenFullPricingTab={() => {
              const url =
                import.meta.env.VITE_FULL_PRICING_URL ??
                "https://www.burntbeats.com/pricing";
              window.open(url, "_blank", "noopener,noreferrer");
            }}
            onOpenPricing={() => setActiveView("pricing")}
            onOpenUsage={() => setActiveView("pricing")}
            onOpenPortal={() => void subscription.openPortal()}
            onOpenPresets={() => openModal("presets")}
            onOpenHelp={() => openModal("help")}
            onOpenFeedback={openFeedback}
            onRestartTour={openOnboarding}
            onOpenLegal={() => {
              window.open("/terms-of-service", "_blank", "noopener,noreferrer");
            }}
            pricingLabel="Plans & subscriptions"
            pricingTitle="View and select subscriptions"
            showBilling={subscription.status === "active" && !localDevFullApp}
            usageSummary={
              usageLoading
                ? "loading"
                : usageBalance != null
                  ? `${Math.floor(usageBalance)} left`
                  : undefined
            }
          />
        </div>
      </header>
    </>
  );
}
