import { Suspense, lazy, type RefObject } from "react";
import { motion } from "framer-motion";
import { cn } from "../utils/cn";
import { Skeleton } from "../components/ui/skeleton";
import { ProgressWidget } from "../components/ProgressWidget";
import type { StemDefinition } from "../types";
import type { StemEditorState } from "../stem-editor-state";
import type { UseSubscriptionResult } from "../hooks/useSubscription";
import type { SeekPhase } from "../types/playbackSeek";
import type { BeatGridMetadata } from "../api";
import {
  ENABLE_ONBOARDING_QUEST,
  ENABLE_PROGRESS_WIDGET,
} from "../config/uiFlags";

type OnboardingStep = { id: number; label: string; done: boolean };
type StemWithOptionalUrl = StemDefinition & { url?: string };

interface MixerWorkspaceProps {
  mixerSectionRef: RefObject<HTMLDivElement | null>;
  onPointerDownMixer: React.PointerEventHandler<HTMLDivElement>;
  guidanceTarget: string | null;
  guidanceRingClass: string;
  reduceMotion: boolean;
  onboardingSteps: OnboardingStep[];
  hasCompletedFirstExport: boolean;
  subscription: Pick<UseSubscriptionResult, "status" | "plan">;
  setActiveView: (view: "editor" | "pricing") => void;
  splitResultStemsLength: number;
  mixStemsLength: number;
  /* MixerPanel props */
  mixStemCount: number;
  splitStemCount?: 2 | 4 | null;
  isPlayingMix: boolean;
  onPlayStop: () => void;
  onStopMix: () => void;
  onSeekMix: (pct: number, opts?: { phase?: SeekPhase }) => void;
  isExporting: boolean;
  onExport: () => void;
  isComparingExport: boolean;
  onCompareExport?: () => void;
  onResetLevels: () => void;
  onResetSingleStem?: (stemId: string) => void;
  hasStemBuffers: boolean;
  stems: StemWithOptionalUrl[];
  waveforms: Record<string, number[]>;
  durations: Record<string, number>;
  stemStates: Record<string, StemEditorState>;
  getPlayheadPosition: () => number;
  subscribePlayheadPosition: (listener: () => void) => () => void;
  isLoadingStems: boolean;
  loadingError: string | null;
  onRetryLoadStems?: () => void;
  activeStemId: string | undefined;
  onActiveStemChange: (stemId: string) => void;
  onStemStateChange: (stemId: string, patch: Partial<StemEditorState>) => void;
  onPreviewStem: (stemId: string) => void;
  playingStemId: string | null;
  loadingPreviewStemId: string | null;
  getMasterAnalyserTimeDomainData: () => Uint8Array | null;
  getMasterAnalyserTimeDomainDataLeft: () => Uint8Array | null;
  getMasterAnalyserTimeDomainDataRight: () => Uint8Array | null;
  getMasterAnalyserFrequencyData: () => Uint8Array | null;
  getStemAnalyserTimeDomainData: (stemId: string) => Uint8Array | null;
  masterVolume: number;
  onMasterVolumeChange: (value: number) => void;
  masterLimiterEnabled: boolean;
  onMasterLimiterEnabledChange: (enabled: boolean) => void;
  /** Optional beat-grid metadata from backend BPM analysis. */
  beatGrid?: BeatGridMetadata | null;
  /** Whether loop playback is enabled. */
  loopEnabled?: boolean;
  /** Callback to toggle loop playback. */
  onLoopToggle?: (enabled: boolean) => void;
  /* Status toasts */
  exportCompareSummary: string | null;
  undoToast: string | null;
}

const MixerPanel = lazy(
  () => import("../components/mixer-panel.component").then((m) => ({ default: m.MixerPanel })),
);

export function MixerWorkspace({
  mixerSectionRef,
  onPointerDownMixer,
  guidanceTarget,
  guidanceRingClass,
  reduceMotion,
  onboardingSteps,
  hasCompletedFirstExport,
  subscription,
  setActiveView,
  splitResultStemsLength,
  mixStemsLength,
  mixStemCount,
  splitStemCount = null,
  isPlayingMix,
  onPlayStop,
  onStopMix,
  onSeekMix,
  isExporting,
  onExport,
  isComparingExport,
  onCompareExport,
  onResetLevels,
  onResetSingleStem,
  hasStemBuffers,
  stems,
  waveforms,
  durations,
  stemStates,
  getPlayheadPosition,
  subscribePlayheadPosition,
  isLoadingStems,
  loadingError,
  onRetryLoadStems,
  activeStemId,
  onActiveStemChange,
  onStemStateChange,
  onPreviewStem,
  playingStemId,
  loadingPreviewStemId,
  getMasterAnalyserTimeDomainData,
  getMasterAnalyserTimeDomainDataLeft,
  getMasterAnalyserTimeDomainDataRight,
  getMasterAnalyserFrequencyData,
  getStemAnalyserTimeDomainData,
  masterVolume,
  onMasterVolumeChange,
  masterLimiterEnabled,
  onMasterLimiterEnabledChange,
  beatGrid,
  loopEnabled,
  onLoopToggle,
  exportCompareSummary,
  undoToast,
}: MixerWorkspaceProps) {
  return (
    <motion.div
      ref={mixerSectionRef}
      onPointerDown={onPointerDownMixer}
      className={cn(
        "rounded-2xl border border-border bg-muted/20 p-lg sm:p-lg overflow-visible",
        guidanceTarget === "mixer" && guidanceRingClass,
      )}
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: reduceMotion ? 0 : 0.4 }}
    >
      {/* Onboarding checklist */}
      <div className="mb-md flex flex-col gap-xs rounded-2xl border border-border bg-muted px-sm py-xs text-[11px] text-secondary-foreground">
        <div className="flex flex-wrap items-center justify-between gap-xs">
          <div className="flex items-center gap-xs">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {ENABLE_ONBOARDING_QUEST
                ? "First project quest"
                : "Getting started"}
            </span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary-400 transition-[width]"
                style={{
                  width: `${
                    (onboardingSteps.filter((s) => s.done).length /
                      onboardingSteps.length) *
                    100
                  }%`,
                }}
              />
            </div>
          </div>
          {ENABLE_ONBOARDING_QUEST && (
            <span className="text-[10px] text-muted-foreground">
              Step {onboardingSteps.filter((s) => s.done).length}{" "}
              of {onboardingSteps.length}
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Press{" "}
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-secondary-foreground">
            ?
          </kbd>{" "}
          or <span className="text-muted-foreground">Help</span> in the
          header for keyboard shortcuts.
        </p>
        <div className="flex flex-wrap gap-xs">
          {onboardingSteps.map((step) => (
            <span
              key={step.id}
              className={cn(
                "inline-flex items-center gap-2xs rounded-full border px-sm py-1",
                step.done
                  ? "border-success-400/40 bg-success-500/15 text-success-100"
                  : "border-border bg-muted text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  step.done ? "bg-success-300" : "bg-secondary",
                )}
              />
              {step.label}
            </span>
          ))}
        </div>
      </div>

      {ENABLE_PROGRESS_WIDGET && (
        <div className="mb-md">
          <ProgressWidget
            milestones={[
              {
                id: "first-split",
                label: "First split",
                done: splitResultStemsLength > 0,
              },
              {
                id: "first-export",
                label: "First export",
                done: hasCompletedFirstExport,
              },
              {
                id: "three-projects",
                label: "3 projects this week",
                done: mixStemsLength >= 3,
              },
            ]}
            onViewPlans={
              subscription.status === "inactive"
                ? () => setActiveView("pricing")
                : undefined
            }
          />
        </div>
      )}

      {ENABLE_ONBOARDING_QUEST &&
        hasCompletedFirstExport &&
        subscription.status === "inactive" && (
          <div className="mb-md rounded-2xl border border-primary-400/50 bg-primary-500/15 px-sm py-xs text-sm text-primary-100">
            <p className="mb-1 font-semibold">
              Nice — you just finished your first stem.
            </p>
            <p className="mb-xs text-primary-100/85">
              If you&apos;ll be doing this more than a couple of
              times a month, a plan usually pays for itself.
            </p>
            <button
              type="button"
              onClick={() => setActiveView("pricing")}
              className="rounded-full bg-primary-400 px-sm py-1.5 text-xs font-semibold text-black hover:bg-primary-300"
            >
              See which plan fits you
            </button>
          </div>
        )}

      <Suspense
        fallback={
          <div className="rounded-2xl border border-border bg-secondary px-md py-lg">
            <div className="mb-md flex items-center justify-between gap-md">
              <div className="space-y-xs">
                <Skeleton className="h-3 w-32 bg-muted" />
                <Skeleton className="h-4 w-40 bg-muted" />
              </div>
              <Skeleton className="h-9 w-24 bg-muted" />
            </div>
            <div className="grid gap-sm md:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={idx}
                  className="space-y-xs rounded-xl border border-border bg-muted/[0.03] p-sm"
                >
                  <Skeleton className="h-3 w-24 bg-muted" />
                  <Skeleton className="h-24 w-full bg-muted" />
                  <Skeleton className="h-2 w-20 bg-muted" />
                </div>
              ))}
            </div>
          </div>
        }
      >
        <MixerPanel
          mixStemCount={mixStemCount}
          splitStemCount={splitStemCount}
          isPlayingMix={isPlayingMix}
          onPlayStop={onPlayStop}
          onStopMix={onStopMix}
          onSeekMix={onSeekMix}
          isExporting={isExporting}
          onExport={onExport}
          isComparingExport={isComparingExport}
          onCompareExport={onCompareExport}
          onResetLevels={onResetLevels}
          onResetSingleStem={onResetSingleStem}
          hasStemBuffers={hasStemBuffers}
          stems={stems}
          waveforms={waveforms}
          durations={durations}
          stemStates={stemStates}
          getPlayheadPosition={getPlayheadPosition}
          subscribePlayheadPosition={subscribePlayheadPosition}
          isLoadingStems={isLoadingStems}
          loadingError={loadingError}
          onRetryLoadStems={onRetryLoadStems}
          activeStemId={activeStemId ?? ""}
          onActiveStemChange={onActiveStemChange}
          onStemStateChange={onStemStateChange}
          onPreviewStem={onPreviewStem}
          playingStemId={playingStemId}
          loadingPreviewStemId={loadingPreviewStemId}
          getMasterAnalyserTimeDomainData={getMasterAnalyserTimeDomainData}
          getMasterAnalyserTimeDomainDataLeft={
            getMasterAnalyserTimeDomainDataLeft
          }
          getMasterAnalyserTimeDomainDataRight={
            getMasterAnalyserTimeDomainDataRight
          }
          getMasterAnalyserFrequencyData={getMasterAnalyserFrequencyData}
          getStemAnalyserTimeDomainData={getStemAnalyserTimeDomainData}
          masterVolume={masterVolume}
          onMasterVolumeChange={onMasterVolumeChange}
          masterLimiterEnabled={masterLimiterEnabled}
          onMasterLimiterEnabledChange={onMasterLimiterEnabledChange}
          beatGrid={beatGrid}
          loopEnabled={loopEnabled}
          onLoopToggle={onLoopToggle}
        />
      </Suspense>
      {exportCompareSummary && (
        <p
          className="mt-sm text-xs text-secondary-foreground"
          role="status"
          aria-live="polite"
        >
          {exportCompareSummary}
        </p>
      )}
      {undoToast && (
        <p
          className="mt-xs text-xs text-primary-300/80"
          role="status"
          aria-live="polite"
        >
          {undoToast}
        </p>
      )}
    </motion.div>
  );
}
