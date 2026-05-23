import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { collapseMotion, productTransition } from "../../motion/presets";

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
  const reduceMotion = useReducedMotion() ?? false;
  const collapse = collapseMotion(reduceMotion);
  const pct = isUploading ? uploadProgress : enhanceProgress;

  return (
    <AnimatePresence>
      {isEnhancing && (
        <motion.div
          key="speech-progress"
          {...collapse}
          className="mt-md rounded-xl border border-info-400/20 bg-info-950/30 px-md py-sm"
          role="status"
          aria-live="polite"
          aria-label={
            isUploading
              ? `Uploading speech: ${Math.round(uploadProgress)}%`
              : `Enhancing speech: ${Math.round(enhanceProgress)}%`
          }
          data-testid="speech-enhance-progress"
        >
          <div className="mb-xs flex items-center gap-xs text-sm font-medium text-info-100">
            <Loader2 className="h-4 w-4 animate-spin text-info-300" aria-hidden />
            {isUploading ? "Uploading recording…" : statusMessage || "Cleaning speech…"}
          </div>
          <ProgressBarInner
            isUploading={isUploading}
            enhanceProgress={enhanceProgress}
            pct={pct}
            reduceMotion={reduceMotion}
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
  reduceMotion,
}: {
  isUploading: boolean;
  enhanceProgress: number;
  pct: number;
  reduceMotion: boolean;
}) {
  return (
    <>
      <div className="mb-1 flex items-center justify-between text-helper text-info-200/60">
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
      <div className="h-2 w-full overflow-hidden rounded-full bg-info-950/50">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-info-500 via-sky-400 to-teal-300"
          initial={{ width: "0%" }}
          animate={{ width: `${Math.max(3, pct)}%` }}
          transition={productTransition(reduceMotion, "normal")}
        />
      </div>
    </>
  );
}
