import { defaultStemState, type StemEditorState } from "../stem-editor-state";

/** Mute, solo, pitch, time stretch — hot-swap mix immediately when these change. */
export function stemRoutingSignature(states: Record<string, StemEditorState>, stemIds: string[]): string {
  return stemIds
    .map((id) => {
      const s = states[id] ?? defaultStemState();
      return `${id}:m${s.muted ? 1 : 0}s${s.soloed ? 1 : 0}p${s.pitchSemitones}ts${s.timeStretch}`;
    })
    .join("|");
}

/** Trim only — debounce rapid drags. */
export function stemTrimSignature(states: Record<string, StemEditorState>, stemIds: string[]): string {
  return stemIds
    .map((id) => {
      const s = states[id] ?? defaultStemState();
      return `${id}:${s.trim.start}:${s.trim.end}`;
    })
    .join("|");
}

/** Pitch, stretch, trim for one stem (preview hot-swap). */
export function stemPreviewStructuralSignature(st: StemEditorState): string {
  return `p${st.pitchSemitones}ts${st.timeStretch}tr${st.trim.start}-${st.trim.end}`;
}
