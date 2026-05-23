import type { ComponentProps } from "react";

import type { GuidanceTarget } from "../hooks/useGuidanceSystem";
import { cn } from "../utils/cn";
import { SplitErrorBoundary } from "../components/ErrorBoundary";
import { ProcessingSettingsPanel } from "../components/ProcessingSettingsPanel";
import { PaywallBanner } from "../components/PaywallBanner";
import type { UseSubscriptionResult } from "../hooks/useSubscription";
import { MixerWorkspace } from "./mixer-workspace.component";

export interface EditorChromeProps {
  guidanceTarget: GuidanceTarget;
  guidanceRingClass: string;
  /** Panel pointer handler for collapsing guidance pulse. */
  handleGuidancePanelInteract: React.PointerEventHandler<HTMLDivElement>;
  subscription: UseSubscriptionResult;
  checkoutNotice: string | null;
  /** Pipeline state for breadcrumb */
  uploadedFile: File | null;
  isSplitting: boolean;
  mixStemsLength: number;
  isExporting: boolean;
  onViewPlans?: () => void;
}

export type EditorMixerWorkspaceProps = ComponentProps<typeof MixerWorkspace>;

export type EditorProcessingProps = ComponentProps<
  typeof ProcessingSettingsPanel
>;

export interface EditorMainViewProps {
  /** @deprecated Motion is static in product; kept for call-site compatibility */
  reduceMotion?: boolean;
  chrome: EditorChromeProps;
  processingProps: EditorProcessingProps;
  mixerProps: EditorMixerWorkspaceProps;
}

/** Marquee, processing/settings rail, and mixer workspace — editor home (non-pricing) body. */
export function EditorMainView({
  chrome: {
    guidanceTarget,
    guidanceRingClass,
    handleGuidancePanelInteract,
    subscription,
    checkoutNotice,
    uploadedFile,
    isSplitting,
    mixStemsLength,
    isExporting,
    onViewPlans,
  },
  processingProps,
  mixerProps,
}: EditorMainViewProps) {
  return (
    <>
      {/* Pipeline breadcrumb — shows current workflow step */}
      <div className="flex flex-wrap items-center gap-xs text-xs text-secondary-foreground sm:text-sm">
        <span
          className={cn(
            "flex items-center gap-xs rounded-full px-sm py-1.5 border transition-all",
            !uploadedFile
              ? "border-primary-400/40 bg-primary-500/15 text-primary-200"
              : "border-border bg-muted text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              !uploadedFile ? "bg-primary-400" : "bg-secondary",
            )}
          />
          Upload
        </span>
        <span className="text-muted-foreground" aria-hidden>→</span>
        <span
          className={cn(
            "flex items-center gap-xs rounded-full px-sm py-1.5 border transition-all",
            isSplitting
              ? "border-primary-400/40 bg-primary-500/15 text-primary-200"
              : "border-border bg-muted text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              isSplitting ? "bg-primary-400 animate-pulse" : "bg-secondary",
            )}
          />
          Split
        </span>
        <span className="text-muted-foreground" aria-hidden>→</span>
        <span
          className={cn(
            "flex items-center gap-xs rounded-full px-sm py-1.5 border transition-all",
            mixStemsLength > 0 && !isExporting
              ? "border-primary-400/40 bg-primary-500/15 text-primary-200"
              : "border-border bg-muted text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              mixStemsLength > 0 ? "bg-primary-400" : "bg-secondary",
            )}
          />
          Mix & Export
        </span>
        {mixStemsLength > 0 && (
          <span className="ml-1 text-xs text-success-400/80">
            {mixStemsLength} stems ready
          </span>
        )}
      </div>

      <section className="flex flex-col gap-md">
        <div
          onPointerDown={handleGuidancePanelInteract}
          className={cn(
            "rounded-2xl border border-border bg-muted/20 px-lg py-md sm:px-lg",
            guidanceTarget === "source" && guidanceRingClass,
            processingProps.isSplitting && "splitting-scan-glow",
          )}
        >
          <SplitErrorBoundary>
            <ProcessingSettingsPanel {...processingProps} />
            {subscription.status === "inactive" && (
              <div className="mt-sm border-t border-border pt-sm">
                <PaywallBanner subscription={subscription} variant="teaser" onViewPlans={onViewPlans} />
              </div>
            )}
            {subscription.billingError && (
              <div className="mt-sm rounded-xl border border-destructive-500/30 bg-destructive-950/20 px-md py-sm text-sm text-destructive-300">
                {subscription.billingError}
              </div>
            )}
            {checkoutNotice && (
              <div className="mt-sm rounded-xl border border-primary-500/30 bg-primary-500/10 px-md py-sm text-sm text-primary-100">
                {checkoutNotice}
              </div>
            )}
          </SplitErrorBoundary>
        </div>

        <MixerWorkspace {...mixerProps} />
      </section>
    </>
  );
}
