import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FolderOpen, Upload, ChevronDown, ChevronUp, Lock, Loader2 } from "lucide-react";
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

  onSplit: (requestedStemMode: 2 | 4) => void;
  isSplitting: boolean;
  splitProgress?: number;
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
  /** Metering: remaining tokens from Clerk (null = unknown / loading). */
  usageBalance?: number | null;
  usageLoading?: boolean;
  /** Estimated tokens for the current split job (~minutes, ceil). */
  estimatedSplitTokens?: number | null;
  /** Estimated tokens for expand 2→4 (same duration as split). */
  estimatedExpandTokens?: number | null;
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
  splitResultStemsLength,
  isExpanding,
  onExpand,
  splitError,
  onDismissError,
  canUseBatchQueue = true,
  onAddToQueue,
  onUpgradeToPremium,
  subscriptionInactive = false,
  usageBalance = null,
  usageLoading = false,
  estimatedSplitTokens = null,
  estimatedExpandTokens = null,
}: ProcessingSettingsPanelProps) {
  const [requestedStemMode, setRequestedStemMode] = useState<2 | 4>(2);
  const [loadExpanded, setLoadExpanded] = useState(false);
  const autoExpandedRef = useRef(false);

  const canChoosePaidQuality = stemQualityOptions !== "speed_only";

  const qualityOptions = useMemo(() => {
    const opts: Array<{ value: SplitQuality; label: string; enabled: boolean; hint: string }> = [
      { value: "speed", label: "Fast", enabled: true, hint: "Quickest turnaround" },
      {
        value: "balanced",
        label: "Balanced",
        enabled: canChoosePaidQuality,
        hint: canChoosePaidQuality ? "Good quality + speed balance" : "Requires Premium or Studio",
      },
      {
        value: "quality",
        label: "Quality",
        enabled: canChoosePaidQuality,
        hint: canChoosePaidQuality ? "Higher quality, slower than balanced" : "Requires Premium or Studio",
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
    if (!canExpandToFourStems && requestedStemMode !== 2) setRequestedStemMode(2);
  }, [canExpandToFourStems, requestedStemMode]);

  useEffect(() => {
    if (isSplitting) autoExpandedRef.current = false;
  }, [isSplitting]);

  const showUsageRow =
    !subscriptionInactive &&
    (usageLoading ||
      usageBalance !== null ||
      estimatedSplitTokens !== null ||
      (splitResultStemsLength === 2 && estimatedExpandTokens !== null));

  return (
    <div data-testid="processing-settings-panel">
      {subscriptionInactive && sourceMode === "split" && (
        <p className="mb-3 rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-100/95">
          <span className="font-semibold text-amber-50">Active plan required to split.</span>{" "}
          Choosing a plan opens secure Stripe checkout. Export and mixing stay available after you load or split stems.
        </p>
      )}

      {/* ── Horizontal toolbar row ── */}
      <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap">

        {/* Mode toggle */}
        <div className="flex shrink-0 rounded-xl border border-white/10 bg-black/20 p-0.5">
          <button
            type="button"
            onClick={() => onSourceModeChange("split")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition",
              sourceMode === "split" ? "bg-amber-500/20 text-amber-200" : "text-white/60 hover:text-white",
            )}
          >
            Split
          </button>
          <button
            type="button"
            onClick={() => onSourceModeChange("load")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition",
              sourceMode === "load" ? "bg-amber-500/20 text-amber-200" : "text-white/60 hover:text-white",
            )}
          >
            Load
          </button>
        </div>

        {/* Upload drop zone (split mode) */}
        {sourceMode === "split" && (
          <div
            onDragOver={(e) => { e.preventDefault(); onSetIsDragging(true); }}
            onDragLeave={() => onSetIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); onSetIsDragging(false); onDropUpload(e.dataTransfer.files?.[0] ?? null); }}
            onClick={!uploadedFile ? onBrowseUpload : undefined}
            className={cn(
              "flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl border px-4 py-4 transition-all",
              !uploadedFile
                ? "border-amber-400/60 bg-amber-950/40 shadow-[0_0_24px_rgba(255,140,80,0.35)] hover:border-amber-400/90 hover:bg-amber-950/60 hover:shadow-[0_0_32px_rgba(255,140,80,0.5)] active:scale-[0.99]"
                : "border-white/10 bg-black/20 hover:border-white/20",
              isDragging && "scale-[1.02] border-amber-400/90 bg-amber-950/60 shadow-[0_0_32px_rgba(255,140,80,0.5)]",
            )}
          >
            <Upload className={cn("h-5 w-5 shrink-0 transition-colors", !uploadedFile ? "text-amber-400" : "text-white/70")} strokeWidth={2} />
            <span className="truncate text-sm font-semibold text-white">
              {uploadedFile ? uploadName : isDragging ? "Drop it!" : "Click to upload or drag & drop"}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {uploadedFile && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onClearUpload(); }}
                  className="rounded-lg border border-white/10 px-3 py-1 text-xs text-white/60 hover:border-white/30 hover:text-white"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onBrowseUpload(); }}
                className={cn(
                  "rounded-lg border px-3 py-1 text-xs font-semibold transition-all",
                  !uploadedFile
                    ? "border-amber-400/60 bg-amber-500/20 text-amber-200 hover:border-amber-400 hover:bg-amber-500/30"
                    : "border-white/10 text-white/60 hover:border-white/30 hover:text-white"
                )}
              >
                {uploadedFile ? "Change" : "Browse"}
              </button>
            </div>
          </div>
        )}

        {/* Load mode drop zone */}
        {sourceMode === "load" && (
          <div
            onDragOver={(e) => { e.preventDefault(); onSetIsDragging(true); }}
            onDragLeave={() => onSetIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); onSetIsDragging(false); onLoadStems(e.dataTransfer.files); }}
            onClick={() => loadStemsInputRef.current?.click()}
            className={cn(
              "flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl border px-4 py-4 transition-all",
              "border-white/20 bg-white/[0.03] hover:border-amber-400/40 hover:bg-white/[0.05] active:scale-[0.99]",
              isDragging && "scale-[1.02] border-amber-400/60 bg-white/[0.06]",
            )}
          >
            <FolderOpen className="h-5 w-5 shrink-0 text-white/60" strokeWidth={1.5} />
            <span className="truncate text-sm font-semibold text-white/80">
              {loadedStemCount > 0 ? `${loadedStemCount} stem${loadedStemCount !== 1 ? "s" : ""} loaded` : isDragging ? "Drop it!" : "Click to load stems or drag & drop"}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); loadStemsInputRef.current?.click(); }}
                className="rounded-lg border border-white/10 px-3 py-1 text-xs font-semibold text-white/60 hover:border-white/30 hover:text-white"
              >
                Browse
              </button>
              {loadedStemCount > 0 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setLoadExpanded((v) => !v); }}
                  className="text-white/50 hover:text-white"
                  aria-label="Toggle loaded stems list"
                >
                  {loadExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Quality selector */}
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="hidden text-[10px] font-semibold uppercase tracking-wider text-white/50 sm:block">Quality</span>
          <div className="flex rounded-xl border border-white/10 bg-black/20 p-0.5">
            {qualityOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={!opt.enabled || isSplitting}
                onClick={() => onQualityChange(opt.value)}
                title={opt.hint}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  !opt.enabled
                    ? "cursor-not-allowed text-white/25"
                    : opt.value === quality
                      ? "bg-amber-500/20 text-amber-200"
                      : "text-white/60 hover:text-white",
                )}
              >
                <span className="inline-flex items-center gap-1">
                  {opt.label}
                  {!opt.enabled && <Lock className="h-3 w-3 text-white/35" aria-hidden="true" />}
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

        {/* Stem count slider (full-width wrap on small screens) */}
        <div className="flex w-full shrink-0 basis-full items-center gap-2 sm:basis-auto lg:w-auto">
          <span className="hidden text-[10px] font-semibold uppercase tracking-wider text-white/50 sm:block">Stems</span>
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
                if (val === 4 && !canExpandToFourStems && onUpgradeToPremium) {
                  onUpgradeToPremium();
                  return;
                }
                setRequestedStemMode(val);
              }}
              className="w-20 accent-amber-500 disabled:opacity-40"
              aria-label="Number of stems"
              aria-valuenow={requestedStemMode}
              aria-valuemin={2}
              aria-valuemax={4}
              aria-valuetext={`${requestedStemMode} stems${requestedStemMode === 4 && !canExpandToFourStems ? " (requires Premium)" : ""}`}
            />
            <div className="flex w-20 justify-between text-[10px] text-white/40 font-mono">
              <span>2</span>
              <span className={cn(requestedStemMode === 4 ? "text-amber-300" : "", !canExpandToFourStems && "inline-flex items-center gap-1")}>
                4
                {!canExpandToFourStems && <Lock className="h-3 w-3 text-white/35" aria-hidden="true" />}
              </span>
            </div>
            {!canExpandToFourStems && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-white/45">
                4-stem requires Premium/Studio
              </span>
            )}
          </div>
        </div>

        {/* Split / action button */}
        {sourceMode === "split" && (
          <button
            type="button"
            onClick={() => onSplit(requestedStemMode)}
            disabled={!uploadedFile || isSplitting}
            className="fire-button min-h-[44px] shrink-0 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSplitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Splitting{typeof splitProgress === "number" && splitProgress > 0 ? `… ${Math.round(splitProgress)}%` : "…"}
              </>
            ) : requestedStemMode === 4 ? "Split → 4 stems" : "Split stems"}
          </button>
        )}

        {/* Queue button */}
        {sourceMode === "split" && (
          <div className="flex shrink-0 flex-col items-start gap-1">
            <button
              type="button"
              onClick={onAddToQueue}
              disabled={!uploadedFile || isSplitting || !canUseBatchQueue}
              title={canUseBatchQueue ? "Add to batch queue" : "Requires Premium or Studio"}
              className="ghost-button shrink-0 rounded-xl border border-white/10 px-3 py-2.5 text-xs text-white/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="inline-flex items-center gap-1">
                + Queue
                {!canUseBatchQueue && <Lock className="h-3 w-3 text-white/35" aria-hidden="true" />}
              </span>
            </button>
            {!canUseBatchQueue && (
              <span className="max-w-[12rem] text-[10px] text-white/45">
                Premium &amp; Studio plans let you run whole queues automatically while you work.
              </span>
            )}
          </div>
        )}

        {/* Expanding indicator */}
        {isExpanding && (
          <span className="shrink-0 text-xs text-amber-200/80">Expanding to 4 stems…</span>
        )}

        {/* Manual expand */}
        {canExpandToFourStems && splitResultStemsLength === 2 && !isExpanding && !isSplitting && requestedStemMode === 2 && !splitError && (
          <button
            type="button"
            onClick={() => { autoExpandedRef.current = true; setRequestedStemMode(4); onExpand(); }}
            className="ghost-button shrink-0 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/60 hover:text-white"
          >
            Expand → 4 stems
          </button>
        )}
      </div>

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
                <span className="font-medium text-white/90">Balance: {Math.floor(usageBalance)} tokens</span>
              )}
              {estimatedSplitTokens !== null && (
                <span className={cn(usageBalance !== null && "ml-2")}>
                  · This split: ~{estimatedSplitTokens} token{estimatedSplitTokens === 1 ? "" : "s"}
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
                1 token ≈ 1 minute of audio (rounds up). Metered when enabled on the server.
              </span>
            </>
          )}
        </div>
      )}

      {/* Loaded stems list (collapsible) */}
      {sourceMode === "load" && loadExpanded && loadedStems.length > 0 && (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
          <ul className="space-y-1.5">
            {loadedStems.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                <span className="truncate text-sm text-white">{s.label.replace(/\.[^/.]+$/, "")}</span>
                <button
                  type="button"
                  onClick={() => onRemoveLoadedStem(s.id)}
                  className="text-xs text-red-300/80 hover:text-red-300"
                  aria-label={`Remove ${s.label}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Hidden file inputs */}
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
        onChange={(e) => { onLoadStems(e.target.files); e.target.value = ""; }}
      />

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
                <p className="mt-0.5 text-xs text-red-300/90">{splitError}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { onDismissError(); onSplit(requestedStemMode); }}
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
    </div>
  );
}
