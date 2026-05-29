import { Suspense, lazy, type RefObject } from "react";
import { cn } from "../utils/cn";
import { Skeleton } from "../components/ui/skeleton";
import type { UseSubscriptionResult } from "../hooks/useSubscription";
import { useAudio } from "../contexts/AudioContext";
import { useAudioContext } from "../hooks/audio";
import { useWorkflow } from "../contexts/WorkflowContext";
import { useAppStore } from "../store/appStore";
import { useUiStore } from "../store/uiStore";
import { useResolvedStems } from "../hooks/workflow/useResolvedStems";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { useMixRecorder } from "../hooks/audio/useMixRecorder";
import { downloadBlob } from "../utils/downloadHelper";

interface MixerWorkspaceProps {
  /** When true, omit outer card shell (parent provides workspace panel). */
  embedded?: boolean;
  mixerSectionRef: RefObject<HTMLDivElement | null>;
  onPointerDownMixer: React.PointerEventHandler<HTMLDivElement>;
  guidanceTarget: string | null;
  guidanceRingClass: string;
  subscription: Pick<UseSubscriptionResult, "status" | "plan">;
  setActiveView: (view: "editor" | "pricing") => void;
  hasCompletedFirstExport: boolean;

  onResetLevels: () => void;
  onResetSingleStem?: (stemId: string) => void;
  isLoadingStems: boolean;
  loadingError: string | null;
  onRetryLoadStems?: () => void;
  stemWaveforms: Record<string, number[]>;
  activeStemId: string | undefined;
  onActiveStemChange: (stemId: string) => void;
  onStemStateChange: (stemId: string, patch: Partial<import("../stem-editor-state").StemEditorState>) => void;
  onPreviewStem: (stemId: string) => void;
  onExport: () => void;
  isExporting: boolean;
  isComparingExport: boolean;
  onCompareExport?: () => void;
  exportCompareSummary: string | null;
  onLoadGenrePreset?: (preset: import("../components/MixerPresetsModal").MixerPreset) => void;
}

const MixerPanel = lazy(
  () => import("../components/mixer-panel.component").then((m) => ({ default: m.MixerPanel })),
);

export function MixerWorkspace({
  embedded = false,
  mixerSectionRef,
  onPointerDownMixer,
  guidanceTarget,
  guidanceRingClass,
  onResetLevels,
  onResetSingleStem,
  isLoadingStems,
  loadingError,
  onRetryLoadStems,
  stemWaveforms,
  activeStemId,
  onActiveStemChange,
  onStemStateChange,
  onPreviewStem,
  onExport,
  isExporting,
  isComparingExport,
  onCompareExport,
  exportCompareSummary,
  onLoadGenrePreset,
}: MixerWorkspaceProps) {
  const audio = useAudio();
  const { stemStates, stemBuffers } = useWorkflow();
  const splitResultStems = useAppStore((s) => s.splitResultStems);
  const beatGrid = useAppStore((s) => s.beatGrid);
  const { undoToast } = useUiStore();
  const { mixStems, visibleStems } = useResolvedStems();
  const { getMasterRecordingStream } = useAudioContext();
  const {
    isRecording,
    duration: recordingDuration,
    startRecording,
    stopRecording,
  } = useMixRecorder({
    onRecordingComplete: (blob, filename) => {
      void downloadBlob(blob, filename);
    },
  });

  const handleStartRecording = () => {
    const stream = getMasterRecordingStream();
    if (stream) startRecording(stream);
  };

  const inner = (
    <>
      <ErrorBoundary
        fallback={
          <p className="text-sm text-destructive-300">
            Mixer failed to render. Please reload and try again.
          </p>
        }
      >
        <Suspense
          fallback={
            <div className="rounded-xl border border-border/60 bg-chrome/30 px-md py-lg">
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
            mixStemCount={mixStems.length}
            isPlayingMix={audio.isPlayingMix}
            onPlayStop={() =>
              audio.handlePlayMix(splitResultStems, stemStates, stemBuffers)
            }
            onStopMix={audio.handleStopMix}
            onSeekMix={audio.handleSeekMix}
            isExporting={isExporting}
            onExport={onExport}
            isComparingExport={isComparingExport}
            onCompareExport={onCompareExport}
            onResetLevels={onResetLevels}
            onResetSingleStem={onResetSingleStem}
            hasStemBuffers={Object.keys(stemBuffers).length > 0}
            stems={visibleStems as any}
            waveforms={stemWaveforms}
            durations={Object.fromEntries(
              visibleStems.map((s) => [s.id, stemBuffers[s.id]?.duration ?? 0]),
            )}
            stemStates={stemStates}
            getPlayheadPosition={audio.getPlayheadPosition}
            subscribePlayheadPosition={audio.subscribePlayheadPosition}
            isLoadingStems={isLoadingStems}
            loadingError={loadingError}
            onRetryLoadStems={onRetryLoadStems}
            activeStemId={activeStemId ?? ""}
            onActiveStemChange={onActiveStemChange}
            onStemStateChange={onStemStateChange}
            onPreviewStem={onPreviewStem}
            playingStemId={audio.playingStem}
            loadingPreviewStemId={audio.loadingPreviewStemId}
            getMasterAnalyserTimeDomainData={audio.getMasterAnalyserTimeDomainData}
            getMasterAnalyserTimeDomainDataLeft={
              audio.getMasterAnalyserTimeDomainDataLeft
            }
            getMasterAnalyserTimeDomainDataRight={
              audio.getMasterAnalyserTimeDomainDataRight
            }
            getMasterAnalyserFrequencyData={audio.getMasterAnalyserFrequencyData}
            getStemAnalyserTimeDomainData={audio.getStemAnalyserTimeDomainData}
            masterVolume={audio.masterVolume}
            onMasterVolumeChange={audio.setMasterVolume}
            masterLimiterEnabled={audio.masterLimiterEnabled}
            onMasterLimiterEnabledChange={audio.setMasterLimiterEnabled}
            beatGrid={beatGrid}
            loopEnabled={audio.loopEnabled}
            onLoopToggle={audio.setLoopEnabled}
            isRecording={isRecording}
            recordingDuration={recordingDuration}
            onStartRecording={handleStartRecording}
            onStopRecording={stopRecording}
            onLoadGenrePreset={onLoadGenrePreset}
          />
        </Suspense>
      </ErrorBoundary>
      {exportCompareSummary ? (
        <p
          className="mt-sm text-xs text-secondary-foreground"
          role="status"
          aria-live="polite"
        >
          {exportCompareSummary}
        </p>
      ) : null}
      {undoToast ? (
        <p
          className="mt-xs text-xs text-primary-300/80"
          role="status"
          aria-live="polite"
        >
          {undoToast}
        </p>
      ) : null}
    </>
  );

  if (embedded) {
    return (
      <div
        ref={mixerSectionRef}
        tabIndex={-1}
        className={cn(guidanceTarget === "mixer" && guidanceRingClass)}
      >
        {inner}
      </div>
    );
  }

  return (
    <div
      ref={mixerSectionRef}
      onPointerDown={onPointerDownMixer}
      tabIndex={-1}
      aria-label="Mixer workspace"
      className={cn(
        "glass-panel overflow-visible rounded-2xl p-lg sm:p-lg",
        guidanceTarget === "mixer" && guidanceRingClass,
      )}
    >
      {inner}
    </div>
  );
}
