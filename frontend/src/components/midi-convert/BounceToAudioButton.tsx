/**
 * BounceToAudioButton — renders MIDI notes to audio via the server.
 */
import type { MidiNoteEvent } from "../../hooks/useMidiConvert";
import type { TrackInstrument } from "./editorTypes";
import { MidiRenderAudioControl } from "./MidiRenderAudioControl";

interface BounceToAudioButtonProps {
  notes: MidiNoteEvent[];
  bpm: number;
  instrument?: TrackInstrument;
  sourceJobId?: string | null;
  format?: "wav" | "mp3";
  className?: string;
}

export function BounceToAudioButton(props: BounceToAudioButtonProps) {
  return <MidiRenderAudioControl {...props} />;
}
