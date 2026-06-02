import type { MutableRefObject } from "react"
import { PitchTempoPlugin } from "pitch-plugin"

export async function getOrCreatePlugin({
  context,
  stemId,
  pool,
  pluginAvailableRef,
}: {
  context: AudioContext
  stemId: string
  pool: Map<string, PitchTempoPlugin>
  pluginAvailableRef: MutableRefObject<boolean | null>
}): Promise<PitchTempoPlugin | null> {
  if (pluginAvailableRef.current === false) return null

  const existing = pool.get(stemId)
  if (existing) {
    existing.reset()
    return existing
  }

  try {
    const plugin = new PitchTempoPlugin({ audioContext: context })
    await plugin.ready()
    pool.set(stemId, plugin)
    pluginAvailableRef.current = true
    return plugin
  } catch (error) {
    console.warn(
      "[useAudioPlayback] PitchTempoPlugin init failed, using legacy playbackRate:",
      error,
    )
    pluginAvailableRef.current = false
    return null
  }
}

export function destroyAllPlugins(pool: Map<string, PitchTempoPlugin>) {
  pool.forEach((plugin) => plugin.destroy())
  pool.clear()
}
