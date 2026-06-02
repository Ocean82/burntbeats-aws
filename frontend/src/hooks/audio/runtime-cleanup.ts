import type { PitchTempoPlugin } from "pitch-plugin"
import type { StemDspChain } from "../../utils/audio"

interface MixStemRuntime {
  stemId: string
  dsp: StemDspChain
  source: AudioBufferSourceNode
  plugin: PitchTempoPlugin | null
  fadeNode: GainNode | null
}

export function stopMixStemRuntime(runtime: MixStemRuntime) {
  try {
    runtime.source.stop()
  } catch {
    // no-op: source already stopped
  }

  try {
    runtime.source.disconnect()
  } catch {
    // no-op: source already disconnected
  }

  if (runtime.plugin) {
    try {
      runtime.plugin.outputNode.disconnect()
    } catch {
      // no-op: plugin already disconnected
    }
  }

  if (runtime.fadeNode) {
    try {
      runtime.fadeNode.disconnect()
    } catch {
      // no-op: fade node already disconnected
    }
  }

  runtime.dsp.disconnect()
}
