import { HelpCircle, Undo2, Redo2, Save, Disc3, LayoutGrid, Mic2, Music } from "lucide-react";
import { cn } from "../utils/cn";
import { HeaderUserButton } from "../components/AuthGate";
import { AppMobileMoreMenu } from "../components/AppMobileMoreMenu";
import { TokenBalanceBadge } from "../components/TokenBalanceBadge";
import type { UseSubscriptionResult } from "../hooks/useSubscription";
import type { ModalKey } from "../hooks/useUiModals";
import { useLayoutMode } from "../contexts/LayoutModeContext";

interface EditorHeaderProps {
  headerVisible: boolean;
  activeView: "editor" | "speech" | "midi" | "pricing" | "my-stems";
  setActiveView: (view: "editor" | "speech" | "midi" | "pricing" | "my-stems") => void;
  uploadedFile: File | null;
  isSplitting: boolean;
  mixStemsLength: number;
  isExporting: boolean;
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
  uploadedFile,
  isSplitting,
  mixStemsLength,
  isExporting,
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
  return (
    <>
      <nav
        aria-label="Workspace tabs"
        className="glass-panel mirror-sheen inline-flex w-fit max-w-full items-center gap-1 self-start rounded-xl border border-white/10 p-1"
      >
        <button
          type="button"
          onClick={() => setActiveView("editor")}
          className={cn(
            "min-h-[40px] rounded-lg px-3 text-xs font-semibold uppercase tracking-wide transition tap-feedback sm:px-4",
            activeView === "editor"
              ? "bg-amber-500/20 text-amber-100 border border-amber-400/50"
              : "text-white/65 hover:text-white border border-transparent",
          )}
          aria-current={activeView === "editor" ? "page" : undefined}
        >
          Stem editor
        </button>
        <button
          type="button"
          onClick={() => setActiveView("speech")}
          className={cn(
            "min-h-[40px] rounded-lg px-3 text-xs font-semibold uppercase tracking-wide transition tap-feedback sm:px-4 inline-flex items-center gap-1.5",
            activeView === "speech"
              ? "bg-cyan-500/20 text-cyan-100 border border-cyan-400/50"
              : "text-white/65 hover:text-white border border-transparent",
          )}
          aria-current={activeView === "speech" ? "page" : undefined}
        >
          <Mic2 className="h-3.5 w-3.5" aria-hidden />
          Speech
        </button>
        <button
          type="button"
          onClick={() => setActiveView("midi")}
          className={cn(
            "min-h-[40px] rounded-lg px-3 text-xs font-semibold uppercase tracking-wide transition tap-feedback sm:px-4 inline-flex items-center gap-1.5",
            activeView === "midi"
              ? "bg-violet-500/20 text-violet-100 border border-violet-400/50"
              : "text-white/65 hover:text-white border border-transparent",
          )}
          aria-current={activeView === "midi" ? "page" : undefined}
        >
          <Music className="h-3.5 w-3.5" aria-hidden />
          MIDI
        </button>
        <button
          type="button"
          onClick={() => setActiveView("pricing")}
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
          onClick={() => setActiveView("my-stems")}
          className={cn(
            "min-h-[40px] rounded-lg px-3 text-xs font-semibold uppercase tracking-wide transition tap-feedback sm:px-4",
            activeView === "my-stems"
              ? "bg-amber-500/20 text-amber-100 border border-amber-400/50"
              : "text-white/65 hover:text-white border border-transparent",
          )}
          aria-current={activeView === "my-stems" ? "page" : undefined}
        >
          My Stems
        </button>
      </nav>
      {/* Header */}
      <header
        className={cn(
          "glass-panel mirror-sheen flex flex-col gap-6 rounded-[2rem] px-4 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-center lg:justify-between lg:px-8",
          "header-sticky",
          !headerVisible && "header-sticky-hidden"
        )}
        aria-label="Burnt Beats"
      >
        <div className="flex flex-col gap-4 sm:gap-5">
          <div className="inline-flex w-fit max-w-full flex-wrap items-center gap-2 rounded-full border border-white/15 bg-white/6 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-100/80 sm:text-[11px] sm:tracking-[0.35em]">
            Stem Splitter / Mixer / Master
            <span className="h-1 w-1 rounded-full bg-[var(--accent)] shadow-[0_0_14px_var(--accent)]" />
          </div>
          <div className="flex items-center gap-4">
            <img
              src="/logo-emblem.png"
              alt=""
              className="logo-emblem h-12 w-12 sm:h-14 sm:w-14 lg:h-16 lg:w-16"
              aria-hidden="true"
            />
            <div className="logo-burnt">
              <span className="logo-burnt-fire block text-4xl sm:text-5xl lg:text-6xl">
                Burnt Beats
              </span>
            </div>
          </div>
          <p className="max-w-xl text-base leading-7 text-white/85">
            Split vocals, drums, bass, and melody → trim, level, pan → play
            mix, export.
          </p>
        </div>
        <div className="flex flex-col gap-3 lg:items-end">
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/75 sm:text-sm">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 border transition-all",
                !uploadedFile
                  ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
                  : "border-white/10 bg-white/5 text-white/65",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  !uploadedFile ? "bg-amber-400" : "bg-white/40",
                )}
              />
              Upload
            </span>
            <span className="text-white/20" aria-hidden>
              →
            </span>
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 border transition-all",
                isSplitting
                  ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
                  : "border-white/10 bg-white/5 text-white/65",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isSplitting ? "bg-amber-400 animate-pulse" : "bg-white/40",
                )}
              />
              Split
            </span>
            <span className="text-white/20" aria-hidden>
              →
            </span>
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 border transition-all",
                mixStemsLength > 0 && !isExporting
                  ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
                  : "border-white/10 bg-white/5 text-white/65",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  mixStemsLength > 0 ? "bg-amber-400" : "bg-white/40",
                )}
              />
              Mix & Export
            </span>
          </div>
          {mixStemsLength > 0 && (
            <p className="text-xs text-green-400/80">
              {mixStemsLength} stems ready
            </p>
          )}
          {subscription.status === "active" && subscription.plan && (
            <p className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-emerald-200/90">
              Plan:&nbsp;<span>{subscription.plan}</span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <TokenBalanceBadge
              balance={usageBalance}
              loading={usageLoading}
              onClick={() => setActiveView("pricing")}
              className="hidden sm:inline-flex"
            />
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
            {mode === "dj" && (
              <span className="hidden sm:inline rounded-full border border-cyan-400/40 bg-cyan-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-200">
                DJ Layout
              </span>
            )}
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
            <div className="hidden flex-wrap items-center gap-2 lg:flex">
              <button
                type="button"
                onClick={() => openModal("presets")}
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white/75 transition hover:text-white tap-feedback"
                title="Presets"
                aria-label="Open mixer presets"
              >
                <Save className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Presets</span>
              </button>
              <button
                type="button"
                onClick={() => openModal("help")}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white/65 transition hover:text-white tap-feedback"
                title="Help"
                aria-label="Open help"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </div>
            {localDevFullApp ? (
              <span className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/90">
                Local dev
              </span>
            ) : (
              <HeaderUserButton />
            )}
            <div className="hidden flex-wrap items-center gap-2 lg:flex">
              <button
                type="button"
                onClick={() => {
                  const url =
                    import.meta.env.VITE_FULL_PRICING_URL ??
                    "https://www.burntbeats.com/pricing";
                  window.open(url, "_blank", "noopener,noreferrer");
                }}
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/15 bg-black/20 px-3 text-xs text-white/70 transition hover:text-white tap-feedback"
                title="Open full pricing page in a new tab"
              >
                Full pricing &amp; features
              </button>
              {subscription.status === "active" && !localDevFullApp && (
                <button
                  type="button"
                  onClick={() => void subscription.openPortal()}
                  className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-white/60 transition hover:text-white tap-feedback"
                  title="Manage billing"
                >
                  Billing
                </button>
              )}
            </div>
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
                window.open(
                  "/terms-of-service",
                  "_blank",
                  "noopener,noreferrer",
                );
              }}
              pricingLabel="Plans & subscriptions"
              pricingTitle="View and select subscriptions"
              showBilling={
                subscription.status === "active" && !localDevFullApp
              }
              usageSummary={
                usageLoading
                  ? "loading"
                  : usageBalance != null
                    ? `${Math.floor(usageBalance)} left`
                    : undefined
              }
            />
          </div>
        </div>
      </header>
    </>
  );
}
