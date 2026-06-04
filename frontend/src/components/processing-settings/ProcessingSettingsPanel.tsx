import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { collapseMotion } from "../../motion/presets";
import { Music2, Settings2, RotateCcw } from "lucide-react";
import { formatUploadMeta } from "../../utils/formatFileMeta";
import { AUDIO_INPUT_ACCEPT } from "../../config";
import type { ProcessingSettingsPanelProps } from "./types";
import { useProcessingSettingsData } from "./useProcessingSettingsData";
import { UploadDropZone } from "./UploadDropZone";
import { LoadStemsZone } from "./LoadStemsZone";
import { QualitySelector } from "./QualitySelector";
import { SplitIntentQuickActions } from "./SplitIntentQuickActions";
import {
  SplitIntentAdvanced,
  advancedSelectionToIntent,
} from "./SplitIntentAdvanced";
import {
  FullSeparationOptions,
  fullSeparationIntent,
} from "./FullSeparationOptions";
import type { SplitIntent, SplitTarget } from "@shared/types";
import {
  DEFAULT_SPLIT_INTENT,
  withIntentQuality,
} from "../../utils/splitIntent";
import { SplitActions } from "./SplitActions";
import { UsageTokenRow } from "./UsageTokenRow";
import { SplitErrorAlert } from "./SplitErrorAlert";
import { NewSplitConfirmDialog } from "./NewSplitConfirmDialog";
import { ExpandStemsAction } from "./ExpandStemsAction";
import { SharePreviewButton } from "../SharePreviewButton";
import { SegmentedControl } from "../ui/SegmentedControl";

export function ProcessingSettingsPanel({
  sourceMode,
  onSourceModeChange,
  inputRef,
  onBrowseUpload,
  onClearUpload,
  onDropUpload,
  onUploadFileInput,
  loadStemsInputRef,
  onLoadStems,
  onRemoveLoadedStem,
  onSplit,
  onNewSplit,
  onAddToQueue,
  onOpenWaitingGame,
  onExpandToFourStems,
}: ProcessingSettingsPanelProps) {
  const {
    uploadName,
    uploadedFile,
    loadedStems,
    loadedStemCount,
    quality,
    isDragging,
    onSetIsDragging,
    onQualityChange,
    stemQualityOptions,
    canSplitFourStems,
    isSplitting,
    splitProgress,
    uploadProgress,
    isUploading,
    queuePosition,
    splitElapsedSeconds,
    splitStageLabel,
    uploadDurationSec,
    splitResultStemsLength,
    splitError,
    onDismissError,
    canUseBatchQueue,
    onUpgradeToPremium,
    subscriptionInactive,
    onContinueCheckout,
    usageBalance,
    usageLoading,
    estimatedSplitTokens,
    isCollapsed,
    canExpandToFourStems,
    isExpanding,
    splitJobId,
  } = useProcessingSettingsData();
  const reduceMotion = useReducedMotion() ?? false;
  const collapse = collapseMotion(reduceMotion);
  const [splitIntent, setSplitIntent] = useState<SplitIntent>(DEFAULT_SPLIT_INTENT);
  const [advancedTargets, setAdvancedTargets] = useState<SplitTarget[]>([]);
  const [removeVocalsMode, setRemoveVocalsMode] = useState(false);
  const [fullSepMode, setFullSepMode] = useState<"2" | "4">("2");
  const [loadExpanded, setLoadExpanded] = useState(false);
  const [isSample, setIsSample] = useState(false);
  // Local override: user can re-expand the panel after auto-collapse
  const [userExpanded, setUserExpanded] = useState(false);
  const [showNewSplitConfirm, setShowNewSplitConfirm] = useState(false);

  const panelCollapsed = isCollapsed && !userExpanded;
  const collapsedMeta = formatUploadMeta({
    sizeBytes: uploadedFile?.size,
    durationSec: uploadDurationSec,
    estimatedTokens: estimatedSplitTokens,
    isSample,
  });

  // When a new split completes (isCollapsed flips true), reset the user override
  // so the panel collapses cleanly for the new result.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset derived state on dependency change
    if (isCollapsed) setUserExpanded(false);
  }, [isCollapsed]);

  const canChoosePaidQuality = stemQualityOptions !== "speed_only";

  // Safety: clamp stale persisted quality values to the current supported UI surface.
  useEffect(() => {
    const currentQuality = quality as string;
    if (currentQuality !== "speed" && currentQuality !== "quality") {
      onQualityChange("quality");
    }
  }, [quality, onQualityChange]);

  useEffect(() => {
    if (!canSplitFourStems && fullSepMode === "4")
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clamp full separation mode
      setFullSepMode("2");
  }, [canSplitFourStems, fullSepMode]);

  const resolvedSplitIntent = ((): SplitIntent => {
    const advanced = advancedSelectionToIntent(advancedTargets, removeVocalsMode);
    if (advanced && advancedTargets.length > 0) {
      return withIntentQuality(advanced, quality);
    }
    if (splitIntent.task === "full_separation") {
      return withIntentQuality(fullSeparationIntent(fullSepMode), quality);
    }
    return withIntentQuality(splitIntent, quality);
  })();

  const showUsageRow =
    !subscriptionInactive &&
    (usageLoading || usageBalance !== null || estimatedSplitTokens !== null);

  return (
    <div data-testid="processing-settings-panel">
      {/* ── Collapsed bar: shown after a split completes ── */}
      <AnimatePresence initial={false}>
        {panelCollapsed && (
          <motion.div key="collapsed-bar" {...collapse}>
            <div className="flex flex-col gap-sm rounded-xl border border-border bg-muted px-md py-sm sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-sm">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-500/15">
                  <Music2 className="h-3.5 w-3.5 text-primary-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-secondary-foreground">
                    {uploadName || "Loaded stems"}
                  </span>
                  {collapsedMeta ? (
                    <span className="mt-0.5 block truncate text-xs tabular-nums text-muted-foreground">
                      {collapsedMeta}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-xs sm:shrink-0">
                <span className="rounded-full border border-success-400/40 bg-success-500/15 px-sm py-0.5 text-meta font-semibold uppercase tracking-wide text-success-200">
                  {splitResultStemsLength} stems ready
                </span>
                {splitJobId ? (
                  <SharePreviewButton jobId={splitJobId} className="shrink-0" />
                ) : null}
                {onNewSplit ? (
                  <button
                    type="button"
                    onClick={() => setShowNewSplitConfirm(true)}
                    className="tap-feedback flex min-h-[44px] shrink-0 items-center gap-xs rounded-lg border border-destructive-400/30 bg-destructive-500/10 px-sm py-xs text-xs font-medium text-destructive-200/90 transition-[color,background-color,border-color,transform] duration-(--motion-fast) hover:border-destructive-400/50 hover:bg-destructive-500/20 hover:text-destructive-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
                    aria-label="Start a new split"
                    title="Clear current split and load a new track"
                  >
                    <RotateCcw className="h-3 w-3" />
                    New Split
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setUserExpanded(true)}
                  className="tap-feedback flex min-h-[44px] shrink-0 items-center gap-xs rounded-lg border border-border bg-muted px-sm py-xs text-xs font-medium text-muted-foreground transition-[color,background-color,border-color,transform] duration-(--motion-fast) hover:border-border hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
                  aria-label="Edit source settings"
                >
                  <Settings2 className="h-3 w-3" />
                  Edit Source
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Full panel: hidden when collapsed ── */}
      <AnimatePresence initial={false}>
        {!panelCollapsed && (
          <motion.div key="full-panel" {...collapse}>
      {subscriptionInactive && sourceMode === "split" && !isSample && (
        <div className="mb-sm rounded-xl border border-primary-400/35 bg-primary-500/10 px-md py-sm text-sm leading-relaxed text-primary-100/95">
          <p>
            <span className="font-semibold text-primary-50">
              Active plan required to split full tracks.
            </span>{" "}
            Continue to secure checkout, or enable{" "}
            <span className="font-semibold text-primary-200">Try for free</span>{" "}
            in the split controls below.
          </p>
          <div className="mt-xs">
            <button
              type="button"
              onClick={onContinueCheckout}
              className="ghost-button tap-feedback min-h-[44px] rounded-lg border border-primary-300/30 px-sm py-xs text-xs font-semibold text-primary-100 transition-[color,transform] duration-(--motion-fast) hover:border-primary-200/50 hover:text-primary-50 focus-visible:outline-none"
            >
              Continue to secure checkout
            </button>
          </div>
        </div>
      )}

      <SegmentedControl
        testId="source-mode-toggle"
        aria-label="Source mode"
        value={sourceMode}
        onChange={onSourceModeChange}
        options={[
          { value: "split", label: "Split", testId: "source-mode-split" },
          { value: "load", label: "Load", testId: "source-mode-load" },
        ]}
        className="mb-md"
      />

      {/* ── Upload drop zone (split mode) ── */}
      {sourceMode === "split" && (
        <UploadDropZone
          uploadName={uploadName}
          uploadedFile={uploadedFile}
          durationSec={uploadDurationSec}
          estimatedTokens={estimatedSplitTokens}
          isSample={isSample}
          onBrowseUpload={onBrowseUpload}
          onClearUpload={onClearUpload}
          onDropUpload={onDropUpload}
          isDragging={isDragging}
          onSetIsDragging={onSetIsDragging}
        />
      )}

      {/* ── Progressive disclosure: settings shown only after file is ready ── */}
      <AnimatePresence>
        {(uploadedFile != null || sourceMode === "load") && (
          <motion.div key="settings-revealed" {...collapse}>
            {sourceMode === "load" ? (
              <LoadStemsZone
                loadedStemCount={loadedStemCount}
                loadStemsInputRef={loadStemsInputRef}
                onLoadStems={onLoadStems}
                loadedStems={loadedStems}
                onRemoveLoadedStem={onRemoveLoadedStem}
                isDragging={isDragging}
                onSetIsDragging={onSetIsDragging}
                loadExpanded={loadExpanded}
                onToggleLoadExpanded={() => setLoadExpanded((v) => !v)}
              />
            ) : (
              <div className="flex flex-col gap-md">
                <QualitySelector
                  quality={quality}
                  onQualityChange={onQualityChange}
                  canChoosePaidQuality={canChoosePaidQuality}
                  isSplitting={isSplitting}
                  splitResultStemsLength={splitResultStemsLength}
                />
                <SplitIntentQuickActions
                  selected={splitIntent}
                  onSelect={(intent) => {
                    setSplitIntent(intent);
                    setAdvancedTargets([]);
                    setRemoveVocalsMode(false);
                  }}
                  disabled={isSplitting || splitResultStemsLength > 0}
                />
                <SplitIntentAdvanced
                  targets={advancedTargets}
                  removeVocals={removeVocalsMode}
                  onTargetsChange={setAdvancedTargets}
                  onRemoveVocalsChange={setRemoveVocalsMode}
                  disabled={isSplitting || splitResultStemsLength > 0}
                />
                <FullSeparationOptions
                  mode={fullSepMode}
                  onModeChange={(mode) => {
                    setFullSepMode(mode);
                    setSplitIntent(fullSeparationIntent(mode));
                    setAdvancedTargets([]);
                    setRemoveVocalsMode(false);
                  }}
                  canSplitFourStems={canSplitFourStems}
                  disabled={isSplitting || splitResultStemsLength > 0}
                  onUpgradeToPremium={onUpgradeToPremium}
                />
                <SplitActions
                  uploadedFile={uploadedFile}
                  splitIntent={resolvedSplitIntent}
                  isSample={isSample}
                  onToggleSample={() => setIsSample((v) => !v)}
                  onSplit={onSplit}
                  isSplitting={isSplitting}
                  splitProgress={splitProgress}
                  uploadProgress={uploadProgress}
                  isUploading={isUploading}
                  queuePosition={queuePosition}
                  splitElapsedSeconds={splitElapsedSeconds}
                  splitStageLabel={splitStageLabel}
                  uploadDurationSec={uploadDurationSec}
                  splitResultStemsLength={splitResultStemsLength}
                  canUseBatchQueue={canUseBatchQueue}
                  onAddToQueue={onAddToQueue ?? (() => {})}
                  onOpenWaitingGame={onOpenWaitingGame}
                  hideSampleToggle={false}
                />
              </div>
            )}

            {sourceMode === "split" &&
              splitResultStemsLength > 0 &&
              onExpandToFourStems && (
                <details className="mt-sm rounded-xl border border-border/60 bg-muted/30 px-sm py-xs">
                  <summary className="cursor-pointer px-xs py-xs text-xs font-medium text-muted-foreground hover:text-foreground">
                    More options
                  </summary>
                  <div className="px-xs pb-xs pt-sm">
                    <ExpandStemsAction
                      canExpand={canExpandToFourStems}
                      isExpanding={isExpanding}
                      splitResultStemsLength={splitResultStemsLength}
                      onExpand={onExpandToFourStems}
                      onUpgrade={onUpgradeToPremium}
                    />
                  </div>
                </details>
              )}

            {showUsageRow && sourceMode === "split" ? (
              <UsageTokenRow
                usageBalance={usageBalance}
                usageLoading={usageLoading}
                estimatedSplitTokens={estimatedSplitTokens}
                isSample={isSample}
                showBalance={false}
              />
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {splitError && (
        <SplitErrorAlert
          splitError={splitError}
          onDismissError={onDismissError}
          onRetry={() => {
            onDismissError();
            onSplit(resolvedSplitIntent);
          }}
        />
      )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Always-present hidden file inputs (needed even when panel is collapsed) */}
      <input
        ref={inputRef}
        type="file"
        accept={AUDIO_INPUT_ACCEPT}
        className="hidden"
        aria-label="Choose audio file"
        onChange={(e) => onUploadFileInput(e.target.files?.[0] ?? null)}
      />
      <input
        ref={loadStemsInputRef}
        type="file"
        accept={AUDIO_INPUT_ACCEPT}
        multiple
        className="hidden"
        aria-label="Load stem files"
        onChange={(e) => {
          onLoadStems(e.target.files);
          e.target.value = "";
        }}
      />

      {/* New Split confirmation dialog */}
      {onNewSplit && (
        <NewSplitConfirmDialog
          open={showNewSplitConfirm}
          onConfirm={() => {
            setShowNewSplitConfirm(false);
            onNewSplit();
          }}
          onCancel={() => setShowNewSplitConfirm(false)}
        />
      )}
    </div>
  );
}
