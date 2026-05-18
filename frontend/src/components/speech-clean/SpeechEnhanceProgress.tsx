import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";

export interface SpeechEnhanceProgressProps {
  isEnhancing: boolean;
  isUploading: boolean;
  uploadProgress: number;
  enhanceProgress: number;
  statusMessage: string | null;
}

export function SpeechEnhanceProgress({
  isEnhancing,
  isUploading,
  uploadProgress,
  enhanceProgress,
  statusMessage,
}: SpeechEnhanceProgressProps) {
  const pct = isUploading ? uploadProgress : enhanceProgress;

  return (
    <AnimatePresence>
      {isEnhancing && (
        <motion.div
          key="speech-progress"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          style={{ overflow: "hidden" }}
          className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-950/30 px-4 py-3"
          role="status"
          aria-live="polite"
          aria-label={
            isUploading
              ? `Uploading speech: ${Math.round(uploadProgress)}%`
              : `Enhancing speech: ${Math.round(enhanceProgress)}%`
          }
          data-testid="speech-enhance-progress"
        >
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-cyan-100">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-300" aria-hidden />
            {isUploading ? "Uploading recording…" : statusMessage || "Cleaning speech…"}
          </div>
          <ProgressBarInner
            isUploading={isUploading}
            enhanceProgress={enhanceProgress}
            pct={pct}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ProgressBarInner({
  isUploading,
  enhanceProgress,
  pct,
}: {
  isUploading: boolean;
  enhanceProgress: number;
  pct: number;
}) {
  return (
    <>
      <div className="mb-1 flex items-center justify-between text-[11px] text-cyan-200/60">
        <span>
          {isUploading
            ? "Sending to speech service"
            : enhanceProgress < 25
              ? "Denoising & restoring clarity"
              : enhanceProgress < 90
                ? "Enhancing bandwidth"
                : "Finalising WAV"}
        </span>
        <span className="tabular-nums">{Math.round(pct)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-cyan-950/50">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-sky-400 to-teal-300"
          initial={{ width: "0%" }}
          animate={{ width: `${Math.max(3, pct)}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </div>
    </>
  );
}
