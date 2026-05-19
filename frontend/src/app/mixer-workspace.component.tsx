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
  uploadedFile: File | null;
  onBrowseUpload: () => void;
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
  uploadedFile,
  onBrowseUpload,
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
        "glass-panel mirror-sheen rounded-[2rem] p-5 sm:p-6 overflow-visible",
        guidanceTarget === "mixer" && guidanceRingClass,
      )}
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: reduceMotion ? 0 : 0.4 }}
    >
      {/* Onboarding checklist */}
      <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-[11px] text-white/70">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
              {ENABLE_ONBOARDING_QUEST
                ? "First project quest"
                : "Getting started"}
            </span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-amber-400 transition-[width]"
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
            <span className="text-[10px] text-white/45">
              Step {onboardingSteps.filter((s) => s.done).length}{" "}
              of {onboardingSteps.length}
            </span>
          )}
        </div>
        <p className="text-[10px] text-white/45">
          Press{" "}
          <kbd className="rounded border border-white/15 bg-white/10 px-1.5 py-0.5 font-mono text-white/70">
            ?
          </kbd>{" "}
          or <span className="text-white/55">Help</span> in the
          header for keyboard shortcuts.
        </p>
        <div className="flex flex-wrap gap-2">
          {onboardingSteps.map((step) => (
            <span
              key={step.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1",
                step.done
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                  : "border-white/10 bg-white/5 text-white/60",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  step.done ? "bg-emerald-300" : "bg-white/35",
                )}
              />
              {step.label}
            </span>
          ))}
        </div>
      </div>

      {ENABLE_PROGRESS_WIDGET && (
        <div className="mb-4">
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
          <div className="mb-4 rounded-2xl border border-amber-400/50 bg-amber-500/15 px-3 py-2 text-sm text-amber-100">
            <p className="mb-1 font-semibold">
              Nice — you just finished your first stem.
            </p>
            <p className="mb-2 text-amber-100/85">
              If you&apos;ll be doing this more than a couple of
              times a month, a plan usually pays for itself.
            </p>
            <button
              type="button"
              onClick={() => setActiveView("pricing")}
              className="rounded-full bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-300"
            >
              See which plan fits you
            </button>
          </div>
        )}

      {uploadedFile == null && mixStemsLength === 0 && (
        <div className="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-black/40 relative">
          {/* Overlay to blur and block interaction while providing CTA */}
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px]">
            <div className="rounded-[2rem] border border-amber-400/30 bg-amber-500/10 px-8 py-6 text-center shadow-[0_0_40px_rgba(255,140,80,0.15)] backdrop-blur-md">
              <h3 className="mb-2 text-xl font-bold text-white">
                Your studio awaits
              </h3>
              <p className="mb-6 max-w-xs text-sm text-amber-50/70">
                Upload a track to automatically split it into stems, then mix and master your creation.
              </p>
              <button
                type="button"
                onClick={onBrowseUpload}
                className="fire-button inline-flex h-12 w-full items-center justify-center rounded-xl px-6 text-sm font-bold shadow-lg transition-transform hover:scale-105 active:scale-95"
              >
                Upload a track
              </button>
            </div>
          </div>

          {/* Ghost UI Content */}
          <div className="px-6 py-5 opacity-40 pointer-events-none select-none filter grayscale-[30%]">
            <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-white/10" />
                <div className="space-y-2">
                  <div className="h-3 w-32 rounded bg-white/20" />
                  <div className="h-2 w-24 rounded bg-white/10" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="h-8 w-8 rounded-lg border border-white/10 bg-white/5" />
                <div className="h-8 w-24 rounded-lg border border-white/10 bg-white/5" />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                { color: "amber", delay: "0s", hideClass: "" },
                { color: "sky", delay: "0.1s", hideClass: "hidden md:flex" },
                { color: "rose", delay: "0.2s", hideClass: "hidden xl:flex" },
                { color: "emerald", delay: "0.3s", hideClass: "hidden xl:flex" },
              ].map((strip, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "ghost-mixer-strip flex flex-col gap-4 rounded-xl border border-white/5 bg-white/5 p-4",
                    strip.hideClass
                  )}
                  style={{ animationDelay: strip.delay }}
                >
                  <div className="flex justify-between items-center">
                    <div className={`h-4 w-16 rounded bg-${strip.color}-400/40`} />
                    <div className="h-4 w-4 rounded-full bg-white/20" />
                  </div>
                  <div className="h-24 w-full rounded bg-white/10" />
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <div className="h-2 w-6 rounded bg-white/20" />
                      <div className="h-2 w-6 rounded bg-white/20" />
                    </div>
                    <div className="h-1.5 w-full rounded bg-white/10" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Suspense
        fallback={
          <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="space-y-2">
                <Skeleton className="h-3 w-32 bg-white/10" />
                <Skeleton className="h-4 w-40 bg-white/10" />
              </div>
              <Skeleton className="h-9 w-24 bg-white/10" />
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={idx}
                  className="space-y-2 rounded-xl border border-white/5 bg-white/[0.03] p-3"
                >
                  <Skeleton className="h-3 w-24 bg-white/10" />
                  <Skeleton className="h-24 w-full bg-white/5" />
                  <Skeleton className="h-2 w-20 bg-white/10" />
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
          className="mt-3 text-xs text-white/70"
          role="status"
          aria-live="polite"
        >
          {exportCompareSummary}
        </p>
      )}
      {undoToast && (
        <p
          className="mt-2 text-xs text-amber-300/80"
          role="status"
          aria-live="polite"
        >
          {undoToast}
        </p>
      )}
    </motion.div>
  );
}
