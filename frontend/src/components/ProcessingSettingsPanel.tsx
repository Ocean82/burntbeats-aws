import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FolderOpen, Upload, ChevronDown, ChevronUp, Lock } from "lucide-react";
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
  splitResultStemsLength: number;
  isExpanding: boolean;
  onExpand: () => void;

  splitError: string | null;
  onDismissError: () => void;

  canUseBatchQueue?: boolean;
  onAddToQueue: () => void;
  onUpgradeToPremium?: () => void;
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
  splitResultStemsLength,
  isExpanding,
  onExpand,
  splitError,
  onDismissError,
  canUseBatchQueue = true,
  onAddToQueue,
  onUpgradeToPremium,
}: ProcessingSettingsPanelProps) {
  const [requestedStemMode, setRequestedStemMode] = useState<2 | 4>(2);
  const [loadExpanded, setLoadExpanded] = useState(false);
  const autoExpandedRef = useRef(false);

  const canChooseUltra = stemQualityOptions !== "speed_only";

  const qualityOptions = useMemo(() => {
    const opts: Array<{ value: SplitQuality; label: string; enabled: boolean; hint: string }> = [
      { value: "speed", label: "Fast", enabled: true, hint: "Quickest turnaround" },
      {
        value: "balanced",
        label: "Balanced",
        enabled: canChooseUltra,
        hint: canChooseUltra ? "Good quality + speed balance" : "Requires Premium or Studio",
      },
      {
        value: "quality",
        label: "Quality",
        enabled: canChooseUltra,
        hint: canChooseUltra ? "Higher quality, slower than balanced" : "Requires Premium or Studio",
      },
      {
        value: "ultra",
        label: "Ultra",
        enabled: canChooseUltra,
        hint: canChooseUltra ? "Highest quality, slowest processing" : "Requires Studio",
      },
    ];
    return opts;
  }, [canChooseUltra]);

  useEffect(() => {
    if (!canExpandToFourStems && requestedStemMode !== 2) setRequestedStemMode(2);
  }, [canExpandToFourStems, requestedStemMode]);

  useEffect(() => {
    if (isSplitting) autoExpandedRef.current = false;
  }, [isSplitting]);

  useEffect(() => {
    if (
      sourceMode === "split" &&
      requestedStemMode === 4 &&
      canExpandToFourStems &&
      splitResultStemsLength === 2 &&
      !isSplitting &&
      !isExpanding &&
      !splitError &&
      !autoExpandedRef.current
    ) {
      autoExpandedRef.current = true;
      onExpand();
    }
  }, [sourceMode, requestedStemMode, canExpandToFourStems, splitResultStemsLength, isSplitting, isExpanding, splitError, onExpand]);

  return (
    <div data-testid="processing-settings-panel">
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
            className={cn(
              "flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 transition-all",
              !uploadedFile
                ? "border-amber-400/40 bg-amber-950/30 shadow-[0_0_18px_rgba(255,140,80,0.25)] hover:border-amber-400/60"
                : "border-white/10 bg-black/20 hover:border-white/20",
              isDragging && "scale-[1.01] border-amber-400/60",
            )}
          >
            <Upload className="h-4 w-4 shrink-0 text-white/70" strokeWidth={2} />
            <span className="truncate text-sm font-medium text-white">
              {uploadedFile ? uploadName : "Drop track or use Browse"}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {uploadedFile && (
                <button
                  type="button"
                  onClick={onClearUpload}
                  className="rounded-lg border border-white/10 px-2 py-0.5 text-xs text-white/60 hover:text-white"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={onBrowseUpload}
                className="rounded-lg border border-white/10 px-2 py-0.5 text-xs text-white/60 hover:text-white"
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
            className={cn(
              "flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 transition-all",
              "border-white/15 bg-white/[0.02] hover:border-amber-400/30",
              isDragging && "scale-[1.01] border-amber-400/50",
            )}
          >
            <FolderOpen className="h-4 w-4 shrink-0 text-white/60" strokeWidth={1.5} />
            <span className="truncate text-sm text-white/80">
              {loadedStemCount > 0 ? `${loadedStemCount} stem${loadedStemCount !== 1 ? "s" : ""} loaded` : "Drop stems or use Browse"}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => loadStemsInputRef.current?.click()}
                className="rounded-lg border border-white/10 px-2 py-0.5 text-xs text-white/60 hover:text-white"
              >
                Browse
              </button>
              {loadedStemCount > 0 && (
                <button
                  type="button"
                  onClick={() => setLoadExpanded((v) => !v)}
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
          {!canChooseUltra && (
            <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-white/45">
              Premium/Studio to unlock
            </span>
          )}
        </div>

        {/* Stem count slider */}
        <div className="flex shrink-0 items-center gap-2">
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
            className="fire-button shrink-0 px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {isSplitting
              ? "Splitting…"
              : requestedStemMode === 4
                ? "Split → 4 stems"
                : "Split stems"}
          </button>
        )}

        {/* Queue button */}
        {sourceMode === "split" && (
          <button
            type="button"
            onClick={onAddToQueue}
            disabled={!uploadedFile || isSplitting || !canUseBatchQueue}
            title={canUseBatchQueue ? "Add to batch queue" : "Requires Premium or Studio"}
            className="ghost-button shrink-0 rounded-xl border border-white/10 px-3 py-2.5 text-xs text-white/60 hover:text-white disabled:opacity-40"
          >
            <span className="inline-flex items-center gap-1">
              + Queue
              {!canUseBatchQueue && <Lock className="h-3 w-3 text-white/35" aria-hidden="true" />}
            </span>
          </button>
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
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-red-200">Split failed</p>
              <p className="mt-0.5 text-xs text-red-300/70">{splitError}</p>
            </div>
            <button type="button" onClick={onDismissError} className="text-xs text-red-300/60 hover:text-red-200">
              Dismiss
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
