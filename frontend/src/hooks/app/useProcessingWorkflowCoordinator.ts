import { useCallback, useRef, useState } from "react"

export interface UseProcessingWorkflowCoordinatorOptions {
  handleFile: (file: File | null) => void
  resetStemMediaState: () => void
}

export function useProcessingWorkflowCoordinator({
  handleFile,
  resetStemMediaState,
}: UseProcessingWorkflowCoordinatorOptions) {
  const [sourceMode, setSourceMode] = useState<"split" | "load">("split")
  const inputRef = useRef<HTMLInputElement | null>(null)
  const loadStemsInputRef = useRef<HTMLInputElement | null>(null)

  const handleFileFromInput = useCallback(
    (file: File | null) => {
      handleFile(file)
      if (!file) return
      resetStemMediaState()
    },
    [handleFile, resetStemMediaState],
  )

  const handleBrowseUpload = useCallback(() => inputRef.current?.click(), [])
  const handleClearUpload = useCallback(
    () => handleFileFromInput(null),
    [handleFileFromInput],
  )

  return {
    sourceMode,
    setSourceMode,
    inputRef,
    loadStemsInputRef,
    handleFileFromInput,
    handleBrowseUpload,
    handleClearUpload,
  }
}
