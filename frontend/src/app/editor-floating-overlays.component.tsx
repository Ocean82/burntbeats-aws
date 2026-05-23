import { motion, AnimatePresence } from "framer-motion";

export interface EditorFloatingOverlaysProps {
  reduceMotion: boolean;
  exportNotice: string | null;
}

/** Toast after export (breadcrumb covers split workflow; no scroll-away FAB). */
export function EditorFloatingOverlays({
  reduceMotion,
  exportNotice,
}: EditorFloatingOverlaysProps) {
  return (
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
  );
}
