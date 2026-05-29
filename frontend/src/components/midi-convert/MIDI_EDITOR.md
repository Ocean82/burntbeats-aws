# MIDI editor (DAW-familiar, CPU-only)

Scoped mini-editor for Audio→MIDI: one clip, piano roll, transport, inspector.

## Layout

```
MidiEditorShell
├── MidiTransportBar     Play / Stop / time / BPM
├── MidiEditorToolbar    Tools / snap / undo / draw vel / export
├── MidiEditorCanvas     SVG piano roll + playhead (fixed px/sec, horizontal scroll)
├── MidiEditorSelectionInfo
└── shortcut hints
```

## Implemented

- `midi-tokens.css` + physical controls
- Shell + transport; `useMidiPlayback`; playhead on canvas
- **Grid snap**: `midiEditorSnap.ts` — canvas snaps draw/move/resize; `useMidiEditor` snaps add/move/quantize
- **Horizontal scroll**: editor canvas (`BASE_PIXELS_PER_SECOND` × zoom); preview roll (`PREVIEW_PIXELS_PER_SECOND` = 60)
- Erase tool uses `cursor-crosshair` on canvas
- Velocity inspector: mixed selection shows average with `*`; slider no longer remounts on each velocity write
- **Pinch / ctrl+wheel zoom** on editor timeline (`useEditorCanvasZoomGestures`, 0.5×–2×)
- **MidiParamSlider**: native `<input type="range">` with DAW groove styling; `<label htmlFor>` for accessible names

## Known limitations

- **Touch**: one-finger pan scrolls; two-finger pinch zooms — no dedicated mobile toolbar or gesture hints.
- **Preview vs editor scale**: preview uses 60px/s; editor base is 80px/s (zoom 0.5–2).

## Next (optional)

- Metronome polish, toolbar quantize on selection (partially wired)
