import { Suspense, lazy } from "react";
import type { MixerPreset } from "../components/MixerPresetsModal";
import type { QueueItem } from "../hooks/useBatchQueue";
import { ErrorBoundary } from "../components/ErrorBoundary";
import type { ModalKey } from "../hooks/useUiModals";
import type { SplitQuality } from "../api";
import type { AppState } from "../store/appStore";
import type { MixerState, TrimState } from "../types";
import type { ExportOptions } from "../components/ExportOptionsModal";
import type { StemResult } from "../types";

const importHelpModal = () => import("../components/HelpModal");
const importExportOptionsModal = () => import("../components/ExportOptionsModal");
const importMixerPresetsModal = () => import("../components/MixerPresetsModal");
const importBatchQueue = () => import("../components/BatchQueue");

const HelpModal = lazy(() =>
  importHelpModal().then((m) => ({ default: m.HelpModal })),
);
const ExportOptionsModal = lazy(() =>
  importExportOptionsModal().then((m) => ({ default: m.ExportOptionsModal })),
);
const MixerPresetsModal = lazy(() =>
  importMixerPresetsModal().then((m) => ({ default: m.MixerPresetsModal })),
);
const BatchQueue = lazy(() =>
  importBatchQueue().then((m) => ({ default: m.BatchQueue })),
);

interface LazyModalLayerProps {
  showHelpModal: boolean;
  showExportModal: boolean;
  showPresetsModal: boolean;
  closeModal: (key: ModalKey) => void;
  handleExportFromModal: (opts: ExportOptions) => void;
  isExporting: boolean;
  mixStemsLength: number;
  exportAllowStemBundleTargets: boolean;
  isSample: boolean;
  exportTrackDurationSec: number;
  splitJobId: string | null;
  handleLoadPreset: (preset: MixerPreset) => void;
  mixerState: Record<string, MixerState>;
  trimMap: Record<string, TrimState>;
  mutedStems: Record<string, boolean>;
  pitchMap: Record<string, number>;
  timeStretchMap: Record<string, number>;
  fadeMap: Record<string, { fadeIn: number; fadeOut: number }>;
  batchQueue: QueueItem[];
  batchQueueExpanded: boolean;
  setBatchQueueExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  removeFromBatchQueue: (id: string) => void;
  clearCompletedFromQueue: () => void;
  canUseBatchQueue: boolean;
  processNextInQueue: (
    stemCount: 2 | 4,
    splitQuality: SplitQuality,
    onStemsReady: (stems: StemResult[]) => void,
    onError: (msg: string) => void,
    onJobId?: (jobId: string) => void,
  ) => Promise<void>;
  canSplitFourStems: boolean;
  splitQuality: SplitQuality;
  setUploadState: AppState["setUploadState"];
  setSplitError: (msg: string | null) => void;
  /** Clear decoded buffers and waveforms before batch replaces split results. */
  onResetStemMediaState?: () => void;
}

export function LazyModalLayer({
  showHelpModal,
  showExportModal,
  showPresetsModal,
  closeModal,
  handleExportFromModal,
  isExporting,
  mixStemsLength,
  exportAllowStemBundleTargets,
  isSample,
  exportTrackDurationSec,
  splitJobId,
  handleLoadPreset,
  mixerState,
  trimMap,
  mutedStems,
  pitchMap,
  timeStretchMap,
  fadeMap,
  batchQueue,
  batchQueueExpanded,
  setBatchQueueExpanded,
  removeFromBatchQueue,
  clearCompletedFromQueue,
  canUseBatchQueue,
  processNextInQueue,
  canSplitFourStems,
  splitQuality,
  setUploadState,
  setSplitError,
  onResetStemMediaState,
}: LazyModalLayerProps) {
  return (
    <>
      <ErrorBoundary fallback={null}>
        {showHelpModal ? (
          <Suspense fallback={null}>
            <HelpModal isOpen={showHelpModal} onClose={() => closeModal("help")} />
          </Suspense>
        ) : null}
      </ErrorBoundary>

      <ErrorBoundary fallback={null}>
        {showExportModal ? (
          <Suspense fallback={null}>
            <ExportOptionsModal
              isOpen={showExportModal}
              onClose={() => closeModal("export")}
              onExport={handleExportFromModal}
              isExporting={isExporting}
              stemCount={mixStemsLength}
              allowStemBundleTargets={exportAllowStemBundleTargets}
              isSample={isSample}
              trackDurationSec={exportTrackDurationSec}
              splitJobId={splitJobId}
            />
          </Suspense>
        ) : null}
      </ErrorBoundary>

      <ErrorBoundary fallback={null}>
        {showPresetsModal ? (
          <Suspense fallback={null}>
            <MixerPresetsModal
              isOpen={showPresetsModal}
              onClose={() => closeModal("presets")}
              onLoadPreset={handleLoadPreset}
              currentMixerState={mixerState}
              currentTrimMap={trimMap}
              currentMutedStems={mutedStems}
              currentPitchMap={pitchMap}
              currentTimeStretchMap={timeStretchMap}
              currentFadeMap={fadeMap}
            />
          </Suspense>
        ) : null}
      </ErrorBoundary>

      {batchQueue.length > 0 && (
        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <BatchQueue
              items={batchQueue}
              isExpanded={batchQueueExpanded}
              onToggleExpand={() => setBatchQueueExpanded((e) => !e)}
              onRemoveItem={removeFromBatchQueue}
              onClearCompleted={clearCompletedFromQueue}
              allowProcess={canUseBatchQueue}
              onProcessQueue={() =>
                void processNextInQueue(
                  canSplitFourStems ? 4 : 2,
                  splitQuality,
                  (stems) => {
                    onResetStemMediaState?.();
                    setUploadState((prev) => ({
                      ...prev,
                      splitResultStems: stems,
                    }));
                  },
                  setSplitError,
                  (id) =>
                    setUploadState((prev) => ({ ...prev, splitJobId: id })),
                )
              }
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  );
}
