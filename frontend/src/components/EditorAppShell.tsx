import { useCallback, useEffect, useState } from "react";
import { usePhaseController } from "@/hooks/usePhaseController";
import { PhaseProvider } from "@/contexts/PhaseContext";
import { HeaderBar } from "./HeaderBar";
import { PhaseRouter } from "./PhaseRouter";
import type { SplitQuality } from "@/api";
import { useAppStore } from "@/store/appStore";
import type { SplitIntent } from "@shared/types";
import { MixerWorkspace } from "@/app/mixer-workspace.component";
import type { ComponentProps } from "react";

/** Key used in sessionStorage to persist split results (matches usePhaseController). */
const SPLIT_RESULT_KEY = "burnt-beats-split-result";

/** Map the 2-tier product quality to SplitIntent's engine quality. */
function toIntentQuality(q: SplitQuality): "fast" | "high" {
  return q === "speed" ? "fast" : "high";
}

/**
 * Props passed from the parent shell to wire the transitional flow to the real
 * split engine and waveform editor. When absent, the component falls back to
 * standalone mode (reads directly from appStore, no workspace rendering).
 */
export interface TransitionalShellProps {
  /** Store the accepted file so triggerSplit can read it. */
  handleFile?: (file: File | null) => void;
  /** Initiate the real split engine. */
  triggerSplit?: (intent: SplitIntent, isSample?: boolean) => void;
  /** Props for MixerWorkspace rendered in the workspace phase. */
  mixerProps?: ComponentProps<typeof MixerWorkspace>;
}

/**
 * EditorAppShell — Top-level shell for the transitional split flow.
 *
 * Manages the phase state machine via usePhaseController, provides phase
 * context to all descendants, and composes HeaderBar + PhaseRouter.
 *
 * Integrates with the existing app store: when splitResultStems are populated
 * (split completes), persists them to sessionStorage and transitions to workspace.
 * On mount, usePhaseController already restores to workspace if session data exists.
 *
 * When session props are provided (from the parent editor shell), upload stores
 * the file via handleFile() and configure-confirm calls the real triggerSplit().
 * The workspace phase renders MixerWorkspace with the provided mixerProps.
 */
export function EditorAppShell({
  handleFile,
  triggerSplit,
  mixerProps,
}: TransitionalShellProps = {}) {
  const controller = usePhaseController();
  const { phase, transitionTo, error, setError } = controller;

  // Subscribe to split result stems from the existing app store
  const splitResultStems = useAppStore((s) => s.splitResultStems);
  const splitProgress = useAppStore((s) => s.splitProgress);
  const splitError = useAppStore((s) => s.splitError);

  // Phase-specific local state
  const [fileName, setFileName] = useState("");
  const [splitConfig, setSplitConfig] = useState<{
    quality: SplitQuality;
    stemCount: 2 | 4;
  } | null>(null);

  // Use splitProgress while in splitting phase (do not gate on isSplitting — it
  // flips false in the same tick as completion, which would zero progress before
  // transition effects run).
  const progress = phase === "splitting" ? splitProgress : 0;

  // When split completes (splitResultStems populated), persist to sessionStorage
  // but do NOT auto-navigate to workspace. Stems are available in the user's
  // library — they can open in editor from there, or the email notification
  // will link them back when ready.
  useEffect(() => {
    if (splitResultStems.length > 0) {
      try {
        const persistData = JSON.stringify({
          stemIds: splitResultStems.map((s) => s.id),
          stemCount: splitResultStems.length,
          timestamp: Date.now(),
        });
        sessionStorage.setItem(SPLIT_RESULT_KEY, persistData);
      } catch {
        // sessionStorage write failed — stems still available via library
      }
    }
  }, [splitResultStems]);

  // If the split engine reports an error, surface it in the splitting phase
  useEffect(() => {
    if (splitError && phase === "splitting") {
      setError(splitError);
    }
  }, [splitError, phase, setError]);

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
      // Store file in app store so triggerSplit can access it
      handleFile?.(file);
      transitionTo("configure");
    },
    [transitionTo, handleFile],
  );

  const handleConfigure = useCallback(
    (config: { quality: SplitQuality; stemCount: 2 | 4 }) => {
      setSplitConfig(config);
      transitionTo("splitting");

      // Build the SplitIntent and call the real split engine
      if (triggerSplit) {
        const intent: SplitIntent = {
          task: "full_separation",
          mode: String(config.stemCount) as "2" | "4",
          quality: toIntentQuality(config.quality),
        };
        triggerSplit(intent, false);
      }
    },
    [transitionTo, triggerSplit],
  );

  const handleRetry = useCallback(() => {
    setError(null);
    if (triggerSplit && splitConfig) {
      const intent: SplitIntent = {
        task: "full_separation",
        mode: String(splitConfig.stemCount) as "2" | "4",
        quality: toIntentQuality(splitConfig.quality),
      };
      triggerSplit(intent, false);
    }
  }, [setError, triggerSplit, splitConfig]);

  const handleChangeFile = useCallback(() => {
    handleFile?.(null);
    setFileName("");
    setError(null);
    transitionTo("upload");
  }, [handleFile, setError, transitionTo]);

  return (
    <PhaseProvider controller={controller}>
      <div
        data-testid="editor-app-shell"
        className="flex h-full flex-col bg-[hsl(220,15%,8%)]"
      >
        <HeaderBar phase={phase} onReset={controller.reset} className="shrink-0 mx-md mt-md sm:mx-lg sm:mt-lg" />

        <main className="flex-1 min-h-0 overflow-y-auto">
          {phase === "workspace" && mixerProps ? (
            <div data-testid="workspace" className="h-full">
              <MixerWorkspace {...mixerProps} embedded />
            </div>
          ) : (
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
              onChangeFile={handleChangeFile}
            />
          )}
        </main>
      </div>
    </PhaseProvider>
  );
}
