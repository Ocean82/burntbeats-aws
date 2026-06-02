import { useMemo } from "react"

import { useExport } from "../useExport"
import { useExportCompare } from "../useExportCompare"
import { useExportModalAction } from "../useExportModalAction"
import type { StemResult } from "../../types"
import type { StemEditorState } from "../../stem-editor-state"

export interface UseExportCoordinatorOptions {
  splitJobId: string | null
  splitResultStems: StemResult[]
  loadedStemsLength: number
  stemBuffers: Record<string, AudioBuffer>
  stemStates: Record<string, StemEditorState>
  uploadName: string
  mixStems: StemResult[]
  visibleStems: Array<{ id: string }>
  setSplitError: (message: string | null) => void
  closeExportModal: () => void
  onSuccessfulExport: () => void
}

export function useExportCoordinator({
  splitJobId,
  splitResultStems,
  loadedStemsLength,
  stemBuffers,
  stemStates,
  uploadName,
  mixStems,
  visibleStems,
  setSplitError,
  closeExportModal,
  onSuccessfulExport,
}: UseExportCoordinatorOptions) {
  const {
    isExporting,
    handleExportWithOptions,
    compareMasterExportServerAndClient,
  } = useExport()

  const { isComparingExport, exportCompareSummary, onCompareExport } =
    useExportCompare({
      compareMasterExportServerAndClient,
      loadedStemCount: loadedStemsLength,
      splitJobId,
      splitResultStems,
      stemBuffers,
      stemStates,
      uploadName,
    })

  const handleExportFromModal = useExportModalAction({
    handleExportWithOptions,
    stemBuffers,
    mixStems,
    stemStates,
    uploadName,
    setSplitError,
    closeExportModal,
    loadedStemCount: loadedStemsLength,
    splitJobId,
    splitResultStems,
    onSuccessfulExport,
  })

  const exportTrackDurationSec = useMemo(
    () =>
      visibleStems.reduce(
        (maxDuration, stem) => Math.max(maxDuration, stemBuffers[stem.id]?.duration ?? 0),
        0,
      ),
    [visibleStems, stemBuffers],
  )

  const exportAllowStemBundleTargets = useMemo(
    () => mixStems.some((stem) => stem.url.includes("/api/stems/file/")),
    [mixStems],
  )

  return {
    isExporting,
    isComparingExport,
    exportCompareSummary,
    onCompareExport,
    handleExportFromModal,
    exportTrackDurationSec,
    exportAllowStemBundleTargets,
  }
}
