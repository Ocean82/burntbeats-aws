import { useCallback, useEffect, useRef, useState } from "react";
import { usePhaseController } from "@/hooks/usePhaseController";
import { PhaseProvider } from "@/contexts/PhaseContext";
import { HeaderBar } from "./HeaderBar";
import { PhaseRouter } from "./PhaseRouter";
import type { SplitQuality } from "@/api";
import { useAppStore } from "@/store/appStore";
import type { SplitIntent } from "@shared/types";
import { MixerWorkspace } from "@/app/mixer-workspace.component";
import type { ComponentProps } from "react";
import { FirstRunStepBar } from "@/components/first-run/FirstRunStepBar";
import { FirstRunExportCue } from "@/components/first-run/FirstRunExportCue";
import { markFirstSplitComplete } from "@/api/referral";

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
  /** Simplified first-session wizard */
  firstRunMode?: boolean;
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
  firstRunMode = false,
}: TransitionalShellProps = {}) {
  const controller = usePhaseController();
  const { phase, transitionTo, error, setError } = controller;
  const firstSplitMarkedRef = useRef(false);

  // Subscribe to split result stems from the existing app store
  const splitResultStems = useAppStore((s) => s.splitResultStems);
  const splitProgress = useAppStore((s) => s.splitProgress);
  const splitStageLabel = useAppStore((s) => s.splitStageLabel);
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

  // First-run: auto-open workspace when stems arrive and mark onboarding complete
  useEffect(() => {
    if (!firstRunMode || splitResultStems.length === 0) return;
    if (phase === "splitting") {
      transitionTo("workspace");
    }
    if (!firstSplitMarkedRef.current) {
      firstSplitMarkedRef.current = true;
      void markFirstSplitComplete()
        .then(() => {
          window.dispatchEvent(new CustomEvent("burntbeats-first-split-complete"));
        })
        .catch(() => {
          firstSplitMarkedRef.current = false;
        });
    }
  }, [firstRunMode, splitResultStems.length, phase, transitionTo]);

  // When split completes, persist to sessionStorage (library + session restore)
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
          {firstRunMode && phase !== "workspace" ? (
            <div className="px-md pt-md">
              <FirstRunStepBar phase={phase} />
            </div>
          ) : null}
          {phase === "workspace" && mixerProps ? (
            <div data-testid="workspace" className="h-full">
              {firstRunMode ? (
                <FirstRunExportCue
                  onExport={() => window.dispatchEvent(new CustomEvent("open-export-modal"))}
                />
              ) : null}
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
              stageLabel={splitStageLabel}
              firstRunMode={firstRunMode}
            />
          )}
        </main>
      </div>
    </PhaseProvider>
  );
}
