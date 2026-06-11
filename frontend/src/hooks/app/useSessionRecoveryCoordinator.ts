import { useCallback, useRef } from "react"

import { useLoadHistoryJob } from "../useLoadHistoryJob"
import { useSplitSessionLifecycle } from "../workflow/useSplitSessionLifecycle"
import { useToastStore } from "../../store/toastStore"
import { getBurntQuip } from "../../utils/burntQuips"
import type { AppView } from "../workflow/useEditorViewRouting"
import type { StemResult } from "../../types"
import type { AppState } from "../../store/appStore"

const FOCUS_MIXER_DELAY_MS = 200
const HISTORY_LOADED_PIPELINE_INDEX = 3
const SPLIT_PROGRESS_COMPLETE = 100

export interface UseSessionRecoveryCoordinatorOptions {
  isSplitting: boolean
  splitResultStemsLength: number
  splitJobId: string | null
  resetStemMediaState: () => void
  focusMixerSection: () => void
  setSplitError: (message: string | null) => void
  setActiveView: (view: AppView) => void
  setUploadState: (
    update: Partial<AppState> | ((prev: AppState) => Partial<AppState>),
  ) => void
}

export function useSessionRecoveryCoordinator({
  isSplitting,
  splitResultStemsLength,
  splitJobId,
  resetStemMediaState,
  focusMixerSection,
  setSplitError,
  setActiveView,
  setUploadState,
}: UseSessionRecoveryCoordinatorOptions) {
  const prevSplitJobIdRef = useRef<string | null>(null)
  const {
    hasCompletedFirstExport,
    setHasCompletedFirstExport,
    exportNotice,
    setExportNotice,
  } = useSplitSessionLifecycle({
    isSplitting,
    splitResultStemsLength,
    splitJobId,
    onResetStemMediaState: resetStemMediaState,
    onFocusMixer: focusMixerSection,
  })

  const applyHistoryStemsToStore = useCallback(
    ({
      stems,
      jobId,
      uploadName: historyName,
    }: {
      stems: StemResult[]
      jobId: string
      uploadName: string
    }) => {
      resetStemMediaState()
      prevSplitJobIdRef.current = jobId
      setUploadState((prev) => ({
        ...prev,
        uploadName: historyName,
        uploadedFile: null,
        splitResultStems: stems,
        splitJobId: jobId,
        loadedStems: [],
        splitError: null,
        isSplitting: false,
        splitProgress: SPLIT_PROGRESS_COMPLETE,
        pipelineIndex: HISTORY_LOADED_PIPELINE_INDEX,
      }))
    },
    [resetStemMediaState, setUploadState],
  )

  const { loadHistoryJob, loadingJobId } = useLoadHistoryJob({
    onLoaded: (payload) => {
      applyHistoryStemsToStore(payload)
      setActiveView("editor")
      window.setTimeout(() => {
        focusMixerSection()
      }, FOCUS_MIXER_DELAY_MS)
    },
    onError: (message) => setSplitError(message),
  })

  const { loadHistoryJob: loadHistoryJobToMidi, loadingJobId: loadingMidiJobId } =
    useLoadHistoryJob({
      onLoaded: (payload) => {
        applyHistoryStemsToStore(payload)
        setActiveView("midi")
      },
      onError: (message) => setSplitError(message),
    })

  const markSuccessfulExport = useCallback(() => {
    setExportNotice("Download started — check your browser's downloads folder.")
    setHasCompletedFirstExport(true)
    useToastStore.getState().addToast({
      message: getBurntQuip("exportSuccess"),
      type: "success",
      duration: 4000,
    })
  }, [setExportNotice, setHasCompletedFirstExport])

  return {
    hasCompletedFirstExport,
    exportNotice,
    markSuccessfulExport,
    loadingJobId,
    loadingMidiJobId,
    loadHistoryJob,
    loadHistoryJobToMidi,
  }
}
