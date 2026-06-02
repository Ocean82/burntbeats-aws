import { useMemo } from "react"

import { useAppSubscription } from "../useAppSubscription"
import { useAudioFileDuration } from "../useAudioFileDuration"
import { computeTokensFromDurationSeconds } from "../../utils/tokenCost"

export interface UseSubscriptionCoordinatorOptions {
  localDevFullApp: boolean
  splitResultStemsLength: number
  uploadedFile: File | null
  quality: "speed" | "quality"
}

export function useSubscriptionCoordinator({
  localDevFullApp,
  splitResultStemsLength,
  uploadedFile,
  quality,
}: UseSubscriptionCoordinatorOptions) {
  const {
    subscription,
    usageBalance,
    usageLoading,
    stemQualityOptions,
    canSplitFourStems,
    canExpandToFourStems,
    canUsePremiumStemQualities,
    canUseBatchQueue,
  } = useAppSubscription({
    localDevFullApp,
    splitResultStemsLength,
  })

  const uploadDurationSec = useAudioFileDuration(uploadedFile)
  const estimatedSplitTokens = useMemo(
    () => computeTokensFromDurationSeconds(uploadDurationSec),
    [uploadDurationSec],
  )
  const splitQuality = useMemo(
    () => (canUsePremiumStemQualities ? quality : "speed"),
    [canUsePremiumStemQualities, quality],
  )

  return {
    subscription,
    usageBalance,
    usageLoading,
    stemQualityOptions,
    canSplitFourStems,
    canExpandToFourStems,
    canUsePremiumStemQualities,
    canUseBatchQueue,
    uploadDurationSec,
    estimatedSplitTokens,
    splitQuality,
  }
}
