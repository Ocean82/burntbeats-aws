import { useEffect, useMemo, useRef, useState } from "react";
import { fetchMasteringPresets, type MasteringPresetSummary } from "../api/master";
import {
  estimateExportBytes,
  formatExportBytes,
  getExportSizeWarningLevel,
} from "../utils/exportSizeEstimate";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, FileAudio, Package, Check } from "lucide-react";
import { cn } from "../utils/cn";
import { useModalA11y } from "../hooks/useModalA11y";
import { useProductMotion } from "../motion/useProductMotion";
import { useIsTouchDevice } from "../hooks/useIsTouchDevice";
import { useEventBus } from "../store/eventBus";

/** Master export codecs exposed in-product. FLAC is deliberately omitted here: FLAC encoding is comparatively CPU-heavy for an AWS **CPU-only** stack; WAV (lossless) + MP3 meet current budgets. Keeping `"flac"` in this union preserves future guarded options without implying it ships today (`docs/roadmap/product-backlog.md`). */
export type ExportFormat = "wav" | "mp3" | "flac";
export type ExportTarget = "master" | "stems" | "all";

interface ExportOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (options: ExportOptions) => void;
  isExporting: boolean;
  stemCount: number;
  /** When false, only a rendered master mix can be exported (no server stem file downloads). */
  allowStemBundleTargets?: boolean;
  /** When true, the current session is a sample; block downloads and show upgrade CTA. */
  isSample?: boolean;
  /** Longest stem duration in seconds (for size estimate). */
  trackDurationSec?: number;
  /** Stem split job id — enables server mastering on master export. */
  splitJobId?: string | null;
}

export interface ExportOptions {
  format: ExportFormat;
  target: ExportTarget;
  normalize: boolean;
  /** Server-side genre mastering preset (master export only). */
  masteringPresetId?: string | null;
}

const FORMAT_OPTIONS: {
  value: ExportFormat;
  label: string;
  description: string;
}[] = [
  { value: "wav", label: "WAV", description: "Uncompressed, highest quality" },
  { value: "mp3", label: "MP3", description: "Compressed, smaller file size" },
];

const TARGET_OPTIONS_ALL: {
  value: ExportTarget;
  label: string;
  description: string;
  icon: typeof Download;
}[] = [
  {
    value: "master",
    label: "Master Mix",
    description: "All stems mixed to one file",
    icon: FileAudio,
  },
  {
    value: "stems",
    label: "Individual Stems",
    description: "One file per stem (from your separation job)",
    icon: Package,
  },
  {
    value: "all",
    label: "Master + Stems",
    description: "Master mix and all downloadable stems",
    icon: Package,
  },
];

export function ExportOptionsModal({
  isOpen,
  onClose,
  onExport,
  isExporting,
  stemCount,
  allowStemBundleTargets = true,
  isSample,
  trackDurationSec = 0,
  splitJobId = null,
}: ExportOptionsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const motionCfg = useProductMotion();
  useModalA11y(isOpen, modalRef, onClose, { disableEscape: isExporting });
  const isTouchDevice = useIsTouchDevice();

  const [options, setOptions] = useState<ExportOptions>({
    format: "wav",
    target: "master",
    normalize: true,
    masteringPresetId: null,
  });
  const [masteringPresets, setMasteringPresets] = useState<
    MasteringPresetSummary[] | null
  >(null);
  const presetFetchFailedRef = useRef(false);
  const presetsLoading = masteringPresets === null;

  useEffect(() => {
    if (
      !isOpen ||
      (masteringPresets !== null && !presetFetchFailedRef.current)
    ) {
      return;
    }
    let cancelled = false;
    void fetchMasteringPresets()
      .then((list) => {
        if (!cancelled) {
          presetFetchFailedRef.current = false;
          setMasteringPresets(list);
        }
      })
      .catch(() => {
        if (!cancelled) {
          presetFetchFailedRef.current = true;
          setMasteringPresets([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, masteringPresets]);

  // Default to MP3 on mobile devices (smaller files, less memory pressure)
  useEffect(() => {
    if (isOpen && isTouchDevice) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync state with device capability on open
      setOptions((o) => o.format === "wav" ? { ...o, format: "mp3" } : o);
    }
  }, [isOpen, isTouchDevice]);

  const targetOptions = allowStemBundleTargets
    ? TARGET_OPTIONS_ALL
    : TARGET_OPTIONS_ALL.filter((t) => t.value === "master");

  const estimatedBytes = useMemo(
    () =>
      estimateExportBytes({
        format: options.format,
        target: options.target,
        stemCount,
        durationSec: trackDurationSec,
      }),
    [options.format, options.target, stemCount, trackDurationSec],
  );
  const sizeWarning = getExportSizeWarningLevel(estimatedBytes);

  useEffect(() => {
    if (!isOpen || allowStemBundleTargets) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clamp target when bundle targets unavailable
    setOptions((o) => (o.target === "master" ? o : { ...o, target: "master" }));
  }, [isOpen, allowStemBundleTargets]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-modal-backdrop bg-secondary backdrop-blur-sm"
            {...motionCfg.modalBackdrop}
            onClick={() => {
              if (!isExporting) onClose();
            }}
          />
          <div className="fixed inset-0 z-modal flex items-center justify-center p-sm sm:p-md">
            <motion.div
              className="relative w-full max-w-md modal-viewport-height overflow-y-auto rounded-3xl border border-border bg-popover/95 p-md shadow-elevation-xl backdrop-blur-xl sm:p-lg"
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="export-options-title"
              tabIndex={-1}
              {...motionCfg.modalContent}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="mb-lg flex items-start justify-between gap-sm">
                <div className="flex min-w-0 items-center gap-sm">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/20">
                    <Download className="h-5 w-5 text-primary-400" />
                  </div>
                  <div className="min-w-0">
                    <h2
                      id="export-options-title"
                      className="text-readable text-lg font-semibold text-foreground"
                    >
                      Export Options
                    </h2>
                    <p className="text-readable text-xs text-muted-foreground">
                      Configure your export settings
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isExporting}
                  aria-label="Close export options"
                  className="tap-target-expand flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-[color,background-color] duration-[var(--motion-fast)] hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Format */}
              <fieldset className="mb-lg">
                <legend className="mb-xs block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Format
                </legend>
                <div className="grid grid-cols-1 gap-xs sm:grid-cols-2">
                  {FORMAT_OPTIONS.map((format) => (
                    <button
                      key={format.value}
                      type="button"
                      onClick={() =>
                        setOptions((o) => ({ ...o, format: format.value }))
                      }
                      aria-pressed={options.format === format.value}
                      className={cn(
                        "tap-feedback min-h-[44px] rounded-xl border px-sm py-sm text-left transition-[color,background-color,border-color,transform] duration-[var(--motion-fast)] ease-[var(--ease-out-quart)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.99]",
                        options.format === format.value
                          ? "border-primary-400/50 bg-primary-500/15 text-foreground"
                          : "border-border bg-muted text-secondary-foreground hover:border-primary-400/30 hover:bg-secondary",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{format.label}</span>
                        {options.format === format.value && (
                          <Check className="h-3.5 w-3.5 text-primary-400" />
                        )}
                      </div>
                      <p className="mt-0.5 text-helper text-muted-foreground">
                        {format.description}
                      </p>
                    </button>
                  ))}
                </div>
                {isTouchDevice && options.format === "wav" && (
                  <p className="mt-xs rounded-lg border border-primary-400/20 bg-primary-500/10 px-sm py-xs text-helper text-primary-200/80">
                    MP3 is recommended on mobile — smaller file size and less memory usage.
                  </p>
                )}
              </fieldset>

              {/* Export Target */}
              <fieldset className="mb-lg">
                <legend className="mb-xs block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  What to export
                </legend>
                <div className="space-y-xs">
                  {targetOptions.map((target) => {
                    const Icon = target.icon;
                    return (
                      <button
                        key={target.value}
                        type="button"
                        onClick={() =>
                          setOptions((o) => ({ ...o, target: target.value }))
                        }
                        aria-pressed={options.target === target.value}
                        className={cn(
                          "tap-feedback flex min-h-[44px] w-full items-center justify-between rounded-xl border px-md py-sm transition-[color,background-color,border-color,transform] duration-[var(--motion-fast)] ease-[var(--ease-out-quart)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.99]",
                          options.target === target.value
                            ? "border-primary-400/50 bg-primary-500/15 text-foreground"
                            : "border-border bg-muted text-secondary-foreground hover:border-primary-400/30 hover:bg-secondary",
                        )}
                      >
                        <div className="flex items-center gap-sm">
                          <Icon className="h-4 w-4" />
                          <div className="min-w-0 text-left">
                            <span className="text-readable block font-medium">
                              {target.label}
                            </span>
                            <span className="text-readable block text-helper text-muted-foreground">
                              {target.description}
                            </span>
                          </div>
                        </div>
                        {options.target === target.value && (
                          <Check className="h-4 w-4 text-primary-400" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {trackDurationSec > 0 && (
                <div
                  className={cn(
                    "mb-lg rounded-xl border px-md py-sm text-sm",
                    sizeWarning === "large"
                      ? "border-primary-500/45 bg-primary-500/12 text-primary-100"
                      : sizeWarning === "medium"
                        ? "border-primary-400/25 bg-primary-500/8 text-primary-100/90"
                        : "border-border bg-muted text-secondary-foreground",
                  )}
                  role="status"
                >
                  <p>
                    Estimated download size:{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatExportBytes(estimatedBytes)}
                    </span>
                  </p>
                  {sizeWarning === "large" && (
                    <p className="mt-1.5 text-xs leading-relaxed text-primary-200/85">
                      Large download — WAV exports of long multi-stem sessions can exceed 200MB.
                      Consider MP3 on slower connections.
                    </p>
                  )}
                  {sizeWarning === "medium" && options.format === "wav" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      WAV is uncompressed; MP3 yields a much smaller file.
                    </p>
                  )}
                </div>
              )}

              {(options.target === "master" || options.target === "all") &&
                splitJobId && (
                  <fieldset className="mb-lg">
                    <legend className="mb-xs block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Mastering preset
                    </legend>
                    <select
                      value={options.masteringPresetId ?? ""}
                      onChange={(e) =>
                        setOptions((o) => ({
                          ...o,
                          masteringPresetId: e.target.value || null,
                        }))
                      }
                      disabled={isExporting || presetsLoading}
                      className="w-full rounded-xl border border-border bg-muted px-sm py-sm text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="Mastering preset"
                    >
                      <option value="">None (mix only)</option>
                      {(masteringPresets ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {p.genre}
                        </option>
                      ))}
                    </select>
                    <p className="mt-xs text-helper text-muted-foreground">
                      Applies genre-aware EQ, compression, and limiting on export.
                    </p>
                  </fieldset>
                )}

              {/* Normalize Toggle */}
              <div className="mb-lg flex items-center justify-between gap-sm rounded-xl border border-border bg-muted px-md py-sm">
                <div className="min-w-0">
                  <span className="text-readable block text-sm font-medium text-foreground">
                    Normalize Audio
                  </span>
                  <span className="text-readable block text-xs text-muted-foreground">
                    Boost quiet mixes to a consistent loudness
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Toggle audio normalization"
                  title="Toggle audio normalization"
                  aria-pressed={options.normalize}
                  onClick={() =>
                    setOptions((o) => ({ ...o, normalize: !o.normalize }))
                  }
                  className={cn(
                    "tap-target-expand relative h-7 w-12 shrink-0 rounded-full transition-[background-color,box-shadow] duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    options.normalize ? "bg-primary-500" : "bg-secondary",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 h-4 w-4 rounded-full bg-muted shadow transition-all",
                      options.normalize ? "left-6" : "left-1",
                    )}
                  />
                </button>
              </div>

              {/* Export Button or Sample CTA */}
              {isSample ? (
                <div className="space-y-md">
                  <div className="rounded-xl border border-primary-400/30 bg-primary-500/10 p-md text-center">
                    <p className="text-sm font-medium text-primary-200">
                      Export is disabled for free samples
                    </p>
                    <p className="mt-1 text-xs text-secondary-foreground">
                      Upgrade to a plan to download full tracks and individual
                      stems.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      useEventBus.getState().emit("open-pricing");
                    }}
                    className="fire-button tap-feedback flex min-h-[44px] w-full items-center justify-center gap-xs rounded-xl py-sm text-sm font-semibold focus-visible:outline-none"
                  >
                    View plans & pricing
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!isExporting) void onExport(options);
                  }}
                  disabled={isExporting}
                  aria-busy={isExporting}
                  className="fire-button tap-feedback flex min-h-[44px] w-full items-center justify-center gap-xs rounded-xl py-sm text-sm font-semibold focus-visible:outline-none disabled:pointer-events-none"
                >
                  {isExporting ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-white" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Export{" "}
                      {options.target === "stems"
                        ? `${stemCount} Stems`
                        : options.target === "all"
                          ? "All Files"
                          : "Master"}
                    </>
                  )}
                </button>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
