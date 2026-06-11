import { lazy, Suspense } from "react";
import { viewSwitchMotion } from "../motion/presets";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { UpsellModal } from "../components/UpsellModal";
import { FeedbackChip } from "../components/FeedbackChip";
import { getBurntQuip } from "../utils/burntQuips";
import { EditorHeader } from "./editor-header.component";
import { WaitingGamePanel } from "./waiting-game-panel.component";
import { DevLatencyPanel } from "./dev-latency-panel.component";
import { DevHealthPanel } from "./dev-health-panel.component";
import { LazyModalLayer } from "./lazy-modal-layer.component";
import { AppBackgroundOrbs } from "./app-background-orbs.component";
import { EditorFloatingOverlays } from "./editor-floating-overlays.component";
import { SessionSidebar } from "./session-sidebar.component";
import { AppViewSwitch } from "./app-view-switch.component";
import {
  LazyEditorMainView,
  LazyLibraryPage,
  LazyMidiConvertPage,
  LazyMyStemsPage,
  LazyPricingPage,
  LazySpeechCleanPage,
  LazyTransitionalEditorShell,
  LazyTunerPage,
} from "./lazy-app-pages";
import type { EditorSession } from "../hooks/app/useEditorSession";

const OnboardingTour = lazy(() =>
  import("../components/OnboardingTour").then((m) => ({
    default: m.OnboardingTour,
  })),
);

export interface EditorAppShellProps {
  session: EditorSession;
}

export function EditorAppShell({ session }: EditorAppShellProps) {
  const { modals, workflow, split, subscription: sub, batch, mixer, ui, dev } = session;
  const { export: exp, recovery } = session;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--bg)] text-foreground">
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

      <AppBackgroundOrbs />
      <SessionSidebar
        hasCompletedFirstExport={exp.hasCompletedFirstExport}
        onViewPlans={() => ui.setActiveView("pricing")}
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1600px] flex-col gap-lg px-md py-md sm:px-lg lg:px-xl">
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
            dev.toast(getBurntQuip("redo"), { type: "undo" });
          }}
          openModal={modals.openModal}
          localDevFullApp={ui.localDevFullApp}
          subscription={sub.subscription}
          usageBalance={sub.usageBalance}
          usageLoading={sub.usageLoading}
          openFeedback={() => dev.emit("open-feedback")}
          openOnboarding={() => dev.emit("open-onboarding")}
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
            editorMainView={LazyEditorMainView}
            editorMainViewProps={session.editorMainViewProps}
            transitionalEditorShell={LazyTransitionalEditorShell}
            transitionalShellProps={{
              handleFile: split.handleFile,
              triggerSplit: split.triggerSplit,
              mixerProps: session.editorMainViewProps.mixerProps,
            }}
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
      <DevLatencyPanel
        latencyStats={dev.latencyStats}
        onResetLatencyStats={dev.resetLatencyStats}
      />
      <DevHealthPanel />

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
  );
}
