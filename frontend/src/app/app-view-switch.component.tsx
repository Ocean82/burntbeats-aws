import { Suspense, type ComponentType, type LazyExoticComponent } from "react"
import { motion, type MotionProps } from "framer-motion"

import type { AppView } from "../hooks/workflow/useEditorViewRouting"
import type { UseSubscriptionResult } from "../hooks/useSubscription"
import type { EditorMainViewProps } from "./editor-main-view.component"
import { PageSkeleton } from "../views/PageSkeleton"
import type { StemHistoryJob } from "../api/stemHistory"
import type { PricingPageProps } from "../components/PricingPage"
import type { MyStemsPageProps } from "../components/MyStemsPage"
import type { SpeechCleanPageProps } from "../pages/SpeechCleanPage"
import type { MidiConvertPageProps } from "../pages/MidiConvertPage"
import type { LibraryPageProps } from "../pages/LibraryPage"
import type { TunerPageProps } from "../pages/TunerPage"

export interface AppViewSwitchProps {
  activeView: AppView
  reduceMotion: boolean
  viewSwitchMotion: (reduceMotion: boolean) => MotionProps
  pricingInitialTab: "subscriptions" | "packs"
  subscription: UseSubscriptionResult
  usageBalance: number | null
  usageLoading: boolean
  checkoutNotice: string | null
  hasCompletedFirstExport: boolean
  splitResultStemsLength: number
  loadingJobId: string | null
  loadingMidiJobId: string | null
  onSetActiveView: (view: AppView) => void
  onLoadHistoryJob: (job: StemHistoryJob) => Promise<void>
  onLoadHistoryJobToMidi: (job: StemHistoryJob) => Promise<void>
  editorMainViewProps: EditorMainViewProps
  pricingPage: LazyExoticComponent<ComponentType<PricingPageProps>>
  myStemsPage: LazyExoticComponent<ComponentType<MyStemsPageProps>>
  speechPage: LazyExoticComponent<ComponentType<SpeechCleanPageProps>>
  midiPage: LazyExoticComponent<ComponentType<MidiConvertPageProps>>
  libraryPage: LazyExoticComponent<ComponentType<LibraryPageProps>>
  tunerPage: LazyExoticComponent<ComponentType<TunerPageProps>>
  editorMainView: LazyExoticComponent<ComponentType<EditorMainViewProps>>
}

export function AppViewSwitch({
  activeView,
  reduceMotion,
  viewSwitchMotion,
  pricingInitialTab,
  subscription,
  usageBalance,
  usageLoading,
  checkoutNotice,
  hasCompletedFirstExport,
  splitResultStemsLength,
  loadingJobId,
  loadingMidiJobId,
  onSetActiveView,
  onLoadHistoryJob,
  onLoadHistoryJobToMidi,
  editorMainViewProps,
  pricingPage: PricingPage,
  myStemsPage: MyStemsPage,
  speechPage: SpeechPage,
  midiPage: MidiPage,
  libraryPage: LibraryPage,
  tunerPage: TunerPage,
  editorMainView: EditorMainView,
}: AppViewSwitchProps) {
  return (
    <Suspense fallback={<PageSkeleton view={activeView} />}>
      {activeView === "pricing" ? (
        <motion.section {...viewSwitchMotion(reduceMotion)}>
          <PricingPage
            subscription={subscription}
            onClose={() => onSetActiveView("editor")}
            initialTab={pricingInitialTab}
            usageContext={{
              hasCompletedFirstExport,
              splitsThisSession: splitResultStemsLength,
            }}
          />
        </motion.section>
      ) : activeView === "my-stems" ? (
        <MyStemsPage
          onClose={() => onSetActiveView("editor")}
          onOpenInMixer={(job: StemHistoryJob) => void onLoadHistoryJob(job)}
          onOpenInMidi={(job: StemHistoryJob) => void onLoadHistoryJobToMidi(job)}
          loadingMixerJobId={loadingJobId}
          loadingMidiJobId={loadingMidiJobId}
        />
      ) : activeView === "speech" ? (
        <SpeechPage
          reduceMotion={reduceMotion}
          subscription={subscription}
          usageBalance={usageBalance}
          usageLoading={usageLoading}
          checkoutNotice={checkoutNotice}
          onViewPlans={() => onSetActiveView("pricing")}
        />
      ) : activeView === "midi" ? (
        <MidiPage
          reduceMotion={reduceMotion}
          subscription={subscription}
          usageBalance={usageBalance}
          usageLoading={usageLoading}
          checkoutNotice={checkoutNotice}
          onViewPlans={() => onSetActiveView("pricing")}
        />
      ) : activeView === "library" ? (
        <LibraryPage
          reduceMotion={reduceMotion}
          subscription={subscription}
          checkoutNotice={checkoutNotice}
          onViewPlans={() => onSetActiveView("pricing")}
        />
      ) : activeView === "tuner" ? (
        <TunerPage
          reduceMotion={reduceMotion}
          subscription={subscription}
          checkoutNotice={checkoutNotice}
          onViewPlans={() => onSetActiveView("pricing")}
          onGoToEditor={() => onSetActiveView("editor")}
        />
      ) : (
        <EditorMainView {...editorMainViewProps} />
      )}
    </Suspense>
  )
}
