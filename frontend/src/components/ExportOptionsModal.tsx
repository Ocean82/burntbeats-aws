import { useEffect, useMemo, useRef, useState } from "react";
import {
  estimateExportBytes,
  formatExportBytes,
  getExportSizeWarningLevel,
} from "../utils/exportSizeEstimate";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, FileAudio, Package, Check } from "lucide-react";
import { cn } from "../utils/cn";
import { useModalA11y } from "../hooks/useModalA11y";
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
}

export interface ExportOptions {
  format: ExportFormat;
  target: ExportTarget;
  normalize: boolean;
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
}: ExportOptionsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(isOpen, modalRef, onClose, { disableEscape: isExporting });
  const isTouchDevice = useIsTouchDevice();

  const [options, setOptions] = useState<ExportOptions>({
    format: "wav",
    target: "master",
    normalize: true,
  });

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
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              if (!isExporting) onClose();
            }}
          />
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="relative w-full max-w-md modal-viewport-height overflow-y-auto rounded-3xl border border-white/10 bg-[#1a1412]/95 p-4 shadow-2xl backdrop-blur-xl sm:p-6"
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="export-options-title"
              tabIndex={-1}
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="mb-6 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20">
                    <Download className="h-5 w-5 text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <h2
                      id="export-options-title"
                      className="break-words text-lg font-semibold text-white"
                    >
                      Export Options
                    </h2>
                    <p className="break-words text-xs text-white/65">
                      Configure your export settings
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  disabled={isExporting}
                  aria-label="Close export options"
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Format */}
              <fieldset className="mb-5">
                <legend className="mb-2 block text-xs font-medium uppercase tracking-wider text-white/60">
                  Format
                </legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {FORMAT_OPTIONS.map((format) => (
                    <button
                      key={format.value}
                      type="button"
                      onClick={() =>
                        setOptions((o) => ({ ...o, format: format.value }))
                      }
                      className={cn(
                        "rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
                        options.format === format.value
                          ? "border-amber-400/50 bg-amber-500/15 text-white"
                          : "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{format.label}</span>
                        {options.format === format.value && (
                          <Check className="h-3.5 w-3.5 text-amber-400" />
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] text-white/65">
                        {format.description}
                      </p>
                    </button>
                  ))}
                </div>
                {isTouchDevice && options.format === "wav" && (
                  <p className="mt-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200/80">
                    💡 MP3 is recommended on mobile — smaller file size and less memory usage.
                  </p>
                )}
              </fieldset>

              {/* Export Target */}
              <fieldset className="mb-5">
                <legend className="mb-2 block text-xs font-medium uppercase tracking-wider text-white/60">
                  What to export
                </legend>
                <div className="space-y-2">
                  {targetOptions.map((target) => {
                    const Icon = target.icon;
                    return (
                      <button
                        key={target.value}
                        type="button"
                        onClick={() =>
                          setOptions((o) => ({ ...o, target: target.value }))
                        }
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl border px-4 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
                          options.target === target.value
                            ? "border-amber-400/50 bg-amber-500/15 text-white"
                            : "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10",
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="h-4 w-4" />
                          <div className="min-w-0 text-left">
                            <span className="block break-words font-medium">
                              {target.label}
                            </span>
                            <span className="block break-words text-[10px] text-white/50">
                              {target.description}
                            </span>
                          </div>
                        </div>
                        {options.target === target.value && (
                          <Check className="h-4 w-4 text-amber-400" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {trackDurationSec > 0 && (
                <div
                  className={cn(
                    "mb-5 rounded-xl border px-4 py-3 text-sm",
                    sizeWarning === "large"
                      ? "border-amber-500/45 bg-amber-500/12 text-amber-100"
                      : sizeWarning === "medium"
                        ? "border-amber-400/25 bg-amber-500/8 text-amber-100/90"
                        : "border-white/10 bg-white/5 text-white/75",
                  )}
                  role="status"
                >
                  <p>
                    Estimated download size:{" "}
                    <span className="font-semibold tabular-nums text-white">
                      {formatExportBytes(estimatedBytes)}
                    </span>
                  </p>
                  {sizeWarning === "large" && (
                    <p className="mt-1.5 text-xs leading-relaxed text-amber-200/85">
                      Large download — WAV exports of long multi-stem sessions can exceed 200MB.
                      Consider MP3 on slower connections.
                    </p>
                  )}
                  {sizeWarning === "medium" && options.format === "wav" && (
                    <p className="mt-1 text-xs text-white/55">
                      WAV is uncompressed; MP3 yields a much smaller file.
                    </p>
                  )}
                </div>
              )}

              {/* Normalize Toggle */}
              <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="min-w-0">
                  <span className="block break-words text-sm font-medium text-white">
                    Normalize Audio
                  </span>
                  <span className="block break-words text-xs text-white/65">
                    Boost quiet mixes to a consistent loudness
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Toggle audio normalization"
                  title="Toggle audio normalization"
                  onClick={() =>
                    setOptions((o) => ({ ...o, normalize: !o.normalize }))
                  }
                  className={cn(
                    "relative h-6 w-11 rounded-full transition-colors",
                    options.normalize ? "bg-amber-500" : "bg-white/20",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all",
                      options.normalize ? "left-6" : "left-1",
                    )}
                  />
                </button>
              </div>

              {/* Export Button or Sample CTA */}
              {isSample ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-center">
                    <p className="text-sm font-medium text-amber-200">
                      Export is disabled for free samples
                    </p>
                    <p className="mt-1 text-xs text-white/70">
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
                    className="fire-button flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition"
                  >
                    View Plans & Pricing
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!isExporting) void onExport(options);
                  }}
                  disabled={isExporting}
                  className="fire-button flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
