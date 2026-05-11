import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Music2, Settings2 } from "lucide-react";
import { cn } from "../../utils/cn";
import { AUDIO_INPUT_ACCEPT } from "../../config";
import type { ProcessingSettingsPanelProps } from "./types";
import { UploadDropZone } from "./UploadDropZone";
import { LoadStemsZone } from "./LoadStemsZone";
import { QualitySelector } from "./QualitySelector";
import { StemCountSelector } from "./StemCountSelector";
import { SplitActions } from "./SplitActions";
import { UsageTokenRow } from "./UsageTokenRow";
import { SplitErrorAlert } from "./SplitErrorAlert";

export function ProcessingSettingsPanel({
  sourceMode,
  onSourceModeChange,
  uploadName,
  uploadedFile,
  inputRef,
  onBrowseUpload,
  onClearUpload,
  onDropUpload,
  onUploadFileInput,
  isDragging,
  onSetIsDragging,
  loadedStemCount,
  loadStemsInputRef,
  onLoadStems,
  loadedStems,
  onRemoveLoadedStem,
  quality,
  onQualityChange,
  stemQualityOptions = "full",
  canExpandToFourStems = true,
  onSplit,
  isSplitting,
  splitProgress = 0,
  uploadProgress = 0,
  isUploading = false,
  queuePosition = null,
  splitResultStemsLength,
  isExpanding,
  onExpand,
  splitError,
  onDismissError,
  canUseBatchQueue = true,
  onAddToQueue,
  onUpgradeToPremium,
  subscriptionInactive = false,
  onContinueCheckout,
  usageBalance = null,
  usageLoading = false,
  estimatedSplitTokens = null,
  estimatedExpandTokens = null,
  isCollapsed = false,
}: ProcessingSettingsPanelProps) {
  const [requestedStemMode, setRequestedStemMode] = useState<2 | 4>(2);
  const [loadExpanded, setLoadExpanded] = useState(false);
  const [isSample, setIsSample] = useState(false);
  // Local override: user can re-expand the panel after auto-collapse
  const [userExpanded, setUserExpanded] = useState(false);

  const panelCollapsed = isCollapsed && !userExpanded;

  // When a new split completes (isCollapsed flips true), reset the user override
  // so the panel collapses cleanly for the new result.
  useEffect(() => {
    if (isCollapsed) setUserExpanded(false);
  }, [isCollapsed]);

  const canChoosePaidQuality = stemQualityOptions !== "speed_only";

  // Safety: if state ever holds "ultra" (old localStorage/session), clamp to a supported UI option.
  useEffect(() => {
    if (quality === "ultra") onQualityChange("quality");
  }, [quality, onQualityChange]);

  useEffect(() => {
    if (!canExpandToFourStems && requestedStemMode !== 2)
      setRequestedStemMode(2);
  }, [canExpandToFourStems, requestedStemMode]);

  const showUsageRow =
    !subscriptionInactive &&
    (usageLoading ||
      usageBalance !== null ||
      estimatedSplitTokens !== null ||
      (splitResultStemsLength === 2 && estimatedExpandTokens !== null));

  return (
    <div data-testid="processing-settings-panel">
      {/* ── Collapsed bar: shown after a split completes ── */}
      <AnimatePresence initial={false}>
        {panelCollapsed && (
          <motion.div
            key="collapsed-bar"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
                <Music2 className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white/90">
                {uploadName || "Loaded stems"}
              </span>
              <span className="shrink-0 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                {splitResultStemsLength} stems ready
              </span>
              <button
                type="button"
                onClick={() => setUserExpanded(true)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/65 transition hover:border-white/25 hover:text-white"
                aria-label="Edit source settings"
              >
                <Settings2 className="h-3 w-3" />
                Edit Source
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Full panel: hidden when collapsed ── */}
      <AnimatePresence initial={false}>
        {!panelCollapsed && (
          <motion.div
            key="full-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
          >
      {subscriptionInactive && sourceMode === "split" && !isSample && (
        <div className="mb-3 rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-100/95">
          <p>
            <span className="font-semibold text-amber-50">
              Active plan required to split full tracks.
            </span>{" "}
            Continue to secure checkout, or use{" "}
            <span className="font-semibold text-amber-200">Try for free</span>{" "}
            below.
          </p>
          <div className="mt-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onContinueCheckout}
                className="ghost-button min-h-[40px] rounded-lg border border-amber-300/30 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:border-amber-200/50 hover:text-amber-50"
              >
                Continue to secure checkout
              </button>
              <button
                type="button"
                onClick={() => setIsSample(true)}
                className="ghost-button min-h-[40px] rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 hover:border-white/35 hover:text-white"
              >
                Use 60s free sample
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mode toggle ── */}
      <div
        data-testid="source-mode-toggle"
        className="mb-4 flex w-fit rounded-xl border border-white/10 bg-black/20 p-0.5"
      >
        <button
          data-testid="source-mode-split"
          type="button"
          onClick={() => onSourceModeChange("split")}
          className={cn(
            "rounded-lg px-4 py-1.5 text-xs font-medium transition",
            sourceMode === "split"
              ? "bg-amber-500/20 text-amber-200"
              : "text-white/60 hover:text-white",
          )}
        >
          Split
        </button>
        <button
          data-testid="source-mode-load"
          type="button"
          onClick={() => onSourceModeChange("load")}
          className={cn(
            "rounded-lg px-4 py-1.5 text-xs font-medium transition",
            sourceMode === "load"
              ? "bg-amber-500/20 text-amber-200"
              : "text-white/60 hover:text-white",
          )}
        >
          Load
        </button>
      </div>

      {/* ── Upload drop zone (split mode) ── */}
      {sourceMode === "split" && (
        <UploadDropZone
          uploadName={uploadName}
          uploadedFile={uploadedFile}
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
          <motion.div
            key="settings-revealed"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap">

        {/* Load mode zone */}
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

        {/* Quality selector */}
        <QualitySelector
          quality={quality}
          onQualityChange={onQualityChange}
          canChoosePaidQuality={canChoosePaidQuality}
          isSplitting={isSplitting}
          splitResultStemsLength={splitResultStemsLength}
        />

        {/* Stem count */}
        <StemCountSelector
          requestedStemMode={requestedStemMode}
          onStemModeChange={setRequestedStemMode}
          canExpandToFourStems={canExpandToFourStems}
          isSplitting={isSplitting}
          splitResultStemsLength={splitResultStemsLength}
          onUpgradeToPremium={onUpgradeToPremium}
        />

        {/* Split actions (split mode only) */}
        {sourceMode === "split" && (
          <SplitActions
            uploadedFile={uploadedFile}
            requestedStemMode={requestedStemMode}
            isSample={isSample}
            onToggleSample={() => setIsSample((v) => !v)}
            onSplit={onSplit}
            isSplitting={isSplitting}
            splitProgress={splitProgress}
            uploadProgress={uploadProgress}
            isUploading={isUploading}
            queuePosition={queuePosition}
            splitResultStemsLength={splitResultStemsLength}
            isExpanding={isExpanding}
            onExpand={onExpand}
            canExpandToFourStems={canExpandToFourStems}
            splitError={splitError}
            canUseBatchQueue={canUseBatchQueue}
            onAddToQueue={onAddToQueue}
          />
        )}
            </div>{/* end flex row */}

            {sourceMode === "split" && splitResultStemsLength > 0 && (
              <p className="mt-3 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-xs leading-relaxed text-white/65">
          <span className="font-medium text-white/85">
            This upload is finished.
          </span>{" "}
          To separate a different track, use{" "}
          <span className="text-white/90">Change</span> or{" "}
          <span className="text-white/90">Clear</span> above and upload a new
          file — that starts a new job.
          {splitResultStemsLength === 2 && canExpandToFourStems ? (
            <>
              {" "}
              Use <span className="text-amber-200/90">Expand → 4 stems</span> if
              you want four parts from this same separation.
            </>
          ) : null}
              </p>
            )}

            {showUsageRow && sourceMode === "split" && (
              <UsageTokenRow
                usageBalance={usageBalance}
                usageLoading={usageLoading}
                estimatedSplitTokens={estimatedSplitTokens}
                estimatedExpandTokens={estimatedExpandTokens}
                splitResultStemsLength={splitResultStemsLength}
                isExpanding={isExpanding}
                isSplitting={isSplitting}
                isSample={isSample}
              />
            )}
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
            onSplit(requestedStemMode);
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
    </div>
  );
}
