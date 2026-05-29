/**
 * MIDI editor layout shell — transport, tools, piano roll, inspector.
 */
import type { ReactNode } from "react";
import "./midi-tokens.css";

export interface MidiEditorShellProps {
  transport: ReactNode;
  toolbar: ReactNode;
  pianoRoll: ReactNode;
  inspector: ReactNode;
  shortcuts?: ReactNode;
}

export function MidiEditorShell({
  transport,
  toolbar,
  pianoRoll,
  inspector,
  shortcuts,
}: MidiEditorShellProps) {
  return (
    <div className="midi-editor-root">
      <div className="midi-editor-shell midi-editor-shell--wide">
        {transport}
        <div className="midi-editor-panel">
          {toolbar}
          {pianoRoll}
        </div>
        <div className="midi-inspector-wrap">{inspector}</div>
        {shortcuts ? <div className="midi-shortcuts">{shortcuts}</div> : null}
      </div>
    </div>
  );
}
