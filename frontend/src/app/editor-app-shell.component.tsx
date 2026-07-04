import { lazy, Suspense, useCallback, useEffect } from "react";
import { useUser } from "@clerk/react";
import { viewSwitchMotion } from "../motion/presets";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { UpsellModal } from "../components/UpsellModal";
import { FeedbackChip } from "../components/FeedbackChip";
import { getBurntQuip } from "../utils/burntQuips";
import { cn } from "../utils/cn";
import { EditorHeader } from "./editor-header.component";
import { AppTransportBar, type AppTransportBarProps } from "./app-transport-bar.component";
import { WaitingGamePanel } from "./waiting-game-panel.component";
import { DevOverlayControls } from "./dev-overlay-controls.component";
import { LazyModalLayer } from "./lazy-modal-layer.component";
import { AppBackgroundOrbs } from "./app-background-orbs.component";
import { EditorFloatingOverlays } from "./editor-floating-overlays.component";
import { SessionSidebar } from "./session-sidebar.component";
import { AppViewSwitch } from "./app-view-switch.component";
import { HubChrome } from "../components/hub";
import {
  consumeEditorTourPending,
  EDITOR_ONBOARDING_KEY,
  HUB_ONBOARDING_KEY,
} from "../data/onboardingSteps";
import { useAudio } from "../contexts/AudioContext";
import { useAppStore } from "../store/appStore";
import {
  LazyLibraryPage,
  LazyMidiConvertPage,
  LazyMyStemsPage,
  LazyPricingPage,
  LazySpeechCleanPage,
  LazyTransitionalEditorShell,
  LazyTunerPage,
  LazyHubPage,
} from "./lazy-app-pages";
import type { EditorSession } from "../hooks/app/useEditorSession";

const OnboardingTour = lazy(() =>
  import("../components/OnboardingTour").then((m) => ({
    default: m.OnboardingTour,
  })),
);

const EditorOnboardingTour = lazy(() =>
  import("../components/EditorOnboardingTour").then((m) => ({
    default: m.EditorOnboardingTour,
  })),
);

export interface EditorAppShellProps {
  session: EditorSession;
}

export function EditorAppShell({ session }: EditorAppShellProps) {
  const { user, isLoaded } = useUser();
  const { modals, workflow, split, subscription: sub, batch, mixer, ui, dev } = session;
  const { export: exp, recovery } = session;
  const audio = useAudio();
  const splitResultStems = useAppStore((s) => s.splitResultStems);
  const stemEditorStates = workflow.stemStates;

  const mixStemsLength = mixer.mixStems.length;
  const playbackReady = mixStemsLength > 0;

  const handlePlayPause = useCallback(() => {
    if (audio.isPlayingMix) {
      audio.handleStopMix();
    } else if (playbackReady) {
      void audio.handlePlayMix(splitResultStems, stemEditorStates, audio.stemBuffers);
    }
  }, [audio, playbackReady, splitResultStems, stemEditorStates]);

  const transportBarProps: AppTransportBarProps = {
    isPlaying: audio.isPlayingMix,
    playbackReady,
    loopEnabled: audio.loopEnabled,
    playheadPct: audio.playheadPosition ?? 0,
    maxDuration: mixer.mixStems.reduce((max, s) => Math.max(max, audio.stemBuffers[s.id]?.duration ?? 0), 0),
    masterVolume: audio.masterVolume,
    masterMuted: audio.masterVolume === 0,
    masterLimiterEnabled: audio.masterLimiterEnabled,
    isExporting: exp.isExporting,
    onPlayPause: handlePlayPause,
    onLoopToggle: () => audio.setLoopEnabled(!audio.loopEnabled),
    onMasterVolumeChange: (v: number) => audio.setMasterVolume(v),
    onMasterMuteToggle: () => audio.setMasterVolume(audio.masterVolume === 0 ? 1 : 0),
    onMasterLimiterToggle: () => audio.setMasterLimiterEnabled(!audio.masterLimiterEnabled),
    onExport: () => modals.openModal("export"),
    onSeek: (pct: number) => audio.handleSeekMix(pct),
  };

  const showTransport = ui.activeView === "editor";

  // Global event listeners for cross-component navigation (TokenMeter, PostSplitUpsell)
  useEffect(() => {
    const handlePricing = () => ui.setActiveView("pricing");
    const handlePremiumCheckout = () => {
      void sub.subscription.startCheckout("premium", {
        source: "post_split_upsell",
        intent: "post_split_upsell_premium",
      });
    };
    window.addEventListener("open-pricing-tab", handlePricing);
    window.addEventListener("start-premium-checkout", handlePremiumCheckout);
    return () => {
      window.removeEventListener("open-pricing-tab", handlePricing);
      window.removeEventListener("start-premium-checkout", handlePremiumCheckout);
    };
  }, [ui, sub.subscription]);

  // Auto-show hub onboarding tour for new users (post-plan-picker)
  useEffect(() => {
    const didOnboarding = localStorage.getItem(HUB_ONBOARDING_KEY);
    if (!isLoaded || didOnboarding === "true") return;
    if (ui.activeView !== "hub") return;
    const meta = user?.unsafeMetadata as Record<string, unknown> | undefined;
    if (meta?.planPickerSeen === true || !meta?.planPickerSeen) {
      const t = setTimeout(() => {
        window.dispatchEvent(new CustomEvent("open-onboarding"));
      }, 800);
      return () => clearTimeout(t);
    }
  }, [isLoaded, user, ui.activeView]);

  useEffect(() => {
    if (ui.activeView !== "editor") return;
    if (localStorage.getItem(EDITOR_ONBOARDING_KEY) === "true") return;
    if (!consumeEditorTourPending()) return;
    const t = setTimeout(() => {
      dev.emit("open-editor-onboarding");
    }, 600);
    return () => clearTimeout(t);
  }, [ui.activeView, dev]);

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-[var(--bg)] text-foreground">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-sticky -translate-y-[130%] rounded-xl border border-primary-400/50 bg-popover/95 px-md py-sm text-sm font-medium text-foreground shadow-elevation-md outline-none transition-transform duration-200 focus-visible:translate-y-0 focus-visible:ring-2 focus-visible:ring-primary-400/50"
      >
        Skip to main content
      </a>
      <ErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <OnboardingTour />
        </Suspense>
      </ErrorBoundary>
      <ErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <EditorOnboardingTour />
        </Suspense>
      </ErrorBoundary>
      <LazyModalLayer
        showHelpModal={modals.showHelpModal}
        showExportModal={modals.showExportModal}
        showPresetsModal={modals.showPresetsModal}
        closeModal={modals.closeModal}
        handleExportFromModal={exp.handleExportFromModal}
        isExporting={exp.isExporting}
        mixStemsLength={mixer.mixStems.length}
        exportAllowStemBundleTargets={exp.exportAllowStemBundleTargets}
        isSample={split.isSample}
        exportTrackDurationSec={exp.exportTrackDurationSec}
        splitJobId={split.splitJobId}
        handleLoadPreset={mixer.handleLoadPreset}
        mixerState={mixer.mixerState}
        trimMap={mixer.trimMap}
        mutedStems={mixer.mutedStems}
        pitchMap={mixer.pitchMap}
        timeStretchMap={mixer.timeStretchMap}
        fadeMap={mixer.fadeMap}
        batchQueue={batch.batchQueue}
        batchQueueExpanded={batch.batchQueueExpanded}
        setBatchQueueExpanded={batch.setBatchQueueExpanded}
        removeFromBatchQueue={batch.removeFromBatchQueue}
        clearCompletedFromQueue={batch.clearCompletedFromQueue}
        canUseBatchQueue={sub.canUseBatchQueue}
        processNextInQueue={batch.processNextInQueue}
        splitIntent={split.splitIntent}
        splitQuality={sub.splitQuality}
        setUploadState={split.setUploadState}
        setSplitError={split.setSplitError}
        onResetStemMediaState={session.resetStemMediaState}
      />

      {ui.activeView !== "hub" && <AppBackgroundOrbs />}
      {ui.activeView !== "hub" && (
        <SessionSidebar
          hasCompletedFirstExport={exp.hasCompletedFirstExport}
          onQuickExport={() => modals.openModal("export")}
        />
      )}

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {ui.activeView === "hub" ? (
          <HubChrome
            subscription={sub.subscription}
            usageBalance={sub.usageBalance}
            usageLoading={sub.usageLoading}
            localDevFullApp={ui.localDevFullApp}
            pricingActive={false}
            onOpenPricing={() => ui.setActiveView("pricing")}
            openModal={modals.openModal}
            openFeedback={() => dev.emit("open-feedback")}
            onRestartHomeTour={() => dev.emit("open-onboarding")}
            onOpenLegal={() => {
              window.open("/terms-of-service", "_blank", "noopener,noreferrer");
            }}
          />
        ) : null}
        <div
          className={cn(
            "mx-auto flex w-full max-w-[1600px] flex-col gap-lg",
            ui.activeView === "hub" ? "px-0 py-0" : "px-md py-md sm:px-lg lg:px-xl",
          )}
        >
          {ui.activeView !== "hub" && (
            <EditorHeader
              headerVisible={ui.headerVisible}
              activeView={ui.activeView}
              setActiveView={ui.setActiveView}
              canUndo={workflow.canUndo}
              canRedo={workflow.canRedo}
              onUndo={() => {
                workflow.undoStemStates();
                dev.toast(getBurntQuip("undo"), { type: "undo" });
              }}
              onRedo={() => {
                workflow.redoStemStates();
                dev.toast(getBurntQuip("undo"), { type: "undo" });
              }}
              openModal={modals.openModal}
              localDevFullApp={ui.localDevFullApp}
              subscription={sub.subscription}
              usageBalance={sub.usageBalance}
              usageLoading={sub.usageLoading}
              openFeedback={() => dev.emit("open-feedback")}
              openOnboarding={() => dev.emit("open-onboarding")}
              openEditorOnboarding={() => dev.emit("open-editor-onboarding")}
              editorWorkflow={
                ui.activeView === "editor"
                  ? {
                      uploadedFile: split.uploadedFile,
                      isSplitting: split.isSplitting,
                      mixStemsLength: mixer.mixStems.length,
                      isExporting: exp.isExporting,
                    }
                  : null
              }
            />
          )}

          {showTransport ? (
            <AppTransportBar {...transportBarProps} />
          ) : null}

          <main
            id="main-content"
            tabIndex={-1}
            aria-label="Main content"
            className="outline-none focus-visible:ring-2 focus-visible:ring-primary-400/35 focus-visible:ring-offset-[var(--bg)] rounded-4xl"
          >
            <AppViewSwitch
              activeView={ui.activeView}
              reduceMotion={ui.reduceMotion}
              viewSwitchMotion={viewSwitchMotion}
              pricingInitialTab={ui.pricingInitialTab}
              subscription={sub.subscription}
              usageBalance={sub.usageBalance}
              usageLoading={sub.usageLoading}
              checkoutNotice={ui.checkoutNotice}
              hasCompletedFirstExport={exp.hasCompletedFirstExport}
              splitResultStemsLength={split.splitResultStems.length}
              loadingJobId={recovery.loadingJobId}
              loadingMidiJobId={recovery.loadingMidiJobId}
              onSetActiveView={ui.setActiveView}
              onLoadHistoryJob={recovery.loadHistoryJob}
              onLoadHistoryJobToMidi={recovery.loadHistoryJobToMidi}
              pricingPage={LazyPricingPage}
              myStemsPage={LazyMyStemsPage}
              speechPage={LazySpeechCleanPage}
              midiPage={LazyMidiConvertPage}
              libraryPage={LazyLibraryPage}
              tunerPage={LazyTunerPage}
              hubPage={LazyHubPage}
              transitionalEditorShell={LazyTransitionalEditorShell}
              transitionalShellProps={{
                handleFile: split.handleFile,
                triggerSplit: split.triggerSplit,
                mixerProps: session.mixerProps,
              }}
              devLatencyStats={dev.latencyStats}
              onResetDevLatencyStats={dev.resetLatencyStats}
            />
          </main>
        </div>

        <WaitingGamePanel
          showGame={modals.showGame}
          isSplitting={split.isSplitting}
          reduceMotion={ui.reduceMotion}
          onToggle={modals.toggleGame}
          onClose={() => modals.closeModal("game")}
        />
        <DevOverlayControls
          latencyStats={dev.latencyStats}
          onResetLatencyStats={dev.resetLatencyStats}
          activeView={ui.activeView}
        />

        <EditorFloatingOverlays
          reduceMotion={ui.reduceMotion}
          exportNotice={exp.exportNotice}
        />
        {ui.activeView === "editor" && <FeedbackChip />}

        <UpsellModal
          open={ui.upsellOpen}
          onClose={() => ui.setUpsellOpen(false)}
          trigger={ui.upsellTrigger}
          balance={sub.usageBalance}
          onViewSubscriptions={() => {
            ui.setUpsellOpen(false);
            ui.setPricingInitialTab("subscriptions");
            ui.setActiveView("pricing");
          }}
          onBuyCredits={() => {
            ui.setUpsellOpen(false);
            ui.setPricingInitialTab("packs");
            ui.setActiveView("pricing");
          }}
        />
      </div>
    </div>
  );
}
