import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { collapseMotion } from "../../motion/presets";
import { Music2, Settings2, RotateCcw } from "lucide-react";
import { formatUploadMeta } from "../../utils/formatFileMeta";
import { AUDIO_INPUT_ACCEPT } from "../../config";
import type { ProcessingSettingsPanelProps } from "./types";
import { useProcessingSettingsData } from "./useProcessingSettingsData";
import { UploadDropZone } from "./UploadDropZone";
import { LoadStemsZone } from "./LoadStemsZone";
import { SourceFileHeader } from "./SourceFileHeader";
import { ExecutionFooter } from "./ExecutionFooter";
import { SplitIntentQuickActions } from "./SplitIntentQuickActions";
import { SplitIntentAdvanced, advancedSelectionToIntent } from "./SplitIntentAdvanced";
import { FullSeparationOptions, fullSeparationIntent } from "./FullSeparationOptions";
import type { SplitIntent, SplitTarget } from "@shared/types";
import { DEFAULT_SPLIT_INTENT, withIntentQuality } from "../../utils/splitIntent";
import { SuccessFlash } from "../ui/success-flash";
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
    jobsAhead,
    splitStageLabel,
    uploadDurationSec,
    splitResultStemsLength,
    splitError,
    onDismissError,
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
    isSample,
  } = useProcessingSettingsData();
  const reduceMotion = useReducedMotion() ?? false;
  const collapse = collapseMotion(reduceMotion);
  const [splitIntent, setSplitIntent] = useState<SplitIntent>(DEFAULT_SPLIT_INTENT);
  const [advancedTargets, setAdvancedTargets] = useState<SplitTarget[]>([]);
  const [removeVocalsMode, setRemoveVocalsMode] = useState(false);
  const [fullSepMode, setFullSepMode] = useState<"2" | "4">("2");
  const [workflowMode, setWorkflowMode] = useState<"presets" | "custom">("presets");
  const [loadExpanded, setLoadExpanded] = useState(false);
  const [userExpanded, setUserExpanded] = useState(false);
  const [showNewSplitConfirm, setShowNewSplitConfirm] = useState(false);
  const [showSuccessFlash, setShowSuccessFlash] = useState(false);
  const prevStemsLengthRef = useRef(0);

  const panelCollapsed = isCollapsed && !userExpanded;
  const collapsedMeta = formatUploadMeta({
    sizeBytes: uploadedFile?.size,
    durationSec: uploadDurationSec,
    estimatedTokens: estimatedSplitTokens,
  });
  const disabledControls = isSplitting || splitResultStemsLength > 0;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset derived state on dependency change
    if (isCollapsed) setUserExpanded(false);
  }, [isCollapsed]);

  useEffect(() => {
    if (splitResultStemsLength > 0 && prevStemsLengthRef.current === 0) {
      setShowSuccessFlash(true);
    }
    prevStemsLengthRef.current = splitResultStemsLength;
  }, [splitResultStemsLength]);

  const canChoosePaidQuality = stemQualityOptions !== "speed_only";

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

  return (
    <div data-testid="processing-settings-panel">
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

      <AnimatePresence initial={false}>
        {!panelCollapsed && (
          <motion.div key="full-panel" {...collapse}>
            {subscriptionInactive && sourceMode === "split" && (
              <div className="mb-sm rounded-xl border border-primary-400/35 bg-primary-500/10 px-md py-sm text-sm leading-relaxed text-primary-100/95">
                <p>
                  <span className="font-semibold text-primary-50">
                    Need more minutes?
                  </span>{" "}
                  Free accounts get 5 minutes each month plus a one-time welcome
                  grant. Upgrade for full-length splits, 4-stem mode, and batch
                  queue.
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

            {sourceMode === "split" && (
              <>
                {!uploadedFile ? (
                  <UploadDropZone
                    uploadName={uploadName}
                    uploadedFile={uploadedFile}
                    durationSec={uploadDurationSec}
                    estimatedTokens={estimatedSplitTokens}
                    onBrowseUpload={onBrowseUpload}
                    onClearUpload={onClearUpload}
                    onDropUpload={onDropUpload}
                    isDragging={isDragging}
                    onSetIsDragging={onSetIsDragging}
                  />
                ) : (
                  <div className="flex flex-col gap-md">
                    <SourceFileHeader
                      uploadName={uploadName}
                      uploadedFile={uploadedFile}
                      durationSec={uploadDurationSec}
                      estimatedTokens={estimatedSplitTokens}
                      quality={quality}
                      onQualityChange={onQualityChange}
                      canChoosePaidQuality={canChoosePaidQuality}
                      onClearUpload={onClearUpload}
                      onBrowseUpload={onBrowseUpload}
                    />

                    <div className="rounded-xl border border-border bg-muted/30 px-md py-sm">
                      <SegmentedControl
                        testId="workflow-selector"
                        aria-label="Workflow"
                        value={workflowMode}
                        onChange={setWorkflowMode}
                        options={[
                          { value: "presets", label: "Quick Presets", testId: "workflow-presets" },
                          { value: "custom", label: "Custom Matrix", testId: "workflow-custom" },
                        ]}
                      />
                    </div>

                    <div className="rounded-xl border border-border bg-muted/30 px-md py-sm">
                      {workflowMode === "presets" ? (
                        <SplitIntentQuickActions
                          selected={splitIntent}
                          onSelect={(intent) => {
                            setSplitIntent(intent);
                            setAdvancedTargets([]);
                            setRemoveVocalsMode(false);
                          }}
                          disabled={disabledControls}
                          hideLabel
                        />
                      ) : (
                        <div className="flex flex-col gap-3">
                          <FullSeparationOptions
                            mode={fullSepMode}
                            onModeChange={(mode) => {
                              setFullSepMode(mode);
                              setSplitIntent(fullSeparationIntent(mode));
                              setAdvancedTargets([]);
                              setRemoveVocalsMode(false);
                            }}
                            canSplitFourStems={canSplitFourStems}
                            disabled={disabledControls}
                            onUpgradeToPremium={onUpgradeToPremium}
                          />
                          <div className="border-t border-border/40 pt-3">
                            <SplitIntentAdvanced
                              targets={advancedTargets}
                              removeVocals={removeVocalsMode}
                              onTargetsChange={setAdvancedTargets}
                              onRemoveVocalsChange={setRemoveVocalsMode}
                              disabled={disabledControls}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <ExecutionFooter
                      splitError={splitError}
                      onDismissError={onDismissError}
                      onSplit={onSplit}
                      uploadedFile={uploadedFile}
                      splitIntent={resolvedSplitIntent}
                      isSplitting={isSplitting}
                      splitProgress={splitProgress}
                      uploadProgress={uploadProgress}
                      isUploading={isUploading}
                      queuePosition={queuePosition}
                      jobsAhead={jobsAhead}
                      splitStageLabel={splitStageLabel}
                      splitResultStemsLength={splitResultStemsLength}
                      estimatedSplitTokens={estimatedSplitTokens}
                      usageBalance={usageBalance}
                      usageLoading={usageLoading}
                      isSample={isSample}
                      onOpenWaitingGame={onOpenWaitingGame}
                      subscriptionInactive={subscriptionInactive}
                    />

                    {splitResultStemsLength > 0 && onExpandToFourStems && (
                      <details className="rounded-xl border border-border/60 bg-muted/30 px-sm py-xs">
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
                  </div>
                )}
              </>
            )}

            {sourceMode === "load" && (
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
            )}

            <SuccessFlash
              show={showSuccessFlash}
              onComplete={() => setShowSuccessFlash(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

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
