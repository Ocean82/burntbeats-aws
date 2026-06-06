# MIDI editor (DAW-familiar, CPU-only)

Scoped mini-editor for Audio→MIDI: multi-track piano roll, transport, sub-lanes, inspector.

## Layout

```
MidiEditorShell
├── MidiTransportBar       Play / Pause / Stop / clip-relative time / loop
├── MidiEditorToolbar      Tools / snap / lanes / CC / automation / MIDI record
├── MidiTrackList          Mute / solo / instrument per track
├── MidiEditorCanvas       Piano roll (SVG or Canvas2D at 400+ notes) + ruler
├── Sub-lanes (scroll-sync) Velocity / CC / Automation
├── MidiEditorSelectionInfo
└── shortcut hints
```

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

## Known limitations

- No mid-sequence time signature or tempo map changes
- No SoundFont loader; built-in Tone.js synth voices only
- Preview roll uses 60px/s; editor base is 80px/s (zoom 0.5–2)
- Web MIDI records on active track only while transport is playing (armed + play)

## Files

| Area | Primary files |
| --- | --- |
| Playback | `hooks/useMidiPlayback.ts`, `hooks/useMidiInstruments.ts` |
| Editor state | `hooks/useMidiEditor.ts` |
| UI shell | `MidiNoteEditor.tsx`, `MidiEditorCanvas.tsx`, `MidiTimelineRuler.tsx` |
| Export | `utils/midiExport.ts` |
| Web MIDI | `hooks/useWebMidiInput.ts` |
