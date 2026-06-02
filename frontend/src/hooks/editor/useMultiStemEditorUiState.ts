import { useCallback, useState } from "react"

const MIXER_STRIPS_KEY = "bb-prefer-mixer-strips"

export interface UseMultiStemEditorUiStateOptions {
  stemCount: number
  playbackReady: boolean
}

export function useMultiStemEditorUiState({
  stemCount,
  playbackReady,
}: UseMultiStemEditorUiStateOptions) {
  const [activePanel, setActivePanel] = useState<
    "pitch" | "eq" | "amplitude" | "time" | "fx" | null
  >(null)
  const [mixerConsoleOpen, setMixerConsoleOpen] = useState(false)
  const [showBeatGrid, setShowBeatGrid] = useState(false)
  const [userStripsPref, setUserStripsPref] = useState<boolean | null>(() => {
    if (typeof window === "undefined") return null
    const stored = localStorage.getItem(MIXER_STRIPS_KEY)
    if (stored === null) return null
    return stored === "1"
  })

  const showMixerStrips = userStripsPref ?? (stemCount > 0 && playbackReady)

  const toggleMixerStrips = useCallback(() => {
    const next = !showMixerStrips
    localStorage.setItem(MIXER_STRIPS_KEY, next ? "1" : "0")
    setUserStripsPref(next)
  }, [showMixerStrips])

  return {
    activePanel,
    setActivePanel,
    mixerConsoleOpen,
    setMixerConsoleOpen,
    showBeatGrid,
    setShowBeatGrid,
    userStripsPref,
    showMixerStrips,
    toggleMixerStrips,
  }
}
