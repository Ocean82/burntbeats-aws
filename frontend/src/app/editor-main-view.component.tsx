import { useState, type ComponentProps } from "react";

import type { GuidanceTarget } from "../hooks/useGuidanceSystem";
import { cn } from "../utils/cn";
import { SplitErrorBoundary } from "../components/ErrorBoundary";
import { ProcessingSettingsPanel } from "../components/ProcessingSettingsPanel";
import type { UseSubscriptionResult } from "../hooks/useSubscription";
import { PanelHeader } from "../components/ui";
import { MixerWorkspace } from "./mixer-workspace.component";
import { ConfigurePhasePanel } from "../components/configure-phase/ConfigurePhasePanel";
import { MixPhasePanel } from "../components/mix-phase/MixPhasePanel";
import type { StemEditorState } from "../stem-editor-state";
import type { StemDefinition } from "../types";

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
  visibleStems: Array<StemDefinition & { url?: string }>;
  stemStates: Record<string, StemEditorState>;
  onConfigureStemChange: (stemId: string, patch: Partial<StemEditorState>) => void;
}

type EditorPhase = "upload" | "split" | "configure" | "mix";
type SubTab = "configure" | "mix";

function useEditorPhase(chrome: EditorChromeProps): EditorPhase {
  if (chrome.mixStemsLength > 0 && !chrome.isSplitting) return "configure";
  if (chrome.isSplitting) return "split";
  if (chrome.uploadedFile) return "split";
  return "upload";
}

const PHASE_STEPS: { phase: EditorPhase; label: string }[] = [
  { phase: "upload", label: "Upload" },
  { phase: "split", label: "Split" },
  { phase: "configure", label: "Configure" },
  { phase: "mix", label: "Mix" },
];

function PhaseIndicator({
  currentPhase,
}: {
  currentPhase: EditorPhase;
}) {
  const activeIdx = PHASE_STEPS.findIndex((s) => s.phase === currentPhase);

  return (
    <nav aria-label="Workflow progress" className="flex items-center gap-0 border-b border-border/50 px-lg py-sm">
      {PHASE_STEPS.map((step, i) => {
        const isActive = i === activeIdx;
        const isComplete = i < activeIdx;
        const isFuture = i > activeIdx;

        return (
          <div key={step.phase} className="flex items-center">
            {i > 0 && (
              <div
                className={cn(
                  "mx-2 h-px w-8",
                  isComplete || isActive ? "bg-primary-500/50" : "bg-white/10",
                )}
              />
            )}
            <span
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium transition-colors",
                isActive && "text-primary-300",
                isComplete && "text-success-400",
                isFuture && "text-muted-foreground/50",
              )}
            >
              {isComplete ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="8" cy="8" r="8" />
                  <path d="M5 8.5l2 2 4-4" stroke="#000" strokeWidth="1.5" fill="none" />
                </svg>
              ) : (
                <span
                  className={cn(
                    "flex h-3.5 w-3.5 items-center justify-center rounded-full text-[10px] font-bold",
                    isActive ? "bg-primary-500 text-primary-foreground" : "bg-white/10 text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
              )}
              <span className="hidden sm:inline">{step.label}</span>
            </span>
          </div>
        );
      })}
    </nav>
  );
}

/** Processing rail + mixer workspace inside a single forge workspace panel. */
export function EditorMainView({
  chrome: {
    guidanceTarget,
    guidanceRingClass,
    handleGuidancePanelInteract,
    subscription,
    checkoutNotice,
    uploadedFile,
    mixStemsLength,
    isSplitting,
  },
  processingProps,
  mixerProps,
  visibleStems,
  stemStates,
  onConfigureStemChange,
}: EditorMainViewProps) {
  const chromeForPhase: EditorChromeProps = {
    guidanceTarget,
    guidanceRingClass,
    handleGuidancePanelInteract,
    subscription,
    checkoutNotice,
    uploadedFile,
    mixStemsLength,
    isSplitting,
    isExporting: false,
  };
  const currentPhase = useEditorPhase(chromeForPhase);

  const [subTab, setSubTab] = useState<SubTab>("configure");

  const showSubTabs = currentPhase === "configure" || currentPhase === "mix";

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
          mixStemsLength > 0
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
          mixStemsLength > 0
            ? `${mixStemsLength} stems in the mix`
            : "Split or load stems to open the mixer"
        }
      />
      <div className="px-md pb-md sm:px-lg">
        <MixerWorkspace {...mixerProps} embedded />
      </div>
    </section>
  );

  const configureContent = (
    <ConfigurePhasePanel
      visibleStems={visibleStems}
      stemStates={stemStates}
      onStemStateChange={onConfigureStemChange}
    />
  );

  return (
    <div className="glass-panel ui-panel overflow-hidden rounded-2xl">
      <PhaseIndicator currentPhase={currentPhase} />

      {(currentPhase === "upload" || currentPhase === "split") && (
        <>
          {sourceSection}
          {mixStemsLength > 0 ? timelineSection : null}
        </>
      )}

      {showSubTabs && (
        <div className="flex border-b border-border/50">
          <button
            type="button"
            onClick={() => setSubTab("configure")}
            className={cn(
              "flex-1 px-lg py-2.5 text-sm font-medium transition-colors",
              subTab === "configure"
                ? "border-b-2 border-primary-500 text-primary-300"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Configure
          </button>
          <button
            type="button"
            onClick={() => setSubTab("mix")}
            className={cn(
              "flex-1 px-lg py-2.5 text-sm font-medium transition-colors",
              subTab === "mix"
                ? "border-b-2 border-primary-500 text-primary-300"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Mix
          </button>
        </div>
      )}

      {subTab === "configure" && showSubTabs && configureContent}

      {subTab === "mix" && showSubTabs && (
        <MixPhasePanel stems={visibleStems} timeline={timelineSection} />
      )}
    </div>
  );
}
