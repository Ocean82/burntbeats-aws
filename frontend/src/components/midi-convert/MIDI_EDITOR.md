# MIDI editor (DAW-familiar, CPU-only)

Scoped mini-editor for Audio→MIDI: one clip, piano roll, transport, inspector.

## Layout

```
MidiEditorShell
├── MidiTransportBar     Play / Stop / time / BPM
├── MidiEditorToolbar    Tools / snap / undo / draw vel / export
├── MidiEditorCanvas     SVG piano roll + playhead
├── MidiEditorSelectionInfo
└── shortcut hints
```

## Step A (done)

- `midi-tokens.css` + physical `MidiPhysicalButton` / `MidiPhysicalFader`
- Shell + transport row
- `useMidiPlayback` wired; Spacebar play/stop; playhead on canvas

## Next

- B: metronome, horizontal zoom
- C: quantize selection, Ctrl+D duplicate
- D: preview roll parity with editor
