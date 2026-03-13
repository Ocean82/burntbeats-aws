import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, FileAudio, Package, Check } from "lucide-react";
import { cn } from "../utils/cn";

export type ExportFormat = "wav" | "mp3" | "flac";
export type ExportQuality = "high" | "medium" | "low";
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
  quality: ExportQuality;
  target: ExportTarget;
  normalize: boolean;
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string; description: string }[] = [
  { value: "wav", label: "WAV", description: "Uncompressed, highest quality" },
  { value: "mp3", label: "MP3", description: "Compressed, smaller file size" },
  { value: "flac", label: "FLAC", description: "Lossless compression" },
];

const QUALITY_OPTIONS: { value: ExportQuality; label: string; bitrate: string }[] = [
  { value: "high", label: "High", bitrate: "320 kbps / 24-bit" },
  { value: "medium", label: "Medium", bitrate: "192 kbps / 16-bit" },
  { value: "low", label: "Low", bitrate: "128 kbps / 16-bit" },
];

const TARGET_OPTIONS: { value: ExportTarget; label: string; icon: typeof Download }[] = [
  { value: "master", label: "Master Mix Only", icon: FileAudio },
  { value: "stems", label: "Individual Stems", icon: Package },
  { value: "all", label: "Master + Stems (ZIP)", icon: Package },
];

export function ExportOptionsModal({
  isOpen,
  onClose,
  onExport,
  isExporting,
  stemCount,
}: ExportOptionsModalProps) {
  const [options, setOptions] = useState<ExportOptions>({
    format: "wav",
    quality: "high",
    target: "master",
    normalize: true,
  });

  const handleExport = () => {
    onExport(options);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#1a1412]/95 p-6 shadow-2xl backdrop-blur-xl"
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
                    <h2 className="text-lg font-semibold text-white">Export Options</h2>
                    <p className="text-xs text-white/65">Configure your export settings</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
                  disabled={isExporting}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Format Selection */}
              <div className="mb-5">
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-white/60">
                  Format
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {FORMAT_OPTIONS.map((format) => (
                    <button
                      key={format.value}
                      onClick={() => setOptions((o) => ({ ...o, format: format.value }))}
                      className={cn(
                        "rounded-xl border px-3 py-2.5 text-left transition",
                        options.format === format.value
                          ? "border-amber-400/50 bg-amber-500/15 text-white"
                          : "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{format.label}</span>
                        {options.format === format.value && (
                          <Check className="h-3.5 w-3.5 text-amber-400" />
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] text-white/65">{format.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quality Selection */}
              <div className="mb-5">
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-white/60">
                  Quality
                </label>
                <div className="flex gap-2">
                  {QUALITY_OPTIONS.map((quality) => (
                    <button
                      key={quality.value}
                      onClick={() => setOptions((o) => ({ ...o, quality: quality.value }))}
                      className={cn(
                        "flex-1 rounded-xl border px-3 py-2.5 text-center transition",
                        options.quality === quality.value
                          ? "border-amber-400/50 bg-amber-500/15 text-white"
                          : "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10"
                      )}
                    >
                      <span className="block font-medium">{quality.label}</span>
                      <span className="block text-[10px] text-white/65">{quality.bitrate}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Export Target */}
              <div className="mb-5">
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-white/60">
                  Export
                </label>
                <div className="space-y-2">
                  {TARGET_OPTIONS.map((target) => {
                    const Icon = target.icon;
                    return (
                      <button
                        key={target.value}
                        onClick={() => setOptions((o) => ({ ...o, target: target.value }))}
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl border px-4 py-3 transition",
                          options.target === target.value
                            ? "border-amber-400/50 bg-amber-500/15 text-white"
                            : "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="h-4 w-4" />
                          <span className="font-medium">{target.label}</span>
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
                  <span className="text-xs text-white/65">Optimize loudness for playback</span>
                </div>
                <button
                  onClick={() => setOptions((o) => ({ ...o, normalize: !o.normalize }))}
                  className={cn(
                    "relative h-6 w-11 rounded-full transition-colors",
                    options.normalize ? "bg-amber-500" : "bg-white/20"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform",
                      options.normalize ? "left-6" : "left-1"
                    )}
                  />
                </button>
              </div>

              {/* Export Button */}
              <button
                onClick={handleExport}
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
