import type { ComponentProps } from "react";

import type { GuidanceTarget } from "../hooks/useGuidanceSystem";
import { cn } from "../utils/cn";
import { SplitErrorBoundary } from "../components/ErrorBoundary";
import { ProcessingSettingsPanel } from "../components/ProcessingSettingsPanel";
import type { UseSubscriptionResult } from "../hooks/useSubscription";
import { PanelHeader } from "../components/ui";
import { MixerWorkspace } from "./mixer-workspace.component";

export interface EditorChromeProps {
  guidanceTarget: GuidanceTarget;
  guidanceRingClass: string;
  handleGuidancePanelInteract: React.PointerEventHandler<HTMLDivElement>;
  subscription: UseSubscriptionResult;
  checkoutNotice: string | null;
  uploadedFile: File | null;
  isSplitting: boolean;
  mixStemsLength: number;
  isExporting: boolean;
}

export type EditorMixerWorkspaceProps = ComponentProps<typeof MixerWorkspace>;

export type EditorProcessingProps = ComponentProps<
  typeof ProcessingSettingsPanel
>;

export interface EditorMainViewProps {
  reduceMotion?: boolean;
  chrome: EditorChromeProps;
  processingProps: EditorProcessingProps;
  mixerProps: EditorMixerWorkspaceProps;
}

/** Processing rail + mixer workspace inside a single forge workspace panel. */
export function EditorMainView({
  chrome: {
    guidanceTarget,
    guidanceRingClass,
    handleGuidancePanelInteract,
    subscription,
    checkoutNotice,
    mixStemsLength,
    isSplitting,
  },
  processingProps,
  mixerProps,
}: EditorMainViewProps) {
  const mixerReady = mixStemsLength > 0;

  const sourceSection = (
    <section
      aria-label="Source"
      onPointerDown={handleGuidancePanelInteract}
      className={cn(
        guidanceTarget === "source" && guidanceRingClass,
        isSplitting && "splitting-scan-glow",
      )}
    >
      <PanelHeader
        title="Source"
        subtitle={
          mixerReady
            ? "Change upload or split settings"
            : "Upload audio or load existing stems"
        }
      />
      <div className="px-md pb-md sm:px-lg">
        <SplitErrorBoundary>
          <ProcessingSettingsPanel {...processingProps} />
          {subscription.billingError ? (
            <div
              className="mt-sm rounded-xl border border-destructive-500/30 bg-destructive-950/20 px-md py-sm text-sm text-destructive-300"
              role="alert"
            >
              {subscription.billingError}
            </div>
          ) : null}
          {checkoutNotice ? (
            <div className="mt-sm rounded-xl border border-primary-500/30 bg-primary-500/10 px-md py-sm text-sm text-primary-100">
              {checkoutNotice}
            </div>
          ) : null}
        </SplitErrorBoundary>
      </div>
    </section>
  );

  const timelineSection = (
    <section
      aria-label="Timeline"
      className={cn(
        "border-t border-border/50",
        guidanceTarget === "mixer" && guidanceRingClass,
      )}
      onPointerDown={mixerProps.onPointerDownMixer}
    >
      <PanelHeader
        title="Timeline"
        subtitle={
          mixerReady
            ? `${mixStemsLength} stems in the mix`
            : "Split or load stems to open the mixer"
        }
      />
      <div className="px-md pb-md sm:px-lg">
        <MixerWorkspace {...mixerProps} embedded />
      </div>
    </section>
  );

  return (
    <div className="glass-panel ui-panel overflow-hidden rounded-2xl">
      {mixerReady ? (
        <>
          {timelineSection}
          <details className="group border-t border-border/50">
            <summary className="cursor-pointer list-none px-md py-sm text-sm font-medium text-secondary-foreground transition hover:text-foreground sm:px-lg [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-xs">
                Source and upload options
                <span className="text-muted-foreground group-open:rotate-90 transition-transform">
                  ›
                </span>
              </span>
            </summary>
            <div className="border-t border-border/40">{sourceSection}</div>
          </details>
        </>
      ) : (
        <>
          {sourceSection}
          {timelineSection}
        </>
      )}
    </div>
  );
}
