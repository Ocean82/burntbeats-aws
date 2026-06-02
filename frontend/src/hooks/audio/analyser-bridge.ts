import type { MutableRefObject } from "react"
import type { PitchTempoPlugin } from "pitch-plugin"
import type { StemDspChain } from "../../utils/audio"

interface MixStemRuntime {
  stemId: string
  dsp: StemDspChain
  source: AudioBufferSourceNode
  plugin: PitchTempoPlugin | null
  fadeNode: GainNode | null
}

export function getStemAnalyserFromRuntimes({
  currentPreviewRuntimeRef,
  mixStemRuntimesRef,
  stemId,
}: {
  currentPreviewRuntimeRef: MutableRefObject<MixStemRuntime | null>
  mixStemRuntimesRef: MutableRefObject<MixStemRuntime[]>
  stemId: string
}) {
  const previewRuntime = currentPreviewRuntimeRef.current
  if (previewRuntime?.stemId === stemId)
    return previewRuntime.dsp.getTimeDomainData()

  const mixRuntime = mixStemRuntimesRef.current.find(
    (runtime) => runtime.stemId === stemId,
  )
  if (!mixRuntime) return null
  return mixRuntime.dsp.getTimeDomainData()
}
