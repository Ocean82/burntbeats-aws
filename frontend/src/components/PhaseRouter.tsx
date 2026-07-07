import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { LAYOUT } from "@/constants/layout";
import type { AppPhase } from "@/types/phases";
import type { SplitQuality } from "@/api";
import { UploadPhase } from "./phases/UploadPhase";
import { ConfigurePhase } from "./phases/ConfigurePhase";
import { SplittingPhase } from "./phases/SplittingPhase";
import { Workspace } from "./workspace/Workspace";

export interface PhaseRouterProps {
  /** Current active phase. */
  phase: AppPhase;
  /** Transition to a different phase. */
  transitionTo: (next: AppPhase) => void;
  /** Phase-level error state. */
  error: string | null;
  /** Set phase-level error. */
  setError: (msg: string | null) => void;

  // UploadPhase props
  onFileAccepted: (file: File) => void;

  // ConfigurePhase props
  fileName: string;
  onConfigure: (config: { quality: SplitQuality; stemCount: 2 | 4 }) => void;

  // SplittingPhase props
  progress: number;
  onRetry: () => void;
  estimatedSeconds?: number | null;
  /** Backend-reported processing stage label. */
  stageLabel?: string | null;

  // Change file (shared across configure and splitting phases)
  onChangeFile: () => void;
  /** First-time user simplified flow */
  firstRunMode?: boolean;
}

const TRANSITION_DURATION_S = LAYOUT.TRANSITION_DURATION / 1000;

/**
 * Routes to the active phase component with animated transitions.
 * Only the current phase's UI is rendered (phase exclusivity — Req 2.7).
 * Transitions use cross-fade + slide (Req 2.5).
 * Animations are skipped when prefers-reduced-motion is enabled (Req 2.6).
 */
export function PhaseRouter({
  phase,
  transitionTo,
  error,
  setError,
  onFileAccepted,
  fileName,
  onConfigure,
  progress,
  onRetry,
  estimatedSeconds,
  stageLabel,
  onChangeFile,
  firstRunMode = false,
}: PhaseRouterProps) {
  const prefersReducedMotion = useReducedMotion();

  const duration = prefersReducedMotion ? 0 : TRANSITION_DURATION_S;

  const variants = {
    initial: { opacity: 0, y: prefersReducedMotion ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: prefersReducedMotion ? 0 : -8 },
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={phase}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration, ease: "easeInOut" }}
        className="h-full w-full"
      >
        {phase === "upload" && (
          <UploadPhase
            transitionTo={transitionTo}
            setError={setError}
            error={error}
            onFileAccepted={onFileAccepted}
            firstRunMode={firstRunMode}
          />
        )}

        {phase === "configure" && (
          <ConfigurePhase
            transitionTo={transitionTo}
            fileName={fileName}
            onConfigure={onConfigure}
            onChangeFile={onChangeFile}
            firstRunMode={firstRunMode}
          />
        )}

        {phase === "splitting" && (
          <SplittingPhase
            transitionTo={transitionTo}
            progress={progress}
            error={error}
            onRetry={onRetry}
            estimatedSeconds={estimatedSeconds}
            onChangeFile={onChangeFile}
            stageLabel={stageLabel}
          />
        )}

        {phase === "workspace" && (
          <Workspace />
        )}
      </motion.div>
    </AnimatePresence>
  );
}
