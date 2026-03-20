import { motion, AnimatePresence } from "framer-motion";
import { X, Keyboard, HelpCircle } from "lucide-react";
import { KEYBOARD_SHORTCUTS } from "../hooks/useKeyboardShortcuts";

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
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
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-[#1a1412]/95 p-6 shadow-2xl backdrop-blur-xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="help-modal-title"
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
                    <Keyboard className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <h2 id="help-modal-title" className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
                    <p className="text-xs text-white/65">Quick actions for power users</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close help"
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Shortcuts List */}
              <div className="space-y-2">
                {uniqueShortcuts.map((shortcut) => (
                  <div
                    key={shortcut.action}
                    className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3 transition hover:bg-white/[0.06]"
                  >
                    <span className="text-sm text-white/80">{shortcut.description}</span>
                    <kbd className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs text-amber-200">
                      {shortcut.label}
                    </kbd>
                  </div>
                ))}
              </div>

              {/* Tips Section */}
              <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-start gap-3">
                  <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400/60" />
                  <div>
                    <p className="text-xs font-medium text-white/70">Pro Tips</p>
                    <ul className="mt-1.5 space-y-1 text-xs text-white/65">
                      <li>Press number keys 1-4 to quickly solo individual stems</li>
                      <li>Use Cmd/Ctrl + Z to undo mixer changes</li>
                      <li>Press Space to play/stop the mix hands-free</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-4 text-center">
                <p className="text-xs text-white/40">
                  Press <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px]">?</kbd> anytime to show this help
                </p>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
