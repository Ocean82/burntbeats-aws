import { motion } from "framer-motion";
import { FolderOpen, Upload } from "lucide-react";
import { stemDefinitions } from "../data/stemDefinitions";
import type { SplitQuality } from "../api";
import type { StemId } from "../types";
import { cn } from "../utils/cn";

export interface SourcePanelProps {
  sourceMode: "split" | "load";
  onSourceModeChange: (mode: "split" | "load") => void;
  uploadName: string;
  loadedStemCount: number;
  isDragging: boolean;
  onSetIsDragging: (isDragging: boolean) => void;
  loadStemsInputRef: React.MutableRefObject<HTMLInputElement | null>;
  onLoadStems: (files: FileList | null) => void;
  loadedStems: Array<{ id: string; label: string; url: string }>;
  onRemoveLoadedStem: (id: string) => void;
  uploadedFile: File | null;
  onBrowseUpload: () => void;
  onClearUpload: () => void;
  onDropUpload: (file: File | null) => void;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  onUploadFileInput: (file: File | null) => void;
  quality: SplitQuality;
  onQualityChange: (quality: SplitQuality) => void;
  splitResultStemsLength: number;
  isExpanding: boolean;
  onExpand: () => void;
  selectedStems: Record<StemId, boolean>;
  onToggleStem: (stemId: StemId) => void;
  splitError: string | null;
  onDismissError: () => void;
  onSplit: () => void;
  isSplitting: boolean;
  onAddToQueue: () => void;
  /** Basic plan: Speed-only 2-stem. Premium+: full quality options */
  stemQualityOptions?: "speed_only" | "full";
  /** Basic cannot expand to 4 stems without upgrading */
  canExpandToFourStems?: boolean;
  canUseBatchQueue?: boolean;
  onUpgradeToPremium?: () => void;
}

export function SourcePanel({
  sourceMode,
  onSourceModeChange,
  uploadName,
  loadedStemCount,
  isDragging,
  onSetIsDragging,
  loadStemsInputRef,
  onLoadStems,
  loadedStems,
  onRemoveLoadedStem,
  uploadedFile,
  onBrowseUpload,
  onClearUpload,
  onDropUpload,
  inputRef,
  onUploadFileInput,
  quality,
  onQualityChange,
  splitResultStemsLength,
  isExpanding,
  onExpand,
  selectedStems,
  onToggleStem,
  splitError,
  onDismissError,
  onSplit,
  isSplitting,
  onAddToQueue,
  stemQualityOptions = "full",
  canExpandToFourStems = true,
  canUseBatchQueue = true,
  onUpgradeToPremium,
}: SourcePanelProps) {
  const GUIDE_RING_STRONG =
    "ring-2 ring-emerald-300/55 ring-offset-2 ring-offset-black/40 shadow-[0_0_16px_rgba(52,211,153,0.18)] animate-pulse";
  const GUIDE_RING_SOFT =
    "ring-1 ring-emerald-300/40 ring-offset-2 ring-offset-black/30 shadow-[0_0_12px_rgba(52,211,153,0.12)] animate-pulse";

  // Guidance: highlight the exact next action the user should take.
  const shouldGuideUpload =
    sourceMode === "split" && !uploadedFile && !isSplitting && !isExpanding && !splitError;
  const shouldGuideQuality =
    sourceMode === "split" &&
    !!uploadedFile &&
    !isSplitting &&
    !isExpanding &&
    splitResultStemsLength === 0 &&
    !splitError;
  const shouldGuideSplit = shouldGuideQuality;
  const shouldGuideExpand =
    sourceMode === "split" &&
    splitResultStemsLength === 2 &&
    !isSplitting &&
    !isExpanding &&
    !splitError;

  return (
    <div data-testid="source-panel">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="eyebrow">Source</p>
          <h2 className="font-display text-2xl tracking-[-0.04em] text-white">Split a track or load stems to mix</h2>
        </div>
        <div className="inline-flex items-center gap-3 rounded-full border border-amber-200/10 bg-white/5 px-4 py-2 text-sm text-white/70">
          <span className="status-light" />{sourceMode === "split" ? uploadName : `${loadedStemCount} loaded`}
        </div>
      </div>

      <div className="mb-5 flex rounded-xl border border-white/10 bg-black/20 p-1">
        <button
          type="button"
          onClick={() => onSourceModeChange("split")}
          className={cn(
            "flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition",
            sourceMode === "split" ? "bg-amber-500/20 text-amber-200" : "text-white/60 hover:text-white"
          )}
        >
          Split a track
        </button>
        <button
          type="button"
          onClick={() => onSourceModeChange("load")}
          className={cn(
            "flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition",
            sourceMode === "load" ? "bg-amber-500/20 text-amber-200" : "text-white/60 hover:text-white"
          )}
        >
          Load stems (mashup)
        </button>
      </div>

      <div className="space-y-4">
        {sourceMode === "load" ? (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-amber-200/95">Load stems</p>
            <div
              onClick={() => loadStemsInputRef.current?.click()}
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
              className={cn(
                "step-zone group relative flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition-all",
                "border-white/15 bg-white/[0.02] hover:border-amber-400/30 hover:bg-amber-950/10",
                isDragging && "scale-[1.01] border-amber-400/50"
              )}
            >
              <FolderOpen className="h-10 w-10 text-white/40" strokeWidth={1.5} />
              <span className="font-medium text-white/80">Drop WAV/MP3 stems here or click to browse</span>
              <span className="text-xs text-white/50">Add stems from other projects to mix and match</span>
            </div>
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
            {loadedStems.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                <p className="mb-2 text-xs uppercase tracking-wider text-white/65">Loaded stems ({loadedStems.length})</p>
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
          </>
        ) : (
          <>
            <div className={cn("transition-all duration-300", uploadedFile && "opacity-75")}>
              <p className={cn("mb-2 text-[10px] font-semibold uppercase tracking-[0.35em]", !uploadedFile ? "text-amber-200/95" : "text-white/60")}>Step 1</p>
              <div
                onClick={onBrowseUpload}
                onDragOver={(e) => {
                  e.preventDefault();
                  onSetIsDragging(true);
                }}
                onDragLeave={() => onSetIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  onSetIsDragging(false);
                  onDropUpload(e.dataTransfer.files?.[0] ?? null);
                }}
                className={cn(
                  "step-zone group relative flex w-full cursor-pointer items-center gap-4 overflow-hidden rounded-xl border px-4 py-3 text-left transition-all duration-300",
                  !uploadedFile && "step-zone-glow border-amber-400/40 bg-amber-950/30 shadow-[0_0_24px_rgba(255,140,80,0.35)]",
                  uploadedFile && "border-white/10 bg-black/25",
                  isDragging && "scale-[1.01] border-amber-400/60",
                  shouldGuideUpload && GUIDE_RING_STRONG
                )}
              >
                <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all", !uploadedFile ? "border-amber-400/30 bg-amber-500/20" : "border-white/12 bg-white/8")}>
                  <Upload className="h-5 w-5 text-white" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  {uploadedFile ? (
                    <span className="font-medium text-white">{uploadName}</span>
                  ) : (
                    <>
                      <span className="font-display text-lg tracking-tight text-white">Drop your track here</span>
                      <span className="ml-2 text-xs text-white/60">or click to browse · WAV, MP3, AIFF</span>
                    </>
                  )}
                </div>
                {uploadedFile && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); onClearUpload(); }} className="ghost-button shrink-0 rounded-lg px-3 py-1.5 text-xs">
                    Change
                  </button>
                )}
              </div>
            </div>

            <div className={cn("transition-all duration-300", !uploadedFile && "pointer-events-none opacity-50")}>
              <p className={cn("mb-2 text-[10px] font-semibold uppercase tracking-[0.35em]", uploadedFile ? "text-amber-200/95" : "text-white/70")}>Step 2</p>
              <div className={cn(
                "rounded-xl border p-4 transition-all duration-300",
                uploadedFile ? "step-zone-glow border-amber-400/30 bg-amber-950/20" : "border-white/10 bg-black/25",
                shouldGuideQuality && GUIDE_RING_STRONG
              )}>
                <div className="space-y-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-white/65">
                      {stemQualityOptions === "speed_only" ? "Separation mode (Basic)" : "Separation mode"}
                    </p>
                    {stemQualityOptions === "speed_only" ? (
                      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
                        <p className="font-medium text-white/90">2-stem fast</p>
                        <p className="mt-2 text-xs text-white/50">
                          Your plan includes fast 2-stem separation (vocals + instrumental) and the waveform mixer. Upgrade to Premium for higher-quality modes and 4-stem expand.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="mt-3 flex gap-3">
                          <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 transition hover:bg-white/10">
                            <input type="radio" name="splitQuality" checked={quality === "speed"} onChange={() => onQualityChange("speed")} className="text-amber-300" />
                            2-stem fast
                          </label>
                          <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 transition hover:bg-white/10">
                            <input type="radio" name="splitQuality" checked={quality === "quality"} onChange={() => onQualityChange("quality")} className="text-amber-300" />
                            2-stem quality
                          </label>
                          <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/80 transition hover:bg-amber-500/20">
                            <input type="radio" name="splitQuality" checked={quality === "ultra"} onChange={() => onQualityChange("ultra")} className="text-amber-300" />
                            2-stem ultra
                          </label>
                        </div>
                        {quality === "speed" && (
                          <p className="mt-2 text-xs text-white/50">
                            Shortest wait. Great for previews and quick drafts. When you expand to four stems, they follow the same speed-focused pass.
                          </p>
                        )}
                        {quality === "quality" && (
                          <p className="mt-2 text-xs text-white/50">
                            Cleaner separation with more processing time. Good default for most tracks. Four-stem expand uses the same quality level.
                          </p>
                        )}
                        {quality === "ultra" && (
                          <p className="mt-2 text-xs text-amber-300/70">
                            Highest separation quality; slowest option and may need a capable server. Use when you need the cleanest possible stems.
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {splitResultStemsLength === 2 && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className={cn("rounded-2xl border border-amber-400/20 bg-amber-950/20 p-4", shouldGuideExpand && GUIDE_RING_STRONG)} transition={{ duration: 0.3 }}>
                      <p className="text-xs uppercase tracking-[0.3em] text-amber-200/80 mb-3">Go deeper</p>
                      <p className="text-sm text-white/70 mb-3">You have vocals + instrumental. Load to mixer or split the instrumental into drums, bass & other.</p>
                      {canExpandToFourStems ? (
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={onExpand} disabled={isExpanding} className={cn("fire-button inline-flex items-center gap-2 px-4 py-2.5 text-sm disabled:opacity-60", shouldGuideExpand && GUIDE_RING_SOFT)}>
                            {isExpanding ? "Expanding to 4 stems…" : "Keep going → 4 stems"}
                          </button>
                          <span className="text-xs text-white/50 self-center">or use the mixer to trim, level & export.</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <p className="text-xs text-amber-200/80">4-stem separation (drums, bass, other) is included in Premium and Studio.</p>
                          {onUpgradeToPremium && (
                            <button type="button" onClick={onUpgradeToPremium} className="w-fit rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-500/25">
                              Upgrade to Premium
                            </button>
                          )}
                        </div>
                      )}
                      <p className="mt-2 text-xs text-white/50">Fine-tune vocals (e.g. denoise) coming soon.</p>
                    </motion.div>
                  )}

                  {splitResultStemsLength > 0 && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.3 }}>
                      <p className="text-xs uppercase tracking-[0.3em] text-white/65">Pick stems to show</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {stemDefinitions.map((stem) => {
                          const on = selectedStems[stem.id] ?? false;
                          const base = "glow-toggle flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-medium transition-all duration-200";
                          const cls = `stem-toggle-${stem.id}`;
                          return on ? (
                            <button key={stem.id} type="button" onClick={() => onToggleStem(stem.id)} className={cn(base, cls, "stem-toggle-active border-current shadow-lg")} aria-pressed="true">
                              <span className="flex items-center gap-3"><span className={cn("stem-toggle-dot h-2.5 w-2.5 rounded-full stem-toggle-dot-on scale-110", cls)} />{stem.label}</span>
                              <span className="text-xs uppercase tracking-wider">On</span>
                            </button>
                          ) : (
                            <button key={stem.id} type="button" onClick={() => onToggleStem(stem.id)} className={cn(base, cls, "border-white/10 bg-white/5 text-white/70 hover:bg-white/10")} aria-pressed="false">
                              <span className="flex items-center gap-3"><span className={cn("stem-toggle-dot h-2.5 w-2.5 rounded-full", cls)} />{stem.label}</span>
                              <span className="text-xs uppercase tracking-wider opacity-50">Off</span>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}

                  {splitError && (
                    <div className="rounded-2xl border border-red-400/30 bg-red-950/30 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-red-200">Split failed</p>
                          <p className="mt-1 text-xs text-red-300/70">{splitError}</p>
                        </div>
                        <button type="button" onClick={onDismissError} className="text-red-300/60 hover:text-red-200 text-xs">Dismiss</button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      data-testid="split-generate-button"
                      onClick={onSplit}
                      disabled={!uploadedFile || isSplitting}
                      className={cn("fire-button flex-1 justify-center disabled:opacity-60", shouldGuideSplit && GUIDE_RING_SOFT)}
                    >
                      {isSplitting ? "Splitting stems..." : "Split and Generate Stem Rack"}
                    </button>
                    <button
                      type="button"
                      onClick={onAddToQueue}
                      disabled={!uploadedFile || isSplitting || !canUseBatchQueue}
                      title={canUseBatchQueue ? "Add to batch queue" : "Batch queue is a Premium+ feature"}
                      className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
                    >
                      Add to queue
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              aria-label="Choose audio file"
              onChange={(e) => onUploadFileInput(e.target.files?.[0] ?? null)}
            />
          </>
        )}
      </div>
    </div>
  );
}

