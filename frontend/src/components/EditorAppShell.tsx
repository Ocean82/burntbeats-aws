import { useCallback, useEffect, useState } from "react";
import { usePhaseController } from "@/hooks/usePhaseController";
import { PhaseProvider } from "@/contexts/PhaseContext";
import { HeaderBar } from "./HeaderBar";
import { PhaseRouter } from "./PhaseRouter";
import type { SplitQuality } from "@/api";
import { useAppStore } from "@/store/appStore";

/** Key used in sessionStorage to persist split results (matches usePhaseController). */
const SPLIT_RESULT_KEY = "burnt-beats-split-result";

/**
 * EditorAppShell — Top-level shell for the transitional split flow.
 *
 * Manages the phase state machine via usePhaseController, provides phase
 * context to all descendants, and composes HeaderBar + PhaseRouter.
 *
 * Integrates with the existing app store: when splitResultStems are populated
 * (split completes), persists them to sessionStorage and transitions to workspace.
 * On mount, usePhaseController already restores to workspace if session data exists.
 */
export function EditorAppShell() {
  const controller = usePhaseController();
  const { phase, transitionTo, error, setError } = controller;

  // Subscribe to split result stems from the existing app store
  const splitResultStems = useAppStore((s) => s.splitResultStems);
  const splitProgress = useAppStore((s) => s.splitProgress);
  const isSplitting = useAppStore((s) => s.isSplitting);

  // Phase-specific local state
  const [fileName, setFileName] = useState("");
  const [_splitConfig, setSplitConfig] = useState<{
    quality: SplitQuality;
    stemCount: 2 | 4;
  } | null>(null);
  const [progress, setProgress] = useState(0);

  // Sync progress from app store when splitting
  useEffect(() => {
    if (isSplitting) {
      setProgress(splitProgress);
    }
  }, [isSplitting, splitProgress]);

  // When split completes (splitResultStems populated), persist to sessionStorage
  // and transition to workspace phase (Req 1.2, 1.7)
  useEffect(() => {
    if (splitResultStems.length > 0 && phase !== "workspace") {
      try {
        const persistData = JSON.stringify({
          stemIds: splitResultStems.map((s) => s.id),
          stemCount: splitResultStems.length,
          timestamp: Date.now(),
        });
        sessionStorage.setItem(SPLIT_RESULT_KEY, persistData);
      } catch {
        // sessionStorage write failed — still transition to workspace
      }
      transitionTo("workspace");
    }
  }, [splitResultStems, phase, transitionTo]);

  // Also persist on mount if stems already exist (covers page loaded with existing results)
  useEffect(() => {
    if (splitResultStems.length > 0) {
      try {
        const existing = sessionStorage.getItem(SPLIT_RESULT_KEY);
        if (!existing) {
          const persistData = JSON.stringify({
            stemIds: splitResultStems.map((s) => s.id),
            stemCount: splitResultStems.length,
            timestamp: Date.now(),
          });
          sessionStorage.setItem(SPLIT_RESULT_KEY, persistData);
        }
      } catch {
        // Ignore sessionStorage errors
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileAccepted = useCallback(
    (file: File) => {
      setFileName(file.name);
      transitionTo("configure");
    },
    [transitionTo],
  );

  const handleConfigure = useCallback(
    (config: { quality: SplitQuality; stemCount: 2 | 4 }) => {
      setSplitConfig(config);
      setProgress(0);
      transitionTo("splitting");
    },
    [transitionTo],
  );

  const handleRetry = useCallback(() => {
    setError(null);
    setProgress(0);
    // Re-initiate split with the same configuration
  }, [setError]);

  return (
    <PhaseProvider controller={controller}>
      <div
        data-testid="editor-app-shell"
        className="flex h-full flex-col overflow-hidden bg-[hsl(220,15%,8%)]"
      >
        <HeaderBar phase={phase} onReset={controller.reset} className="shrink-0 mx-md mt-md sm:mx-lg sm:mt-lg" />

        <main className="flex-1 min-h-0">
          <PhaseRouter
            phase={phase}
            transitionTo={transitionTo}
            error={error}
            setError={setError}
            onFileAccepted={handleFileAccepted}
            fileName={fileName}
            onConfigure={handleConfigure}
            progress={progress}
            onRetry={handleRetry}
          />
        </main>
      </div>
    </PhaseProvider>
  );
}
