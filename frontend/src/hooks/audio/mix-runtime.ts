import type { PitchTempoPlugin } from "pitch-plugin"

import { createStemDspChain, trimStartOffsetAtElapsedWall, type StemDspChain } from "../../utils/audio"
import { buildStemSource } from "../../utils/stemSourceGraph"
import type { StemEditorState } from "../../stem-editor-state"

export interface MixRuntime {
  stemId: string
  dsp: StemDspChain
  source: AudioBufferSourceNode
  plugin: PitchTempoPlugin | null
  fadeNode: GainNode | null
}

export function createMixRuntime({
  context,
  stemId,
  buffer,
  stemState,
  plugin,
  usePlugin,
  elapsedWall,
  stemWallDuration,
  ensureMasterBus,
  bpm,
}: {
  context: AudioContext
  stemId: string
  buffer: AudioBuffer
  stemState: StemEditorState
  plugin: PitchTempoPlugin | null
  usePlugin: boolean
  elapsedWall: number
  stemWallDuration: number
  ensureMasterBus: (ctx: AudioContext) => GainNode
  bpm?: number
}): MixRuntime | null {
  const { trimEnd, startOffset } = trimStartOffsetAtElapsedWall(
    buffer,
    stemState,
    elapsedWall,
    usePlugin,
  )
  if (trimEnd - startOffset <= 0) return null

  const dsp = createStemDspChain(
    context,
    stemState.mixer,
    Math.pow(10, stemState.mixer.gain / 20),
    { bpm },
  )
  const { source, fadeNode } = buildStemSource(
    context,
    buffer,
    stemState,
    startOffset,
    trimEnd,
    dsp.input,
    plugin,
    stemWallDuration,
    elapsedWall,
  )
  dsp.output.connect(ensureMasterBus(context))
  return { stemId, dsp, source, plugin, fadeNode }
}
