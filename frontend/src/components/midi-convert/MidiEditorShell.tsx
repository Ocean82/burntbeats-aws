/**
 * MIDI editor layout shell — controls, track list, piano roll, inspector.
 */
import type { ReactNode } from "react";
import "./midi-tokens.css";

export interface MidiEditorShellProps {
  controls: ReactNode;
  trackList?: ReactNode;
  pianoRoll: ReactNode;
  inspector: ReactNode;
  shortcuts?: ReactNode;
}

export function MidiEditorShell({
  controls,
  trackList,
  pianoRoll,
  inspector,
  shortcuts,
}: MidiEditorShellProps) {
  return (
    <div className="midi-editor-shell midi-editor-shell--wide">
      {controls}
      <div className="midi-editor-body">
        {trackList && <div className="midi-editor-track-list">{trackList}</div>}
        <div className="midi-editor-panel">
          {pianoRoll}
        </div>
      </div>
      <div className="midi-inspector-wrap">{inspector}</div>
      {shortcuts ? <div className="midi-shortcuts">{shortcuts}</div> : null}
    </div>
  );
}
