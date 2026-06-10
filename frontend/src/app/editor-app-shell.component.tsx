import { lazy, Suspense } from "react";
import { viewSwitchMotion } from "../motion/presets";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { UpsellModal } from "../components/UpsellModal";
import { FeedbackChip } from "../components/FeedbackChip";
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
  const {
    reduceMotion,
    emit,
    canUndo,
    canRedo,
    undoStemStates,
    redoStemStates,
    showHelpModal,
    showExportModal,
    showPresetsModal,
    showGame,
    toggleGame,
    closeModal,
    headerVisible,
    activeView,
    setActiveView,
    localDevFullApp,
    subscription,
    usageBalance,
    usageLoading,
    uploadedFile,
    isSplitting,
    mixStems,
    isExporting,
    isSample,
    splitResultStems,
    splitJobId,
    splitIntent,
    splitQuality,
    setUploadState,
    setSplitError,
    handleExportFromModal,
    exportAllowStemBundleTargets,
    exportTrackDurationSec,
    handleLoadPreset,
    mixerState,
    trimMap,
    mutedStems,
    pitchMap,
    timeStretchMap,
    fadeMap,
    batchQueue,
    batchQueueExpanded,
    setBatchQueueExpanded,
    removeFromBatchQueue,
    clearCompletedFromQueue,
    canUseBatchQueue,
    processNextInQueue,
    hasCompletedFirstExport,
    checkoutNotice,
    loadingJobId,
    loadingMidiJobId,
    loadHistoryJob,
    loadHistoryJobToMidi,
    pricingInitialTab,
    editorMainViewProps,
    exportNotice,
    upsellOpen,
    setUpsellOpen,
    upsellTrigger,
    setPricingInitialTab,
    latencyStats,
    resetLatencyStats,
    toast,
    resetStemMediaState,
    openModal,
  } = session;

  return (
    <div className="min-h-screen overflow-x-hidden bg-(--bg) text-foreground">
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
        showHelpModal={showHelpModal}
        showExportModal={showExportModal}
        showPresetsModal={showPresetsModal}
        closeModal={closeModal}
        handleExportFromModal={handleExportFromModal}
        isExporting={isExporting}
        mixStemsLength={mixStems.length}
        exportAllowStemBundleTargets={exportAllowStemBundleTargets}
        isSample={isSample}
        exportTrackDurationSec={exportTrackDurationSec}
        splitJobId={splitJobId}
        handleLoadPreset={handleLoadPreset}
        mixerState={mixerState}
        trimMap={trimMap}
        mutedStems={mutedStems}
        pitchMap={pitchMap}
        timeStretchMap={timeStretchMap}
        fadeMap={fadeMap}
        batchQueue={batchQueue}
        batchQueueExpanded={batchQueueExpanded}
        setBatchQueueExpanded={setBatchQueueExpanded}
        removeFromBatchQueue={removeFromBatchQueue}
        clearCompletedFromQueue={clearCompletedFromQueue}
        canUseBatchQueue={canUseBatchQueue}
        processNextInQueue={processNextInQueue}
        splitIntent={splitIntent}
        splitQuality={splitQuality}
        setUploadState={setUploadState}
        setSplitError={setSplitError}
        onResetStemMediaState={resetStemMediaState}
      />

      <AppBackgroundOrbs />
      <SessionSidebar
        hasCompletedFirstExport={hasCompletedFirstExport}
        onViewPlans={() => setActiveView("pricing")}
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1600px] flex-col gap-lg px-md py-md sm:px-lg lg:px-xl">
        <EditorHeader
          headerVisible={headerVisible}
          activeView={activeView}
          setActiveView={setActiveView}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={() => {
            undoStemStates();
            toast("Changes undone", { type: "undo" });
          }}
          onRedo={() => {
            redoStemStates();
            toast("Changes redone", { type: "undo" });
          }}
          openModal={openModal}
          localDevFullApp={localDevFullApp}
          subscription={subscription}
          usageBalance={usageBalance}
          usageLoading={usageLoading}
          openFeedback={() => emit("open-feedback")}
          openOnboarding={() => emit("open-onboarding")}
          editorWorkflow={
            activeView === "editor"
              ? {
                  uploadedFile,
                  isSplitting,
                  mixStemsLength: mixStems.length,
                  isExporting,
                }
              : null
          }
        />

        <main
          id="main-content"
          tabIndex={-1}
          aria-label="Main content"
          className="outline-none focus-visible:ring-2 focus-visible:ring-primary-400/35 focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg) rounded-4xl"
        >
          <AppViewSwitch
            activeView={activeView}
            reduceMotion={reduceMotion}
            viewSwitchMotion={viewSwitchMotion}
            pricingInitialTab={pricingInitialTab}
            subscription={subscription}
            usageBalance={usageBalance}
            usageLoading={usageLoading}
            checkoutNotice={checkoutNotice}
            hasCompletedFirstExport={hasCompletedFirstExport}
            splitResultStemsLength={splitResultStems.length}
            loadingJobId={loadingJobId}
            loadingMidiJobId={loadingMidiJobId}
            onSetActiveView={setActiveView}
            onLoadHistoryJob={loadHistoryJob}
            onLoadHistoryJobToMidi={loadHistoryJobToMidi}
            pricingPage={LazyPricingPage}
            myStemsPage={LazyMyStemsPage}
            speechPage={LazySpeechCleanPage}
            midiPage={LazyMidiConvertPage}
            libraryPage={LazyLibraryPage}
            tunerPage={LazyTunerPage}
            editorMainView={LazyEditorMainView}
            editorMainViewProps={editorMainViewProps}
            transitionalEditorShell={LazyTransitionalEditorShell}
          />
        </main>
      </div>

      <WaitingGamePanel
        showGame={showGame}
        isSplitting={isSplitting}
        reduceMotion={reduceMotion}
        onToggle={toggleGame}
        onClose={() => closeModal("game")}
      />
      <DevLatencyPanel
        latencyStats={latencyStats}
        onResetLatencyStats={resetLatencyStats}
      />
      <DevHealthPanel />

      <EditorFloatingOverlays
        reduceMotion={reduceMotion}
        exportNotice={exportNotice}
      />
      {activeView === "editor" && <FeedbackChip />}

      <UpsellModal
        open={upsellOpen}
        onClose={() => setUpsellOpen(false)}
        trigger={upsellTrigger}
        balance={usageBalance}
        onViewSubscriptions={() => {
          setUpsellOpen(false);
          setPricingInitialTab("subscriptions");
          setActiveView("pricing");
        }}
        onBuyCredits={() => {
          setUpsellOpen(false);
          setPricingInitialTab("packs");
          setActiveView("pricing");
        }}
      />
    </div>
  );
}
