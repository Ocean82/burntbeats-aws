import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, FileAudio, Package, Check } from "lucide-react";
import { cn } from "../utils/cn";
import { useModalA11y } from "../hooks/useModalA11y";

export type ExportFormat = "wav" | "mp3" | "flac";
export type ExportTarget = "master" | "stems" | "all";

interface ExportOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (options: ExportOptions) => void;
  isExporting: boolean;
  stemCount: number;
}

export interface ExportOptions {
  format: ExportFormat;
  target: ExportTarget;
  normalize: boolean;
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string; description: string; available: boolean }[] = [
  { value: "wav", label: "WAV", description: "Uncompressed, highest quality", available: true },
  { value: "mp3", label: "MP3", description: "Compressed, smaller file size", available: true },
  { value: "flac", label: "FLAC", description: "Lossless — coming soon", available: false },
];

const TARGET_OPTIONS: { value: ExportTarget; label: string; description: string; icon: typeof Download }[] = [
  { value: "master", label: "Master Mix", description: "All stems mixed to one file", icon: FileAudio },
  { value: "stems", label: "Individual Stems", description: "One file per stem", icon: Package },
  { value: "all", label: "Master + Stems", description: "Master mix and all stems", icon: Package },
];

export function ExportOptionsModal({
  isOpen,
  onClose,
  onExport,
  isExporting,
  stemCount,
}: ExportOptionsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(isOpen, modalRef, onClose, { disableEscape: isExporting });

  const [options, setOptions] = useState<ExportOptions>({
    format: "wav",
    target: "master",
    normalize: true,
  });

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
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#1a1412]/95 p-6 shadow-2xl backdrop-blur-xl"
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
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20">
                    <Download className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <h2 id="export-options-title" className="text-lg font-semibold text-white">Export Options</h2>
                    <p className="text-xs text-white/65">Configure your export settings</p>
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
              <div className="mb-5">
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-white/60">
                  Format
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {FORMAT_OPTIONS.map((format) => (
                    <button
                      key={format.value}
                      type="button"
                      onClick={() => format.available && setOptions((o) => ({ ...o, format: format.value }))}
                      disabled={!format.available}
                      aria-pressed={options.format === format.value}
                      className={cn(
                        "rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
                        !format.available && "cursor-not-allowed opacity-40",
                        format.available && options.format === format.value
                          ? "border-amber-400/50 bg-amber-500/15 text-white"
                          : format.available
                          ? "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10"
                          : "border-white/10 bg-white/5 text-white/40"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{format.label}</span>
                        {format.available && options.format === format.value && (
                          <Check className="h-3.5 w-3.5 text-amber-400" />
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] text-white/65">{format.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Export Target */}
              <div className="mb-5">
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-white/60">
                  What to export
                </label>
                <div className="space-y-2">
                  {TARGET_OPTIONS.map((target) => {
                    const Icon = target.icon;
                    return (
                      <button
                        key={target.value}
                        type="button"
                        onClick={() => setOptions((o) => ({ ...o, target: target.value }))}
                        aria-pressed={options.target === target.value}
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl border px-4 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
                          options.target === target.value
                            ? "border-amber-400/50 bg-amber-500/15 text-white"
                            : "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="h-4 w-4" />
                          <div className="text-left">
                            <span className="block font-medium">{target.label}</span>
                            <span className="text-[10px] text-white/50">{target.description}</span>
                          </div>
                        </div>
                        {options.target === target.value && (
                          <Check className="h-4 w-4 text-amber-400" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Normalize Toggle */}
              <div className="mb-6 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div>
                  <span className="block text-sm font-medium text-white">Normalize Audio</span>
                  <span className="text-xs text-white/65">Boost quiet mixes to a consistent loudness</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={options.normalize}
                  aria-label="Toggle audio normalization"
                  title="Toggle audio normalization"
                  onClick={() => setOptions((o) => ({ ...o, normalize: !o.normalize }))}
                  className={cn(
                    "relative h-6 w-11 rounded-full transition-colors",
                    options.normalize ? "bg-amber-500" : "bg-white/20"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all",
                      options.normalize ? "left-6" : "left-1"
                    )}
                  />
                </button>
              </div>

              {/* Export Button */}
              <button
                type="button"
                onClick={() => onExport(options)}
                disabled={isExporting}
                className="fire-button flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Export {options.target === "stems" ? `${stemCount} Stems` : options.target === "all" ? "All Files" : "Master"}
                  </>
                )}
              </button>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
