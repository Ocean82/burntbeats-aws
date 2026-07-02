# MIDI editor (DAW-familiar, CPU-only)

Scoped mini-editor for Audio→MIDI: multi-track piano roll, transport, sub-lanes, inspector.

## Layout

```
MidiEditorShell (xl: grid — body | 280px inspector)
├── MidiTransportBar       Play / Pause / Stop / clip-relative time / loop
├── MidiEditorToolbar      Tools / snap / lanes / CC / automation / MIDI record
├── MidiTrackList          Mute / solo / instrument per track
├── MidiEditorCanvas       Piano roll (SVG or Canvas2D at 400+ notes) + ruler
├── Sub-lanes (scroll-sync under roll) Velocity / CC / Automation
├── MidiEditorSelectionInfo
└── Inspector column       Render, MIDI FX, Smart chords, Harmony (not timeline lanes)
```

Timeline scale: **80px/s** at horizontal zoom 1.0 (`TIMELINE_LEFT_MARGIN` = 56px piano gutter). Horizontal zoom range **0.5–3**.

## Time model

- `useMidiPlayback.currentTime` is **clip-relative** (0 = first audible note).
- Transport displays `currentTime / duration` (both relative to clip start).
- Canvas playhead = `minStart + currentTime` (absolute timeline seconds).
- Ruler seek passes **absolute** time; playback converts internally.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space | Play / Pause / Stop |
| 1–3 | Select / Draw / Erase |
| S | Split tool |
| 4–7 | Notes / Velocity / CC / Automation lanes |
| Del | Delete selection |
| Ctrl+D | Duplicate |
| Ctrl+Z/Y | Undo / Redo |
| Ctrl+C/V/X | Copy / Paste / Cut |
| Ctrl+J | Join adjacent notes (same pitch) |

## Implemented

- Clip-relative transport with pause/resume, seek, loop scheduling
- Grid snap via `midiEditorSnap.ts` (time signature aware bar lines)
- Unified timeline scroll (`useMidiTimelineLayout`) across piano roll and sub-lanes
- Multi-track mute/solo playback and `exportTracksToMidi` with CC lanes
- Velocity / CC / automation lanes (automation maps to CC7, CC10, CC74)
- Canvas2D note layer when `notes.length >= 400` (SVG fallback below)
- Web MIDI input arm toggle (when `navigator.requestMIDIAccess` available); note-off closes recorded note duration; held notes finalize on pause/stop
- Per-track instrument selection (piano / synth / bass / strings)
- Undo for velocity and CC edits via `beginEditGesture` / `setNoteVelocity`
- **Source vs converted comparison** (`MidiComparisonPanel`): Transport-synced “Play both”, scrub pauses playback
- **WYSIWYG render**: live editor notes sent to `/api/midi/render` when multi-track or modified (`midiRenderRequest.ts`)
- **Soundfont picker** on render control (`MidiRenderAudioControl`); health from `/api/midi/soundfonts`
- **Batch multi-track editor**: per-stem `sourceJobId` for save/render (`midiBatchTracks.ts`, “Save all stems”)
- **Rhythm groove insert**: `MidiRhythmGroovePanel` in Process dialog (new track) and Library rhythm tab (preview/download); API via `/api/midi/rhythm`
- **Shared audio engine** (`audio/audioEngine.ts`) — preview aux bus + editor instrument pool; editor play stops preview transport

## Groove insert (editor)

1. Open **Process** overflow in the MIDI editor.
2. Use **Generate groove** — styles from `GET /api/midi/rhythm/styles`.
3. **Insert groove** adds a new track (`useMidiEditor.addTrackWithNotes`); drum-like pitches use synth voice.
4. Library **Rhythms** tab exposes the same generator with preview/download (no editor mount).

## Processing model (two phases)

| Phase | UI | When | What |
| --- | --- | --- | --- |
| Convert | `MidiConvertSettings` | Before/during Audio→MIDI job | Server-side: confidence threshold, quantize, velocity normalize (`midi_service` post-process) |
| Edit | `MidiProcessDialog` | After conversion in piano roll | Client-side: velocity/filter/quantize on current track notes + groove insert |

Stem separation uses `ProcessingSettingsPanel` — separate workflow, not MIDI note editing.

## Known limitations

- No mid-sequence time signature or tempo map changes
- Built-in Tone.js synth for in-browser preview; SoundFont render is server-side only
- Preview roll and editor share **80px/s** base scale; zoom state is per-session until view→edit handoff is restored
- Web MIDI records on active track only while transport is playing (armed + play)
- `parseMidiNotes` supports SMPTE division (fps × ticks/frame); invalid SMPTE falls back with warning
- Groove generation uses offline engine when `/api/midi/rhythm` is unreachable (cached styles when available)

## Files

| Area | Primary files |
| --- | --- |
| Playback | `hooks/useMidiPlayback.ts`, `hooks/useMidiInstruments.ts`, `audio/audioEngine.ts` |
| Editor state | `hooks/useMidiEditor.ts` |
| Comparison / render | `MidiComparisonPanel.tsx`, `midiRenderRequest.ts`, `MidiRenderAudioControl.tsx` |
| Rhythm | `api/midiRhythm.ts`, `MidiRhythmGroovePanel.tsx`, `utils/rhythmGrooveNotes.ts` |
| UI shell | `MidiNoteEditor.tsx`, `MidiEditorCanvas.tsx`, `MidiTimelineRuler.tsx`, `MidiProcessDialog.tsx` |
| Export | `utils/midiExport.ts` |
| Web MIDI | `hooks/useWebMidiInput.ts` |
