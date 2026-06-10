import { useCallback, useRef } from "react";
import { motion, useReducedMotion as useFramerReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/utils/cn";
import { EffectsPanel } from "./EffectsPanel";
import type { ToolCategory } from "@/types/tools";

export interface EffectsPanelBottomSheetProps {
  activeTool: ToolCategory;
  onClose: () => void;
  activeStemId?: string;
}

/**
 * EffectsPanelBottomSheet — mobile-only bottom sheet overlay for effects controls.
 *
 * - Animates up from the bottom of the screen.
 * - Occupies at most 60% of the viewport height.
 * - Dismissable by close button or swipe-down gesture (> 100px drag).
 * - Respects prefers-reduced-motion (skips animation).
 * - Renders EffectsPanel content in overlay mode.
 *
 * Requirements: 10.2, 10.4
 */
export function EffectsPanelBottomSheet({
  activeTool,
  onClose,
  activeStemId,
}: EffectsPanelBottomSheetProps) {
  const prefersReducedMotion = useFramerReducedMotion();
  const touchStartY = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartY.current === null) return;
      const deltaY = e.changedTouches[0].clientY - touchStartY.current;
      // Dismiss if swiped down more than 100px
      if (deltaY > 100) {
        onClose();
      }
      touchStartY.current = null;
    },
    [onClose],
  );

  const transition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.25, ease: "easeOut" };

  return (
    <>
      {/* Backdrop overlay */}
      <motion.div
        data-testid="bottom-sheet-backdrop"
        className="fixed inset-0 z-40 bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transition}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Bottom sheet */}
      <motion.div
        ref={sheetRef}
        data-testid="effects-bottom-sheet"
        role="dialog"
        aria-label="Effects panel"
        aria-modal="true"
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50",
          "rounded-t-2xl border-t border-white/10",
          "bg-[hsl(220,15%,12%)]/95 backdrop-blur-md",
          "flex flex-col overflow-hidden",
        )}
        style={{ maxHeight: "60vh" }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={transition}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle + close button header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
          {/* Swipe handle indicator */}
          <div className="mx-auto w-10 h-1 rounded-full bg-white/20" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close effects panel"
            className="absolute right-3 top-2 flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-y-auto">
          <EffectsPanel activeTool={activeTool} onClose={onClose} isOverlay activeStemId={activeStemId} />
        </div>
      </motion.div>
    </>
  );
}
