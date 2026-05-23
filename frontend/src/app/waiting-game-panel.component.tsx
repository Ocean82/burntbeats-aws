import { AnimatePresence, motion } from "framer-motion";
import { Gamepad2 } from "lucide-react";
import { lazy, Suspense } from "react";
import { cn } from "../utils/cn";

const importWaitingGame = () => import("../components/stem-fall/StemFall");
const WaitingGame = lazy(() => importWaitingGame());

interface WaitingGamePanelProps {
  showGame: boolean;
  isSplitting: boolean;
  reduceMotion: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function WaitingGamePanel({
  showGame,
  isSplitting,
  reduceMotion,
  onToggle,
  onClose,
}: WaitingGamePanelProps) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-label={showGame ? "Close The Waiting Game" : "Open The Waiting Game"}
        className={cn(
          "fixed bottom-0 right-2 z-50 flex items-center gap-xs rounded-t-xl border border-b-0 px-sm py-xs text-[10px] font-bold uppercase tracking-wider transition-all duration-300 sm:right-8 sm:px-md sm:py-sm sm:text-xs",
          showGame
            ? "border-primary-500/40 bg-primary-500/20 text-primary-200"
            : "border-border bg-chrome text-muted-foreground hover:text-foreground backdrop-blur-md",
          isSplitting && !showGame && "animate-pulse border-primary-500/50 text-primary-300",
        )}
      >
        <Gamepad2 className="h-3.5 w-3.5" />
        {showGame ? "close" : "THE WAITING GAME"}
        {isSplitting && !showGame && (
          <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary-400 animate-ping" />
        )}
      </button>

      <AnimatePresence>
        {showGame && (
          <motion.div
            key="waiting-game-panel"
            initial={{ y: reduceMotion ? 0 : "100%" }}
            animate={{ y: 0 }}
            exit={{ y: reduceMotion ? 0 : "100%" }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.28, ease: [0.25, 1, 0.5, 1] }
            }
            className="fixed bottom-0 left-0 right-0 z-40 flex justify-center"
          >
            <div className="w-full max-w-2xl rounded-t-[2rem] border border-b-0 border-border bg-chrome backdrop-blur-xl shadow-[0_-20px_60px_rgba(0,0,0,0.7)] px-lg pt-5 pb-md">
              <div className="mb-sm flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.35em] text-primary-400">
                    The Waiting Game
                  </span>
                  <p
                    className="text-[9px] text-muted-foreground mt-0.5"
                    style={{ fontFamily: "'Press Start 2P', monospace" }}
                  >
                    {isSplitting
                      ? "stems separating... play while you wait"
                      : "a quick break while tracks process"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-muted-foreground hover:text-foreground transition text-xs"
                  aria-label="Close game"
                >
                  ✕
                </button>
              </div>
              <Suspense
                fallback={
                  <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
                    Loading game...
                  </div>
                }
              >
                <WaitingGame />
              </Suspense>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
