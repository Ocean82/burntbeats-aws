import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderOpen,
  Upload,
  ChevronDown,
  ChevronUp,
  Lock,
  Loader2,
  Sparkles,
  Music2,
  Settings2,
} from "lucide-react";
import type { SplitQuality } from "../api";
import type React from "react";

import { cn } from "../utils/cn";

export interface LoadedStem {
  id: string;
  label: string;
  url: string;
}

export interface ProcessingSettingsPanelProps {
  sourceMode: "split" | "load";
  onSourceModeChange: (mode: "split" | "load") => void;

  uploadName: string;
  uploadedFile: File | null;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  onBrowseUpload: () => void;
  onClearUpload: () => void;
  onDropUpload: (file: File | null) => void;
  onUploadFileInput: (file: File | null) => void;
  isDragging: boolean;
  onSetIsDragging: (isDragging: boolean) => void;

  loadedStemCount: number;
  loadStemsInputRef: React.MutableRefObject<HTMLInputElement | null>;
  onLoadStems: (files: FileList | null) => void;
  loadedStems: LoadedStem[];
  onRemoveLoadedStem: (id: string) => void;

  quality: SplitQuality;
  onQualityChange: (next: SplitQuality) => void;
  stemQualityOptions?: "speed_only" | "full";
  canExpandToFourStems?: boolean;

  onSplit: (requestedStemMode: 2 | 4, isSample?: boolean) => void;
  isSplitting: boolean;
  splitProgress?: number;
  /** Queue position when job is waiting (1 = next to run). */
  queuePosition?: number | null;
  splitResultStemsLength: number;
  isExpanding: boolean;
  onExpand: () => void;

  splitError: string | null;
  onDismissError: () => void;

  canUseBatchQueue?: boolean;
  onAddToQueue: () => void;
  onUpgradeToPremium?: () => void;

  /** When true, show copy that splitting requires an active plan (checkout opens from Split). */
  subscriptionInactive?: boolean;
  /** Explicit conversion CTA shown when split is blocked by inactive plan. */
  onContinueCheckout?: () => void;
  /** Metering: remaining tokens from Clerk (null = unknown / loading). */
  usageBalance?: number | null;
  usageLoading?: boolean;
  /** Estimated tokens for the current split job (~minutes, ceil). */
  estimatedSplitTokens?: number | null;
  /** Estimated tokens for expand 2→4 (same duration as split). */
  estimatedExpandTokens?: number | null;
  /**
   * When true, the panel renders in a compact collapsed bar.
   * The user can expand it by clicking "Edit Source".
   */
  isCollapsed?: boolean;
}

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

  const qualityOptions = useMemo(() => {
    const opts: Array<{
      value: SplitQuality;
      label: string;
      enabled: boolean;
      hint: string;
    }> = [
      {
        value: "speed",
        label: "Fast",
        enabled: true,
        hint: "Quickest turnaround",
      },
      {
        value: "balanced",
        label: "Balanced",
        enabled: canChoosePaidQuality,
        hint: canChoosePaidQuality
          ? "Good quality + speed balance"
          : "Requires Premium or Studio",
      },
      {
        value: "quality",
        label: "Quality",
        enabled: canChoosePaidQuality,
        hint: canChoosePaidQuality
          ? "Higher quality, slower than balanced"
          : "Requires Premium or Studio",
      },
      // Intentionally not offering "ultra" in UI:
      // - Ultra is not guaranteed to be available on CPU-only EC2 deployments
      // - This app must not offer paid features that aren't actually available
      // If you want to experiment later, re-add:
      // { value: "ultra", label: "Ultra", enabled: <bool>, hint: "Highest quality, slowest processing" },
    ];
    return opts;
  }, [canChoosePaidQuality]);

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

      {/* ── Hero drop zone (split mode, no file yet) ── */}
      {sourceMode === "split" && !uploadedFile && (
        <div
          data-testid="split-upload-dropzone"
          onDragOver={(e) => { e.preventDefault(); onSetIsDragging(true); }}
          onDragLeave={() => onSetIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            onSetIsDragging(false);
            onDropUpload(e.dataTransfer.files?.[0] ?? null);
          }}
          onClick={onBrowseUpload}
          className={cn(
            "dropzone-hero flex w-full cursor-pointer flex-col items-center justify-center gap-4 px-6 py-14 text-center",
            isDragging && "dropzone-dragging",
          )}
          role="button"
          aria-label="Upload audio file"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && onBrowseUpload()}
        >
          <div className={cn(
            "flex h-16 w-16 items-center justify-center rounded-full border transition-all duration-300",
            isDragging
              ? "border-amber-400/80 bg-amber-500/25 shadow-[0_0_32px_rgba(255,172,92,0.5)]"
              : "border-amber-400/40 bg-amber-500/10 shadow-[0_0_20px_rgba(255,140,80,0.2)]",
          )}>
            {isDragging
              ? <Music2 className="h-8 w-8 text-amber-300" />
              : <Upload className="h-8 w-8 text-amber-400" strokeWidth={1.5} />}
          </div>
          <div>
            <p className="text-lg font-bold text-white">
              {isDragging ? "Drop it!" : "Drop your track here"}
            </p>
            <p className="mt-1 text-sm text-white/55">
              or{" "}
              <span className="text-amber-300 underline decoration-amber-400/40 underline-offset-2">
                click to browse
              </span>
              {" · MP3, WAV, FLAC, M4A"}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-white/40">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-amber-500/60" />
              AI stem separation
            </span>
            <span className="h-1 w-1 rounded-full bg-white/20" />
            <span>Vocals · Drums · Bass · Melody</span>
            <span className="h-1 w-1 rounded-full bg-white/20" />
            <span>60s free sample available</span>
          </div>
        </div>
      )}

      {/* ── Compact file bar (split mode, file selected) ── */}
      {sourceMode === "split" && uploadedFile && (
        <div
          data-testid="split-upload-dropzone"
          onDragOver={(e) => { e.preventDefault(); onSetIsDragging(true); }}
          onDragLeave={() => onSetIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            onSetIsDragging(false);
            onDropUpload(e.dataTransfer.files?.[0] ?? null);
          }}
          className={cn(
            "mb-3 flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-all",
            "border-white/10 bg-black/20 hover:border-white/20",
            isDragging && "scale-[1.01] border-amber-400/50 bg-amber-950/20",
          )}
        >
          <Upload className="h-4 w-4 shrink-0 text-white/50" strokeWidth={2} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
            {uploadName}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onClearUpload}
              className="min-h-[32px] whitespace-nowrap rounded-lg border border-white/10 px-3 py-1 text-xs text-white/60 hover:border-white/30 hover:text-white"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onBrowseUpload}
              className="min-h-[32px] whitespace-nowrap rounded-lg border border-white/10 px-3 py-1 text-xs font-semibold text-white/60 hover:border-white/30 hover:text-white"
            >
              Change
            </button>
          </div>
        </div>
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

        {/* Load mode drop zone */}
        {sourceMode === "load" && (
          <div
            data-testid="load-upload-dropzone"
            onDragOver={(e) => {
              e.preventDefault();
              onSetIsDragging(true);
            }}
            onDragLeave={() => onSetIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              onSetIsDragging(false);
              onLoadStems(e.dataTransfer.files);
            }}
            onClick={() => loadStemsInputRef.current?.click()}
            className={cn(
              "flex min-w-0 basis-full cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-4 transition-all lg:basis-auto lg:flex-1",
              "border-white/20 bg-white/[0.03] hover:border-amber-400/40 hover:bg-white/[0.05] active:scale-[0.99]",
              isDragging && "scale-[1.02] border-amber-400/60 bg-white/[0.06]",
            )}
          >
            <FolderOpen
              className="h-5 w-5 shrink-0 text-white/60"
              strokeWidth={1.5}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white/80">
              {loadedStemCount > 0
                ? `${loadedStemCount} stem${loadedStemCount !== 1 ? "s" : ""} loaded`
                : isDragging
                  ? "Drop it!"
                  : "Click to load stems or drag & drop"}
            </span>
            <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  loadStemsInputRef.current?.click();
                }}
                className="min-h-[36px] min-w-[82px] whitespace-nowrap rounded-lg border border-white/10 px-3 py-1 text-xs font-semibold text-white/60 hover:border-white/30 hover:text-white"
              >
                Browse
              </button>
              {loadedStemCount > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLoadExpanded((v) => !v);
                  }}
                  className="text-white/50 hover:text-white"
                  aria-label="Toggle loaded stems list"
                >
                  {loadExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Quality selector */}
        <div
          data-testid="quality-controls"
          className="flex w-full max-w-full shrink-0 flex-wrap items-center gap-1.5 sm:w-auto"
        >
          <span className="hidden text-[10px] font-semibold uppercase tracking-wider text-white/50 sm:block">
            Quality
          </span>
          <div className="flex w-full overflow-x-auto rounded-xl border border-white/10 bg-black/20 p-0.5 sm:w-auto scrollbar-hide">
            {qualityOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={
                  !opt.enabled || isSplitting || splitResultStemsLength > 0
                }
                title={
                  splitResultStemsLength > 0
                    ? "Quality applies on the next upload. Upload a new file to choose again."
                    : opt.hint
                }
                onClick={() => onQualityChange(opt.value)}
                className={cn(
                  "min-h-[36px] whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  !opt.enabled
                    ? "cursor-not-allowed text-white/25"
                    : opt.value === quality
                      ? "bg-amber-500/20 text-amber-200"
                      : "text-white/60 hover:text-white",
                )}
              >
                <span className="inline-flex items-center gap-1">
                  {opt.label}
                  {!opt.enabled && (
                    <Lock
                      className="h-3 w-3 text-white/35"
                      aria-hidden="true"
                    />
                  )}
                </span>
              </button>
            ))}
          </div>
          {!canChoosePaidQuality && (
            <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-white/45">
              Premium/Studio to unlock
            </span>
          )}
        </div>

        {/* Stem count: only before the first split — after that, 2→4 is Expand (not a second split). */}
        {splitResultStemsLength === 0 ? (
          <div className="flex w-full shrink-0 basis-full items-center gap-2 sm:basis-auto lg:w-auto">
            <span className="hidden text-[10px] font-semibold uppercase tracking-wider text-white/50 sm:block">
              Stems
            </span>
            <div className="flex flex-col items-center gap-0.5">
              <input
                type="range"
                min={2}
                max={4}
                step={2}
                value={requestedStemMode}
                disabled={isSplitting}
                onChange={(e) => {
                  const val = parseInt(e.target.value) as 2 | 4;
                  if (
                    val === 4 &&
                    !canExpandToFourStems &&
                    onUpgradeToPremium
                  ) {
                    onUpgradeToPremium();
                    return;
                  }
                  setRequestedStemMode(val);
                }}
                className="w-20 accent-amber-500 disabled:opacity-40"
                aria-label="Number of stems"
                aria-valuetext={`${requestedStemMode} stems${requestedStemMode === 4 && !canExpandToFourStems ? " (requires Premium)" : ""}`}
              />
              <div className="flex w-20 justify-between text-[10px] text-white/40 font-mono">
                <span>2</span>
                <span
                  className={cn(
                    requestedStemMode === 4 ? "text-amber-300" : "",
                    !canExpandToFourStems && "inline-flex items-center gap-1",
                  )}
                >
                  4
                  {!canExpandToFourStems && (
                    <Lock
                      className="h-3 w-3 text-white/35"
                      aria-hidden="true"
                    />
                  )}
                </span>
              </div>
              {!canExpandToFourStems && (
                <span className="text-[10px] font-medium uppercase tracking-wide text-white/45">
                  4-stem requires Premium/Studio
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex shrink-0 flex-col justify-center rounded-xl border border-white/10 bg-black/20 px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
              Result
            </span>
            <span className="text-xs font-medium text-white/80">
              {splitResultStemsLength === 2 ? "2 stems" : "4 stems"}
            </span>
          </div>
        )}

        {/* Split / action button + Try for free pill */}
        {sourceMode === "split" && (
          <div className="flex shrink-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onSplit(requestedStemMode, isSample)}
                disabled={
                  !uploadedFile || isSplitting || splitResultStemsLength > 0
                }
                title={
                  splitResultStemsLength > 0
                    ? "Upload a new file to run separation again. Each upload is a new job."
                    : undefined
                }
                className="fire-button min-h-[44px] shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSplitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Splitting
                    {typeof splitProgress === "number" && splitProgress > 0
                      ? `… ${Math.round(splitProgress)}%`
                      : "…"}
                  </>
                ) : splitResultStemsLength > 0 ? (
                  "New file to split again"
                ) : requestedStemMode === 4 ? (
                  "Split → 4 stems"
                ) : (
                  "Split stems"
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsSample((v) => !v)}
                disabled={isSplitting || splitResultStemsLength > 0}
                aria-pressed={isSample}
                title="Process only the first 60 seconds — free, no tokens used"
                className={cn(
                  "min-h-[44px] inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed",
                  isSample
                    ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200 shadow-[0_0_16px_rgba(52,211,153,0.25)]"
                    : "border-white/15 bg-white/5 text-white/65 hover:border-white/30 hover:text-white",
                )}
              >
                <Sparkles className={cn("h-3.5 w-3.5", isSample ? "text-emerald-300" : "text-white/40")} />
                {isSample ? "Free sample ✓" : "Try for free"}
              </button>
            </div>
            {isSample && (
              <p className="text-[11px] text-emerald-400/80">
                60-second sample · no tokens consumed
              </p>
            )}
            {/* ── Real-time progress bar ── */}
            <AnimatePresence>
              {isSplitting && (
                <motion.div
                  key="split-progress"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ overflow: "hidden" }}
                  role="status"
                  aria-live="polite"
                  aria-label={
                    queuePosition != null
                      ? `Queued — position ${queuePosition}`
                      : `Splitting: ${Math.round(splitProgress)}%`
                  }
                >
                  <div className="mt-1 w-full min-w-[220px]">
                    {queuePosition != null ? (
                      <p className="mb-1.5 text-xs text-amber-200/80">
                        Queue position {queuePosition} — waiting to start…
                      </p>
                    ) : (
                      <div className="mb-1 flex items-center justify-between text-[11px] text-white/50">
                        <span>
                          {splitProgress < 5
                            ? "Starting…"
                            : splitProgress < 90
                              ? "Separating vocals…"
                              : splitProgress < 95
                                ? "Building instrumental…"
                                : "Finalising stems…"}
                        </span>
                        <span className="tabular-nums">{Math.round(splitProgress)}%</span>
                      </div>
                    )}
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#ff633d_0%,#ffbb61_44%,#ffe3a0_100%)]"
                        initial={{ width: "0%" }}
                        animate={{
                          width: queuePosition != null ? "0%" : `${Math.max(2, splitProgress)}%`,
                        }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {isSplitting && (
              <p className="text-[10px] text-white/45">
                Need a distraction? Open{" "}
                <span className="font-semibold text-white/70">
                  The Waiting Game
                </span>{" "}
                from the bottom-right tab.
              </p>
            )}
          </div>
        )}

        {/* Queue button */}
        {sourceMode === "split" && (
          <div className="flex shrink-0 flex-col items-start gap-1">
            <button
              type="button"
              onClick={onAddToQueue}
              disabled={
                !uploadedFile ||
                isSplitting ||
                !canUseBatchQueue ||
                splitResultStemsLength > 0
              }
              title={
                splitResultStemsLength > 0
                  ? "Clear results by uploading a new file before adding to the queue."
                  : canUseBatchQueue
                    ? "Add to batch queue"
                    : "Requires Premium or Studio"
              }
              className="ghost-button shrink-0 rounded-xl border border-white/10 px-3 py-2.5 text-xs text-white/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="inline-flex items-center gap-1">
                + Queue
                {!canUseBatchQueue && (
                  <Lock className="h-3 w-3 text-white/35" aria-hidden="true" />
                )}
              </span>
            </button>
            {!canUseBatchQueue && (
              <span className="max-w-[12rem] text-[10px] text-white/45">
                Premium &amp; Studio plans let you run whole queues
                automatically while you work.
              </span>
            )}
          </div>
        )}

        {/* Expanding indicator */}
        {isExpanding && (
          <span className="shrink-0 text-xs text-amber-200/80">
            Expanding to 4 stems…
          </span>
        )}

        {/* Manual expand */}
        {canExpandToFourStems &&
          splitResultStemsLength === 2 &&
          !isExpanding &&
          !isSplitting &&
          !splitError && (
            <button
              type="button"
              onClick={() => onExpand()}
              className="ghost-button shrink-0 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/60 hover:text-white"
            >
              Expand → 4 stems
            </button>
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
        <div
          className={cn(
            "mt-3 rounded-xl border px-4 py-2.5 text-sm leading-relaxed",
            usageBalance !== null &&
              estimatedSplitTokens !== null &&
              estimatedSplitTokens > usageBalance
              ? "border-amber-500/50 bg-amber-500/10 text-amber-50"
              : "border-white/10 bg-black/25 text-white/80",
          )}
          role="status"
        >
          {usageLoading ? (
            <span className="text-white/55">Loading token balance…</span>
          ) : (
            <>
              {usageBalance !== null && (
                <span className="font-medium text-white/90">
                  Balance: {Math.floor(usageBalance)} tokens
                </span>
              )}
              {estimatedSplitTokens !== null && (
                <span className={cn(usageBalance !== null && "ml-2")}>
                  · This split:{" "}
                  {isSample ? (
                    <span className="text-emerald-400 font-bold">FREE</span>
                  ) : (
                    `~${estimatedSplitTokens} token${estimatedSplitTokens === 1 ? "" : "s"}`
                  )}
                </span>
              )}
              {splitResultStemsLength === 2 &&
                estimatedExpandTokens !== null &&
                !isExpanding &&
                !isSplitting && (
                  <span className="ml-2">
                    · Expand to 4: ~{estimatedExpandTokens} more
                  </span>
                )}
              <span className="mt-1 block text-xs text-white/50">
                1 token ≈ 1 minute of audio (rounds up). Metered when enabled on
                the server.
              </span>
            </>
          )}
            </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loaded stems list (collapsible) — inside full panel */}
      {sourceMode === "load" && loadExpanded && loadedStems.length > 0 && (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
          <ul className="space-y-1.5">
            {loadedStems.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm text-white">
                  {s.label.replace(/\.[^/.]+$/, "")}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveLoadedStem(s.id)}
                  className="shrink-0 text-xs text-red-300/80 hover:text-red-300"
                  aria-label={`Remove ${s.label}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Error */}
      {splitError && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 rounded-xl border border-red-400/30 bg-red-950/30 px-4 py-3"
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-red-200">Split failed</p>
                <p className="mt-0.5 break-words text-xs text-red-300/90">
                  {splitError}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onDismissError();
                  onSplit(requestedStemMode);
                }}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-black transition hover:bg-amber-400"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={onDismissError}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10"
              >
                Dismiss
              </button>
            </div>
          </div>
        </motion.div>
      )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Always-present hidden file inputs (needed even when panel is collapsed) */}
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        aria-label="Choose audio file"
        onChange={(e) => onUploadFileInput(e.target.files?.[0] ?? null)}
      />
      <input
        ref={loadStemsInputRef}
        type="file"
        accept="audio/*"
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
