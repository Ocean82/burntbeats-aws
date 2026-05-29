import { Undo2, Redo2, Mic2, Music, BookOpen, Radio } from "lucide-react";
import { cn } from "../utils/cn";
import { AccountMenu } from "../components/AccountMenu";
import { SettingsMenu } from "../components/SettingsMenu";
import { WhatsNewBadge } from "../components/WhatsNewBadge";
import { WorkflowStepper } from "../components/ui";
import type { UseSubscriptionResult } from "../hooks/useSubscription";
import type { ModalKey } from "../hooks/useUiModals";
import { useWhatsNew } from "../hooks/useWhatsNew";
import {
  useEditorWorkflowSteps,
  type EditorWorkflowInput,
} from "../hooks/workflow/useEditorWorkflowSteps";

interface EditorHeaderProps {
  headerVisible: boolean;
  activeView: "editor" | "speech" | "midi" | "library" | "tuner" | "pricing" | "my-stems";
  setActiveView: (
    view: "editor" | "speech" | "midi" | "library" | "tuner" | "pricing" | "my-stems",
  ) => void;
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
  /** Pipeline state for stem editor workflow stepper */
  editorWorkflow?: EditorWorkflowInput | null;
}

const TAB_CLASS = (active: boolean) =>
  cn(
    "relative shrink-0 min-h-[40px] rounded-lg px-sm text-sm font-medium transition tap-feedback sm:px-md inline-flex items-center gap-xs",
    active
      ? "bg-primary-500/20 text-primary-100 border border-primary-400/50"
      : "text-muted-foreground hover:text-foreground border border-transparent",
  );

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
  editorWorkflow = null,
}: EditorHeaderProps) {
  const { tabsWithNews, markTabSeen } = useWhatsNew();
  const workflow = useEditorWorkflowSteps(
    editorWorkflow ?? {
      uploadedFile: null,
      isSplitting: false,
      mixStemsLength: 0,
      isExporting: false,
    },
  );
  const showWorkflow =
    activeView === "editor" && editorWorkflow != null;

  const handleTabClick = (
    view: "editor" | "speech" | "midi" | "library" | "tuner" | "my-stems",
  ) => {
    setActiveView(view);
    markTabSeen(view);
  };

  return (
    <header
      className={cn(
        "glass-panel flex flex-col gap-md rounded-2xl px-md py-md sm:px-lg sm:py-md",
        "header-sticky editor-app-header",
        !headerVisible && "header-sticky-hidden",
      )}
      aria-label="Burnt Beats"
    >
      {/* Brand row + actions */}
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div className="flex min-w-0 items-center gap-sm sm:gap-md">
          <img
            src="/logo-emblem.png"
            alt=""
            className="logo-emblem h-9 w-9 shrink-0 sm:h-10 sm:w-10"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="logo-burnt">
              <span className="logo-burnt-fire block text-xl sm:text-2xl">
                Burnt Beats
              </span>
            </div>
            <p className="editor-header-tagline mt-0.5 hidden text-xs text-muted-foreground sm:block">
              Split · Mix · Master · Export
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-xs">
          <div className="flex items-center rounded-xl border border-border bg-muted/80">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center text-muted-foreground transition hover:text-foreground disabled:opacity-30"
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <div className="h-4 w-px bg-border" />
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center text-muted-foreground transition hover:text-foreground disabled:opacity-30"
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </div>

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

          <AccountMenu
            localDevFullApp={localDevFullApp}
            subscriptionPlan={subscription.plan}
            subscriptionActive={subscription.status === "active"}
            usageBalance={usageBalance}
            usageLoading={usageLoading}
          />
        </div>
      </div>

      {/* Workspace tabs */}
      <nav
        aria-label="Workspace tabs"
        className="flex w-full max-w-full items-center gap-2xs overflow-x-auto rounded-xl border border-border/80 bg-muted/40 p-2xs [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]"
      >
        <button
          type="button"
          onClick={() => handleTabClick("editor")}
          className={TAB_CLASS(activeView === "editor")}
          aria-current={activeView === "editor" ? "page" : undefined}
        >
          Stem editor
          <WhatsNewBadge visible={tabsWithNews.has("editor")} />
        </button>
        <button
          type="button"
          onClick={() => handleTabClick("speech")}
          className={TAB_CLASS(activeView === "speech")}
          aria-current={activeView === "speech" ? "page" : undefined}
        >
          <Mic2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Speech
          <WhatsNewBadge visible={tabsWithNews.has("speech")} />
        </button>
        <button
          type="button"
          onClick={() => handleTabClick("midi")}
          className={TAB_CLASS(activeView === "midi")}
          aria-current={activeView === "midi" ? "page" : undefined}
        >
          <Music className="h-3.5 w-3.5 shrink-0" aria-hidden />
          MIDI
          <WhatsNewBadge visible={tabsWithNews.has("midi")} />
        </button>
        <button
          type="button"
          onClick={() => handleTabClick("library")}
          className={TAB_CLASS(activeView === "library")}
          aria-current={activeView === "library" ? "page" : undefined}
        >
          <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Library
        </button>
        <button
          type="button"
          onClick={() => handleTabClick("tuner")}
          className={TAB_CLASS(activeView === "tuner")}
          aria-current={activeView === "tuner" ? "page" : undefined}
        >
          <Radio className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Tuner
        </button>
        <button
          type="button"
          onClick={() => handleTabClick("my-stems")}
          className={TAB_CLASS(activeView === "my-stems")}
          aria-current={activeView === "my-stems" ? "page" : undefined}
        >
          My stems
          <WhatsNewBadge visible={tabsWithNews.has("my-stems")} />
        </button>
      </nav>

      {showWorkflow ? (
        <WorkflowStepper
          steps={[...workflow.steps]}
          activeStepId={workflow.activeStepId}
          completedStepIds={workflow.completedStepIds}
          className="mb-0"
        />
      ) : null}
    </header>
  );
}
