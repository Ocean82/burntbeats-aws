import { useMemo } from "react"

import type { BeatGridMetadata } from "../../api"
import { computeBeatGridPcts, shouldRenderBeatGrid } from "../../utils/beatGrid"

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export interface UseTimelineMetricsOptions {
  stems: { id: string }[]
  durations: Record<string, number>
  scrollPct: number
  zoom: number
  showBeatGrid: boolean
  beatGrid?: BeatGridMetadata | null
  playheadPct: number
  visibleStart: number
  visibleRange: number
}

export function useTimelineMetrics({
  stems,
  durations,
  scrollPct,
  zoom,
  showBeatGrid,
  beatGrid,
  playheadPct,
  visibleStart,
  visibleRange,
}: UseTimelineMetricsOptions) {
  const maxDuration = useMemo(
    () => Math.max(...stems.map((stem) => durations[stem.id] ?? 0), 0),
    [stems, durations],
  )

  const ticks = useMemo(() => {
    const count = 8
    return Array.from({ length: count + 1 }, (_, i) => {
      const pct = i / count
      const visibleStartPct = scrollPct / 100
      const visibleEndPct = Math.min(1, visibleStartPct + 1 / zoom)
      const timePct = visibleStartPct + pct * (visibleEndPct - visibleStartPct)
      return { pct: pct * 100, time: timePct * maxDuration }
    })
  }, [scrollPct, zoom, maxDuration])

  const beatGridPcts = useMemo(() => {
    if (!showBeatGrid || !shouldRenderBeatGrid(beatGrid)) return []
    return computeBeatGridPcts({
      beatGrid: beatGrid as BeatGridMetadata,
      maxDuration,
      scrollPct,
      zoom,
    })
  }, [showBeatGrid, beatGrid, maxDuration, scrollPct, zoom])

  const playheadVisiblePct =
    clamp((playheadPct / 100 - visibleStart) / visibleRange, 0, 1) * 100

  return {
    maxDuration,
    ticks,
    beatGridPcts,
    playheadVisiblePct,
  }
}
