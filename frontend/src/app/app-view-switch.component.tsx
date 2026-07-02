import { Suspense, type ComponentType, type LazyExoticComponent } from "react"
import { motion, type MotionProps } from "framer-motion"

import type { AppView } from "../hooks/workflow/useEditorViewRouting"
import type { UseSubscriptionResult } from "../hooks/useSubscription"
import type { UiLatencySnapshot } from "../hooks/useUiLatencyMonitor"
import type { TransitionalShellProps } from "../components/EditorAppShell"
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
  pricingPage: LazyExoticComponent<ComponentType<PricingPageProps>>
  myStemsPage: LazyExoticComponent<ComponentType<MyStemsPageProps>>
  speechPage: LazyExoticComponent<ComponentType<SpeechCleanPageProps>>
  midiPage: LazyExoticComponent<ComponentType<MidiConvertPageProps>>
  libraryPage: LazyExoticComponent<ComponentType<LibraryPageProps>>
  tunerPage: LazyExoticComponent<ComponentType<TunerPageProps>>
  /** Transitional editor shell (spec's phased split flow). */
  transitionalEditorShell: LazyExoticComponent<ComponentType<TransitionalShellProps>>
  /** Hub page (tool selection home). */
  hubPage: LazyExoticComponent<ComponentType<Record<string, never>>>
  /** Props forwarded to the transitional shell for split engine wiring. */
  transitionalShellProps?: TransitionalShellProps
  devLatencyStats?: UiLatencySnapshot
  onResetDevLatencyStats?: () => void
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
  pricingPage: PricingPage,
  myStemsPage: MyStemsPage,
  speechPage: SpeechPage,
  midiPage: MidiPage,
  libraryPage: LibraryPage,
  tunerPage: TunerPage,
  transitionalEditorShell: TransitionalEditorShell,
  hubPage: HubPage,
  transitionalShellProps,
  devLatencyStats,
  onResetDevLatencyStats,
}: AppViewSwitchProps) {
  return (
    <Suspense fallback={<PageSkeleton view={activeView} />}>
      {activeView === "hub" ? (
        <HubPage />
      ) : activeView === "pricing" ? (
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
          onClose={() => onSetActiveView("hub")}
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
          onBackToHub={() => onSetActiveView("hub")}
        />
      ) : activeView === "midi" ? (
        <MidiPage
          reduceMotion={reduceMotion}
          subscription={subscription}
          usageBalance={usageBalance}
          usageLoading={usageLoading}
          checkoutNotice={checkoutNotice}
          onViewPlans={() => onSetActiveView("pricing")}
          onBackToHub={() => onSetActiveView("hub")}
        />
      ) : activeView === "beats" ? (
        <LibraryPage
          reduceMotion={reduceMotion}
          subscription={subscription}
          checkoutNotice={checkoutNotice}
          onViewPlans={() => onSetActiveView("pricing")}
          onBackToHub={() => onSetActiveView("hub")}
          devTools={
            devLatencyStats && onResetDevLatencyStats
              ? {
                  latencyStats: devLatencyStats,
                  onResetLatencyStats: onResetDevLatencyStats,
                }
              : undefined
          }
        />
      ) : activeView === "tuner" ? (
        <TunerPage
          reduceMotion={reduceMotion}
          subscription={subscription}
          checkoutNotice={checkoutNotice}
          onViewPlans={() => onSetActiveView("pricing")}
          onGoToEditor={() => onSetActiveView("editor")}
          onBackToHub={() => onSetActiveView("hub")}
        />
      ) : (
        <TransitionalEditorShell {...(transitionalShellProps ?? {})} />
      )}
    </Suspense>
  )
}
