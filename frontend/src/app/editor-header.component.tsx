import { useState } from "react";
import { Home, Undo2, Redo2, Mic2, Music, Drum, FolderOpen, Guitar } from "lucide-react";
import { cn } from "../utils/cn";
import { AccountMenu } from "../components/AccountMenu";
import { PlanBadge } from "../components/PlanBadge";
import { SettingsMenu } from "../components/SettingsMenu";
import { PastDueBanner } from "../components/PastDueBanner";
import { CancelSubscriptionFlow } from "../components/CancelSubscriptionFlow";
import { WhatsNewBadge } from "../components/WhatsNewBadge";
import { WorkflowStepper } from "../components/ui";
import type { UseSubscriptionResult } from "../hooks/useSubscription";
import type { ModalKey } from "../hooks/useUiModals";
import { useWhatsNew } from "../hooks/useWhatsNew";
import {
  useEditorWorkflowSteps,
  type EditorWorkflowInput,
} from "../hooks/workflow/useEditorWorkflowSteps";
import { BACK_TO_HOME_LABEL, getHeaderTools } from "../data/toolCatalog";
import type { AppView } from "../hooks/workflow/useEditorViewRouting";

interface EditorHeaderProps {
  headerVisible: boolean;
  activeView: "hub" | "editor" | "speech" | "midi" | "beats" | "tuner" | "pricing" | "my-stems";
  setActiveView: (
    view: "hub" | "editor" | "speech" | "midi" | "beats" | "tuner" | "pricing" | "my-stems",
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

const HEADER_TAB_ICONS: Partial<Record<string, React.ComponentType<{ className?: string }>>> = {
  speech: Mic2,
  midi: Music,
  beats: Drum,
  tuner: Guitar,
  "my-stems": FolderOpen,
};

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
  const [cancelFlowOpen, setCancelFlowOpen] = useState(false);
  const headerTools = getHeaderTools();
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

  const handleTabClick = (view: AppView) => {
    if (view === "hub" || view === "pricing") return;
    setActiveView(view);
    markTabSeen(view);
  };

  return (
    <header
      className={cn(
        "glass-panel flex flex-col gap-md rounded-2xl px-md py-md sm:px-lg sm:py-md overflow-visible",
        "header-sticky editor-app-header",
        !headerVisible && "header-sticky-hidden",
      )}
      aria-label="Burnt Beats"
    >
      <PastDueBanner
        billingStatus={subscription.billingStatus}
        onUpdatePayment={() => void subscription.openPortal()}
      />
      <CancelSubscriptionFlow
        open={cancelFlowOpen}
        onClose={() => setCancelFlowOpen(false)}
        plan={subscription.plan}
        onOpenPortal={() => void subscription.openPortal()}
        onOfferAccepted={() => subscription.refetch()}
      />
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
          {activeView !== "hub" && (
            <button
              type="button"
              onClick={() => setActiveView("hub")}
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border bg-muted/60 px-3 text-muted-foreground transition hover:border-primary-400/40 hover:text-primary-200 tap-feedback"
              title={BACK_TO_HOME_LABEL}
              aria-label={BACK_TO_HOME_LABEL}
            >
              <Home className="h-4 w-4" aria-hidden />
              <span className="text-xs font-medium hidden sm:inline">Home</span>
            </button>
          )}

          <PlanBadge
            plan={subscription.plan}
            subscriptionStatus={subscription.status}
            freeTokensRemaining={usageBalance != null && subscription.status !== "active" ? usageBalance : null}
            usageLoading={usageLoading}
          />

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
            onCancelSubscription={() => setCancelFlowOpen(true)}
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
        {headerTools.map((tool) => {
          const Icon = HEADER_TAB_ICONS[tool.id];
          const isActive = activeView === tool.appView;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => handleTabClick(tool.appView)}
              className={TAB_CLASS(isActive)}
              aria-current={isActive ? "page" : undefined}
            >
              {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
              {tool.headerTabLabel}
              <WhatsNewBadge visible={tabsWithNews.has(tool.appView)} />
            </button>
          );
        })}
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
