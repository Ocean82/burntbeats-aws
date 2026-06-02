import { motion, AnimatePresence } from "framer-motion";
import { X, Keyboard, HelpCircle } from "lucide-react";
import { useRef } from "react";
import { KEYBOARD_SHORTCUTS } from "../hooks/useKeyboardShortcuts";
import { useModalA11y } from "../hooks/useModalA11y";
import { useProductMotion } from "../motion/useProductMotion";

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const motionCfg = useProductMotion();
  useModalA11y(isOpen, modalRef, onClose);

  // Deduplicate shortcuts (some have both meta and ctrl variants)
  const uniqueShortcuts = KEYBOARD_SHORTCUTS.filter(
    (shortcut, index, self) =>
      index === self.findIndex((s) => s.action === shortcut.action)
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-modal-backdrop bg-secondary backdrop-blur-sm"
            {...motionCfg.modalBackdrop}
            onClick={onClose}
          />

          <div className="fixed inset-0 z-modal flex items-center justify-center p-sm sm:p-md">
            <motion.div
              className="relative w-full max-w-lg max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-3xl border border-border bg-popover/95 p-md shadow-elevation-xl backdrop-blur-xl sm:max-h-[calc(100vh-2rem)] sm:p-lg"
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="help-modal-title"
              tabIndex={-1}
              {...motionCfg.modalContent}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="mb-lg flex items-start justify-between gap-sm">
                <div className="flex min-w-0 items-center gap-sm">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/20">
                    <Keyboard className="h-5 w-5 text-primary-400" />
                  </div>
                  <div className="min-w-0">
                    <h2 id="help-modal-title" className="text-readable text-lg font-semibold text-foreground">Keyboard Shortcuts</h2>
                    <p className="text-readable text-xs text-muted-foreground">Faster editing from the keyboard</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close help"
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Shortcuts List */}
              <div className="space-y-xs">
                {uniqueShortcuts.map((shortcut) => (
                  <div
                    key={shortcut.action}
                    className="flex items-start justify-between gap-sm rounded-xl bg-muted/[0.03] px-md py-sm transition hover:bg-muted/[0.06]"
                  >
                    <span className="text-readable min-w-0 text-sm text-secondary-foreground">{shortcut.description}</span>
                    <kbd className="max-w-[45%] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-border bg-muted px-sm py-1 font-mono text-xs text-primary-200">
                      {shortcut.label}
                    </kbd>
                  </div>
                ))}
              </div>

              {/* Tips Section */}
              <div className="mt-lg rounded-xl border border-border bg-muted/[0.02] p-md">
                <div className="flex items-start gap-sm">
                  <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary-400/60" />
                  <div>
                    <p className="text-xs font-medium text-secondary-foreground">Pro Tips</p>
                    <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                      <li>Keys 1–4 solo Vocals, Drums, Bass, Melody (when those stems exist)</li>
                      <li>Ctrl+Z / ⌘Z undoes mixer changes</li>
                      <li>L toggles loop playback</li>
                      <li>Space plays or stops the mix</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-md text-center">
                <p className="text-readable text-xs text-muted-foreground">
                  Press <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">?</kbd> anytime to show this help
                </p>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
