import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles } from "lucide-react";

export interface EditorFloatingOverlaysProps {
  reduceMotion: boolean;
  exportNotice: string | null;
  headerVisible: boolean;
  uploadedFile: File | null;
  splitResultCount: number;
  isSplitting: boolean;
}

/**
 * Toast after export and floating “Review & Split” affordance when the header scrolls away.
 */
export function EditorFloatingOverlays({
  reduceMotion,
  exportNotice,
  headerVisible,
  uploadedFile,
  splitResultCount,
  isSplitting,
}: EditorFloatingOverlaysProps) {
  return (
    <>
      <AnimatePresence>
        {exportNotice && (
          <motion.div
            key="export-notice"
            role="status"
            aria-live="polite"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: reduceMotion ? 0 : 0.25 }}
            className="pointer-events-none fixed bottom-20 left-1/2 z-[60] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-success-400/40 bg-success-950/95 px-md py-sm text-center text-sm text-success-50 shadow-elevation-md backdrop-blur-md sm:w-auto md:bottom-8"
          >
            {exportNotice}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!headerVisible && uploadedFile && splitResultCount === 0 && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed top-6 right-6 z-50 shadow-elevation-xl"
          >
            <button
              type="button"
              onClick={() => {
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="group flex h-12 items-center gap-sm rounded-full border border-primary-400/40 bg-primary-500/20 px-lg pr-2 font-bold shadow-[0_0_24px_rgba(255,140,80,0.25)] backdrop-blur-md transition-all hover:border-primary-400/80 hover:bg-primary-500/30 hover:scale-105 active:scale-95"
            >
              <div className="flex items-center gap-xs">
                {isSplitting ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary-300" />
                ) : (
                  <Sparkles className="h-4 w-4 text-primary-300" />
                )}
                <span className="text-sm text-primary-50">
                  {isSplitting ? "Splitting..." : "Review & Split"}
                </span>
              </div>
              <div className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary-400/20 text-primary-300 transition-colors group-hover:bg-primary-400 group-hover:text-primary-900">
                ↑
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
