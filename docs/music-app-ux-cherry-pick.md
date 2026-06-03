# music-app UX cherry-pick (TEMP → production)

Scope: editor and mixer patterns only. Do not merge TEMP backend, generative models, or auth.

## Shipped surface today

- **DJ mixer / editor:** `frontend/src/components/dj-mode/DjModeEditor.tsx`
- **Pitch/tempo:** `frontend/src/components/multi-stem-editor/pitch-tempo-plugin/` (wired via `stemPlaybackUtils.ts`)
- **MIDI convert UI:** `frontend/src/components/midi-convert/`
- **Speech clean:** `frontend/src/pages/SpeechCleanPage.tsx`

## TEMP → prod component map

| TEMP (music-app) | Production target | Cherry-pick idea |
|------------------|-------------------|------------------|
| `AdvancedStemMixer` | `DjModeEditor` + mixer strips | Per-stem solo/mute grouping, compact strip density |
| `EnhancedWaveformEditor` / `MusicEditor` | `multi-stem-editor/*` lanes | Ruler snap feedback, zoom presets |
| Integration dashboard (`App.tsx` routes) | Compose hub / nav | “Recent jobs” card layout, status chips |
| Stem processing panels | `stem-processing-panel.component.tsx` | Progress copy for long Demucs jobs |

## pitch-tempo-plugin sync (2026-06-03)

Hash diff: 21 source files differ; production is **newer**:

- Prod imports `frontend/src/constants/mixerRanges.ts` for pitch/tempo bounds.
- TEMP uses fixed ±3 semitones and 0.85–1.15 tempo ratio.

**Action:** Keep production as source of truth. Optional: copy `LICENSE` from TEMP into embedded plugin if redistribution requires it.

## Do not port

- AudioCraft / MusicGen, RVC, beats v8, spectral AI bundles
- Hardcoded admin emails, separate TEMP docker stack
- TEMP `services/*.ts` flat scrap

## Suggested next UX passes (product-owned)

1. DJ mode: compare lane header layout to TEMP `AdvancedStemMixer` screenshots.
2. Empty states on Compose when `stem_service` warming (now gated by compose health).
3. MIDI convert: job list density from TEMP dashboard patterns.
