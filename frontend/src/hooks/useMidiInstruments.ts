import { useCallback, useEffect } from "react";
import type { TrackInstrument } from "../components/midi-convert/editorTypes";
import {
  disposeInstrumentSynths,
  getInstrumentSynth,
  releaseAllInstrumentSynths,
} from "../audio/audioEngine";

export function useMidiInstruments() {
  const getSynth = useCallback(
    async (trackKey: string, instrument: TrackInstrument) => {
      return getInstrumentSynth(trackKey, instrument);
    },
    [],
  );

  const releaseAll = useCallback(() => {
    releaseAllInstrumentSynths();
  }, []);

  const disposeAll = useCallback(() => {
    disposeInstrumentSynths();
  }, []);

  useEffect(() => () => disposeAll(), [disposeAll]);

  return { getSynth, releaseAll, disposeAll };
}
